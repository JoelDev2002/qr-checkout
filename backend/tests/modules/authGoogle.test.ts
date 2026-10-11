import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { GoogleIdTokenVerifier, GoogleVerifiedProfile } from '../../src/infrastructure/googleAuth.js';
import type { AuthRole } from '../../src/infrastructure/jwt.js';
import { hashPassword } from '../../src/infrastructure/password.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { LOGIN_RATE_LIMIT_MAX } from '../../src/modules/auth/routes.js';
import {
  DEV_LOGIN_EMAIL,
  GENERIC_LOGIN_ERROR_MESSAGE,
  GOOGLE_LOGIN_FORBIDDEN_MESSAGE,
} from '../../src/modules/auth/service.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

const GOOGLE_CLIENT_ID = 'cliente-de-pruebas.apps.googleusercontent.com';
const PASSWORD = 'ClaveSegura123';

function baseProfile(overrides: Partial<GoogleVerifiedProfile> = {}): GoogleVerifiedProfile {
  return {
    email: 'cliente.nuevo@gmail.com',
    emailVerified: true,
    name: 'Luis Cliente',
    googleId: '101234567890123456789',
    ...overrides,
  };
}

function fakeVerifier(profile: GoogleVerifiedProfile): GoogleIdTokenVerifier {
  return async () => profile;
}

function rejectingVerifier(): GoogleIdTokenVerifier {
  return async () => {
    throw new Error('token rechazado');
  };
}

function appWithGoogle(verifier: GoogleIdTokenVerifier = fakeVerifier(baseProfile())): Express {
  return createApp({ googleClientId: GOOGLE_CLIENT_ID, googleVerifier: verifier });
}

async function createUser(data: {
  email: string;
  name: string;
  role: AuthRole;
  googleId?: string;
  password?: string;
  active?: boolean;
}) {
  return getTestPrisma().user.create({
    data: {
      email: data.email,
      name: data.name,
      role: data.role,
      googleId: data.googleId ?? null,
      passwordHash: data.password ? await hashPassword(data.password) : null,
      active: data.active ?? true,
    },
  });
}

let app: Express;

