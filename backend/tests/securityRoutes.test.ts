import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { GoogleIdTokenVerifier } from '../src/infrastructure/googleAuth.js';
import { signAuthToken, type AuthRole } from '../src/infrastructure/jwt.js';
import { prisma } from '../src/infrastructure/prisma.js';
import { cleanDatabase, getTestPrisma } from './helpers/db.js';

/**
 * Matriz de rutas (T3.3 parte B). Recorre las rutas realmente registradas en la app y comprueba:
 * sin token todo lo protegido responde 401, cada ruta rechaza con 403 los roles que no le tocan
 * (ARCHITECTURE.md §6) y la tabla de abajo cubre exactamente el conjunto de rutas de la app, de modo
 * que una ruta nueva sin declarar aquí hace fallar la prueba.
 */

type Role = AuthRole;

const ALL_ROLES: Role[] = ['CUSTOMER', 'CASHIER', 'ADMIN'];

/** Las únicas rutas que no exigen sesión (ARCHITECTURE.md §6 y §9). */
const PUBLIC_ROUTES = new Set([
  'GET /api/health',
  'POST /api/auth/login',
  'POST /api/auth/google',
  'POST /api/auth/dev-login',
]);

type ExpectedRoute = { method: string; path: string; roles: Role[] };

const ADMIN: Role[] = ['ADMIN'];
const CASHIER: Role[] = ['CASHIER'];
const CUSTOMER: Role[] = ['CUSTOMER'];

const EXPECTED_ROUTES: ExpectedRoute[] = [
  { method: 'GET', path: '/api/health', roles: ALL_ROLES },
  { method: 'POST', path: '/api/auth/login', roles: ALL_ROLES },
  { method: 'POST', path: '/api/auth/google', roles: ALL_ROLES },
  { method: 'POST', path: '/api/auth/dev-login', roles: ALL_ROLES },
  { method: 'GET', path: '/api/auth/me', roles: ALL_ROLES },
  { method: 'GET', path: '/api/products/barcode/:barcode', roles: ALL_ROLES },
  { method: 'POST', path: '/api/products/price-preview', roles: ADMIN },
  { method: 'GET', path: '/api/products', roles: ADMIN },
  { method: 'POST', path: '/api/products', roles: ADMIN },
  { method: 'GET', path: '/api/products/:id', roles: ADMIN },
  { method: 'PUT', path: '/api/products/:id', roles: ADMIN },
  { method: 'PATCH', path: '/api/products/:id/active', roles: ADMIN },
  { method: 'GET', path: '/api/products/:id/stock-adjustments', roles: ADMIN },
  { method: 'POST', path: '/api/products/:id/stock-adjustments', roles: ADMIN },
  { method: 'GET', path: '/api/categories', roles: ALL_ROLES },
  { method: 'POST', path: '/api/categories', roles: ADMIN },
  { method: 'PUT', path: '/api/categories/:id', roles: ADMIN },
  { method: 'PATCH', path: '/api/categories/:id/active', roles: ADMIN },
  { method: 'POST', path: '/api/categories/:id/fields', roles: ADMIN },
  { method: 'PUT', path: '/api/categories/:id/fields/:fieldId', roles: ADMIN },
  { method: 'PATCH', path: '/api/categories/:id/fields/:fieldId/active', roles: ADMIN },
  { method: 'GET', path: '/api/campaigns', roles: ADMIN },
  { method: 'POST', path: '/api/campaigns', roles: ADMIN },
  { method: 'GET', path: '/api/campaigns/:id', roles: ADMIN },
  { method: 'PUT', path: '/api/campaigns/:id', roles: ADMIN },
  { method: 'PATCH', path: '/api/campaigns/:id/active', roles: ADMIN },
  { method: 'GET', path: '/api/users', roles: ADMIN },
  { method: 'POST', path: '/api/users', roles: ADMIN },
  { method: 'PATCH', path: '/api/users/:id/active', roles: ADMIN },
  { method: 'GET', path: '/api/cart', roles: CUSTOMER },
  { method: 'POST', path: '/api/cart/items', roles: CUSTOMER },
  { method: 'DELETE', path: '/api/cart/items', roles: CUSTOMER },
  { method: 'PATCH', path: '/api/cart/items/:productId', roles: CUSTOMER },
  { method: 'DELETE', path: '/api/cart/items/:productId', roles: CUSTOMER },
  { method: 'POST', path: '/api/cart/qr', roles: CUSTOMER },
  { method: 'DELETE', path: '/api/cart/qr', roles: CUSTOMER },
  { method: 'GET', path: '/api/purchases', roles: CUSTOMER },
  { method: 'GET', path: '/api/purchases/:saleId', roles: CUSTOMER },
  { method: 'GET', path: '/api/checkout/sales/today', roles: CASHIER },
  { method: 'GET', path: '/api/checkout/:code', roles: CASHIER },
  { method: 'POST', path: '/api/checkout/:code/confirm', roles: CASHIER },
  { method: 'POST', path: '/api/checkout/:code/reject', roles: CASHIER },
  { method: 'POST', path: '/api/payments/online', roles: CUSTOMER },
  { method: 'GET', path: '/api/dashboard/summary', roles: ADMIN },
];