beforeEach(async () => {
  await cleanDatabase();
  app = appWithGoogle();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/auth/google', () => {
  it('crea un cliente nuevo y devuelve el JWT con el formato del login', async () => {
    const response = await request(app).post('/api/auth/google').send({ credential: 'token-google' });

    expect(response.status).toBe(200);
    expect(typeof response.body.data.token).toBe('string');
    expect(response.body.data.token.length).toBeGreaterThan(20);
    expect(response.body.data.user).toEqual({
      id: expect.any(Number),
      email: 'cliente.nuevo@gmail.com',
      name: 'Luis Cliente',
      role: 'CUSTOMER',
    });

    const guardado = await getTestPrisma().user.findUnique({
      where: { email: 'cliente.nuevo@gmail.com' },
    });
    expect(guardado?.googleId).toBe('101234567890123456789');
    expect(guardado?.passwordHash).toBeNull();

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${response.body.data.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.id).toBe(response.body.data.user.id);
  });

  it('usa al cliente que ya tiene ese googleId', async () => {
    const existente = await createUser({
      email: 'cliente.nuevo@gmail.com',
      name: 'Luis Antiguo',
      role: 'CUSTOMER',
      googleId: '101234567890123456789',
    });

    const response = await request(app).post('/api/auth/google').send({ credential: 'token-google' });

    expect(response.status).toBe(200);
    expect(response.body.data.user.id).toBe(existente.id);
    expect(response.body.data.user.name).toBe('Luis Antiguo');

    const conEseGoogleId = await getTestPrisma().user.count({ where: { googleId: '101234567890123456789' } });
    expect(conEseGoogleId).toBe(1);
  });

  it('vincula por correo a un CUSTOMER que aún no tiene googleId', async () => {
    const existente = await createUser({
      email: 'cliente.nuevo@gmail.com',
      name: 'Luis Cliente',
      role: 'CUSTOMER',
    });

    const response = await request(app).post('/api/auth/google').send({ credential: 'token-google' });

    expect(response.status).toBe(200);
    expect(response.body.data.user.id).toBe(existente.id);

    const vinculado = await getTestPrisma().user.findUnique({ where: { id: existente.id } });
    expect(vinculado?.googleId).toBe('101234567890123456789');
    expect(vinculado?.passwordHash).toBeNull();
  });

  it('rechaza con 403 el correo de un cajero sin modificarlo', async () => {
    const cajero = await createUser({
      email: 'cliente.nuevo@gmail.com',
      name: 'Carla Cashier',
      role: 'CASHIER',
      password: PASSWORD,
    });

    const response = await request(app).post('/api/auth/google').send({ credential: 'token-google' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(response.body.error.message).toBe(GOOGLE_LOGIN_FORBIDDEN_MESSAGE);

    const intacto = await getTestPrisma().user.findUnique({ where: { id: cajero.id } });
    expect(intacto?.googleId).toBeNull();
    expect(intacto?.role).toBe('CASHIER');
  });

  it('rechaza con 403 el correo de un admin sin modificarlo', async () => {
    const admin = await createUser({
      email: 'cliente.nuevo@gmail.com',
      name: 'Ana Admin',
      role: 'ADMIN',
      password: PASSWORD,
    });

    const response = await request(app).post('/api/auth/google').send({ credential: 'token-google' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');

    const intacto = await getTestPrisma().user.findUnique({ where: { id: admin.id } });
    expect(intacto?.googleId).toBeNull();
    expect(intacto?.role).toBe('ADMIN');
  });

  it('rechaza con 401 un correo de Google sin verificar y no crea nada', async () => {
    const appSinVerificar = appWithGoogle(fakeVerifier(baseProfile({ emailVerified: false })));

    const response = await request(appSinVerificar).post('/api/auth/google').send({ credential: 'token-google' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');

    const creado = await getTestPrisma().user.findUnique({ where: { email: 'cliente.nuevo@gmail.com' } });
    expect(creado).toBeNull();
  });

  it('rechaza con 401 genérico a un cliente inactivo', async () => {
    await createUser({
      email: 'cliente.nuevo@gmail.com',
      name: 'Luis Cliente',
      role: 'CUSTOMER',
      googleId: '101234567890123456789',
      active: false,
    });

    const response = await request(app).post('/api/auth/google').send({ credential: 'token-google' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(response.body.error.message).toBe(GENERIC_LOGIN_ERROR_MESSAGE);
  });

  it('rechaza con 401 genérico un token rechazado por Google', async () => {
    const response = await request(appWithGoogle(rejectingVerifier()))
      .post('/api/auth/google')
      .send({ credential: 'token-falso' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(response.body.error.message).toBe(GENERIC_LOGIN_ERROR_MESSAGE);
  });

  it('rechaza con 400 una credencial vacía', async () => {
    const sinCuerpo = await request(app).post('/api/auth/google').send({});
    expect(sinCuerpo.status).toBe(400);
    expect(sinCuerpo.body.error.code).toBe('VALIDATION_ERROR');

    const vacia = await request(app).post('/api/auth/google').send({ credential: '' });
    expect(vacia.status).toBe(400);
    expect(vacia.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('responde 503 con un mensaje claro si falta GOOGLE_CLIENT_ID', async () => {
    const sinConfig = createApp({ googleClientId: '', googleVerifier: fakeVerifier(baseProfile()) });

    const response = await request(sinConfig).post('/api/auth/google').send({ credential: 'token-google' });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.body.error.message).toContain('Google');
    expect(response.body.error.message).toContain('GOOGLE_CLIENT_ID');
  });

  it('comparte el límite de intentos con POST /auth/login', async () => {
    for (let intento = 1; intento <= LOGIN_RATE_LIMIT_MAX; intento += 1) {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'cajero@falabella.com', password: 'ClaveEquivocada' });
      expect(login.status).toBe(401);
    }

    const google = await request(app).post('/api/auth/google').send({ credential: 'token-google' });

    expect(google.status).toBe(429);
    expect(google.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('nunca devuelve passwordHash ni googleId en la respuesta', async () => {
    await createUser({
      email: 'cliente.nuevo@gmail.com',
      name: 'Luis Cliente',
      role: 'CUSTOMER',
      googleId: '101234567890123456789',
    });

    const response = await request(app).post('/api/auth/google').send({ credential: 'token-google' });

    const cuerpo = JSON.stringify(response.body);
    expect(response.status).toBe(200);
    expect(cuerpo).not.toContain('passwordHash');
    expect(cuerpo).not.toContain('googleId');
    expect(cuerpo).not.toContain('$2');
  });
});

describe('POST /api/auth/dev-login', () => {
  it('existe solo con NODE_ENV=development y DEV_LOGIN=true: crea o reutiliza el cliente de prueba', async () => {
    const devApp = createApp({ nodeEnv: 'development', devLogin: true });

    const primero = await request(devApp).post('/api/auth/dev-login').send({});
    expect(primero.status).toBe(200);
    expect(primero.body.data.user).toEqual({
      id: expect.any(Number),
      email: DEV_LOGIN_EMAIL,
      name: expect.any(String),
      role: 'CUSTOMER',
    });
    expect(typeof primero.body.data.token).toBe('string');
    expect(JSON.stringify(primero.body)).not.toContain('passwordHash');
    expect(JSON.stringify(primero.body)).not.toContain('googleId');

    const segundo = await request(devApp).post('/api/auth/dev-login').send({});
    expect(segundo.status).toBe(200);
    expect(segundo.body.data.user.id).toBe(primero.body.data.user.id);

    const enBase = await getTestPrisma().user.count({ where: { email: DEV_LOGIN_EMAIL } });
    expect(enBase).toBe(1);
  });

  it.each([
    ['test', true],
    ['development', false],
    ['production', true],
    ['production', false],
    ['test', false],
  ] as const)('responde 404 con NODE_ENV=%s y DEV_LOGIN=%s', async (nodeEnv, devLogin) => {
    const sinDesarrollo = createApp({ nodeEnv, devLogin });

    const response = await request(sinDesarrollo).post('/api/auth/dev-login').send({});

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('responde 429 con el formato de error al superar el límite de intentos', async () => {
    const devApp = createApp({ nodeEnv: 'development', devLogin: true });

    let ultima: request.Response | null = null;

    for (let intento = 1; intento <= LOGIN_RATE_LIMIT_MAX + 1; intento += 1) {
      ultima = await request(devApp).post('/api/auth/dev-login').send({});

      if (intento <= LOGIN_RATE_LIMIT_MAX) {
        expect(ultima.status).toBe(200);
      }
    }

    expect(ultima?.status).toBe(429);
    expect(ultima?.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(typeof ultima?.body.error.message).toBe('string');
  });
});