type RegisteredRoute = { method: string; path: string };

/** capas internas de Express 4: se accede a `_router.stack` porque la app no expone otra lista. */
type ExpressLayer = {
  name?: string;
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: ExpressLayer[] };
  regexp?: { source: string };
};

/** Un router montado con app.use guarda su prefijo solo en la regexp: se reconstruye desde ahí. */
function mountPrefix(layer: ExpressLayer): string {
  const source = (layer.regexp?.source ?? '')
    .replace(/^\^/, '')
    .replace(/\\\//g, '/');
  const path = source
    .replace(/\/\?\(\?=\/\|\$\)$/, '')
    .replace(/\(\?=\/\|\$\)$/, '')
    .replace(/\/$/, '');

  return path === '' ? '/' : path;
}

function joinPath(prefix: string, path: string): string {
  const suffix = path === '/' ? '' : path;

  return `${prefix}${suffix}` || '/';
}

function collectRoutes(app: Express): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];

  const walk = (stack: ExpressLayer[], prefix: string): void => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({ method: method.toUpperCase(), path: joinPath(prefix, layer.route.path) });
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        walk(layer.handle.stack, joinPath(prefix, mountPrefix(layer)));
      }
    }
  };

  const appStack = (app as unknown as { _router: { stack: ExpressLayer[] } })._router.stack;
  walk(appStack, '');

  return routes;
}

/** Sustituye los parámetros por un valor concreto: la autenticación corta antes del controlador. */
function concretePath(path: string): string {
  return path.replace(/:[^/]+/g, '1');
}

const GOOGLE_CLIENT_ID = 'matriz-rutas.apps.googleusercontent.com';

const fakeVerifier: GoogleIdTokenVerifier = async () => ({
  email: 'nadie@gmail.com',
  emailVerified: true,
  name: 'Nadie',
  googleId: '000000000000000000000',
});

let app: Express;
let tokens: Record<Role, string>;

async function createUser(role: Role): Promise<string> {
  const email = `matriz-${role.toLowerCase()}@falabella.com`;
  const user = await getTestPrisma().user.create({
    data: { email, name: `Usuario ${role}`, role, passwordHash: 'hash-fijo-de-prueba' },
  });

  return signAuthToken({ sub: String(user.id), role, email });
}

function send(method: string, path: string, token?: string): request.Test {
  const agent = request(app);
  const factory = (agent as unknown as Record<string, (value: string) => request.Test>)[
    method.toLowerCase()
  ];

  if (!factory) {
    throw new Error(`Método HTTP no soportado en la matriz: ${method}`);
  }

  const test = factory.call(agent, path);

  return token ? test.set('Authorization', `Bearer ${token}`) : test;
}

beforeEach(async () => {
  await cleanDatabase();
  app = createApp({
    nodeEnv: 'development',
    devLogin: true,
    googleClientId: GOOGLE_CLIENT_ID,
    googleVerifier: fakeVerifier,
  });

  tokens = {
    CUSTOMER: await createUser('CUSTOMER'),
    CASHIER: await createUser('CASHIER'),
    ADMIN: await createUser('ADMIN'),
  };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('matriz de rutas de la app', () => {
  it('la tabla de la prueba cubre exactamente las rutas registradas', () => {
    const actual = collectRoutes(app)
      .map((route) => `${route.method} ${route.path}`)
      .sort();
    const expected = EXPECTED_ROUTES.map((route) => `${route.method} ${route.path}`).sort();

    expect(actual).toEqual(expected);
  });

  it('toda ruta protegida responde 401 sin token', async () => {
    const protegidas = EXPECTED_ROUTES.filter(
      (route) => !PUBLIC_ROUTES.has(`${route.method} ${route.path}`),
    );

    for (const route of protegidas) {
      const response = await send(route.method, concretePath(route.path));

      expect(response.status, `${route.method} ${route.path}`).toBe(401);
      expect(response.body.error.code, `${route.method} ${route.path}`).toBe('UNAUTHORIZED');
    }
  });

  it('las rutas públicas no exigen token', async () => {
    const respuestas = [
      await request(app).get('/api/health'),
      await request(app).post('/api/auth/login').send({}),
      await request(app).post('/api/auth/google').send({}),
      await request(app).post('/api/auth/dev-login').send({}),
    ];

    for (const response of respuestas) {
      expect([401, 403], `Ruta pública devolvió ${response.status}`).not.toContain(response.status);
    }
  });

  it('cada ruta rechaza con 403 los roles que no le corresponden', async () => {
    for (const route of EXPECTED_ROUTES) {
      if (PUBLIC_ROUTES.has(`${route.method} ${route.path}`)) {
        continue;
      }

      const disallowed = ALL_ROLES.filter((role) => !route.roles.includes(role));

      for (const role of disallowed) {
        const response = await send(route.method, concretePath(route.path), tokens[role]);

        expect(response.status, `${route.method} ${route.path} con rol ${role}`).toBe(403);
        expect(response.body.error.code, `${route.method} ${route.path} con rol ${role}`).toBe(
          'FORBIDDEN',
        );
      }
    }
  });
});
