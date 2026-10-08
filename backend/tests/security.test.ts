import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { signAuthToken, type AuthRole } from '../src/infrastructure/jwt.js';
import { prisma } from '../src/infrastructure/prisma.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import { cleanDatabase, getTestPrisma } from './helpers/db.js';

let emailCounter = 0;

async function createUser(role: AuthRole): Promise<{ id: number; token: string }> {
  emailCounter += 1;
  const email = `seguridad-${emailCounter}@falabella.com`;
  const user = await getTestPrisma().user.create({
    data: { email, name: `Usuario ${role}`, role, passwordHash: 'hash-fijo-de-prueba' },
  });

  return { id: user.id, token: signAuthToken({ sub: String(user.id), role, email }) };
}

function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

let app: Express;

beforeEach(async () => {
  await cleanDatabase();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('la sesión se comprueba en la base en cada petición', () => {
  it('un usuario desactivado pierde el acceso a una ruta protegida de cada módulo', async () => {
    const admin = await createUser('ADMIN');
    const cliente = await createUser('CUSTOMER');
    const cajero = await createUser('CASHIER');

    // Con la sesión vigente las cuatro rutas responden: después del 401 viene de la desactivación.
    expect((await request(app).get('/api/categories').set(...bearer(cliente.token))).status).toBe(200);
    expect((await request(app).get('/api/products').set(...bearer(admin.token))).status).toBe(200);
    expect((await request(app).get('/api/cart').set(...bearer(cliente.token))).status).toBe(200);
    expect(
      (await request(app).get('/api/checkout/sales/today').set(...bearer(cajero.token))).status,
    ).toBe(200);

    await getTestPrisma().user.updateMany({ data: { active: false } });

    const respuestas = [
      await request(app).get('/api/categories').set(...bearer(cliente.token)),
      await request(app).get('/api/products').set(...bearer(admin.token)),
      await request(app).get('/api/cart').set(...bearer(cliente.token)),
      await request(app).get('/api/checkout/sales/today').set(...bearer(cajero.token)),
    ];

    for (const respuesta of respuestas) {
      expect(respuesta.status).toBe(401);
      expect(respuesta.body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('un usuario eliminado pierde el acceso con el token que ya tenía', async () => {
    const cliente = await createUser('CUSTOMER');
    await getTestPrisma().user.delete({ where: { id: cliente.id } });

    const respuesta = await request(app).get('/api/cart').set(...bearer(cliente.token));

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('UNAUTHORIZED');
  });

  it('si el rol cambió, el token deja de servir', async () => {
    const cajero = await createUser('CASHIER');
    const admin = await createUser('ADMIN');

    await getTestPrisma().user.update({
      where: { id: cajero.id },
      data: { role: 'ADMIN' },
    });
    await getTestPrisma().user.update({
      where: { id: admin.id },
      data: { role: 'CASHIER' },
    });

    // Si solo se comparara el rol del token con el de la ruta sería 403; el 401 sale de la base.
    const comoCajero = await request(app)
      .get('/api/checkout/sales/today')
      .set(...bearer(cajero.token));
    const comoAdmin = await request(app).get('/api/products').set(...bearer(admin.token));

    expect(comoCajero.status).toBe(401);
    expect(comoCajero.body.error.code).toBe('UNAUTHORIZED');
    expect(comoAdmin.status).toBe(401);
    expect(comoAdmin.body.error.code).toBe('UNAUTHORIZED');
  });

  it('responde con el mismo mensaje genérico que para un token inválido', async () => {
    const cliente = await createUser('CUSTOMER');

    const invalido = await request(app).get('/api/cart').set('Authorization', 'Bearer token-falso');

    await getTestPrisma().user.update({ where: { id: cliente.id }, data: { active: false } });
    const desactivado = await request(app).get('/api/cart').set(...bearer(cliente.token));

    expect(invalido.status).toBe(401);
    expect(desactivado.status).toBe(401);
    expect(desactivado.body.error.message).toBe(invalido.body.error.message);
  });

  it('rechaza un token firmado con alg none o con otro algoritmo', async () => {
    const cliente = await createUser('CUSTOMER');

    const ninguno = jwt.sign({ sub: String(cliente.id), role: 'CUSTOMER' }, '', {
      algorithm: 'none',
    });
    const otro = jwt.sign({ sub: String(cliente.id), role: 'CUSTOMER' }, env.JWT_SECRET, {
      algorithm: 'HS512',
    });

    for (const token of [ninguno, otro]) {
      const respuesta = await request(app).get('/api/cart').set(...bearer(token));

      expect(respuesta.status).toBe(401);
      expect(respuesta.body.error.code).toBe('UNAUTHORIZED');
    }
  });
});

describe('CORS y cabeceras de seguridad', () => {
  it('solo responde con cabeceras CORS a FRONTEND_URL', async () => {
    const permitido = await request(app).get('/api/health').set('Origin', env.FRONTEND_URL);
    const denegado = await request(app).get('/api/health').set('Origin', 'https://otro-sitio.test');

    expect(permitido.headers['access-control-allow-origin']).toBe(env.FRONTEND_URL);
    expect(denegado.status).toBe(200);
    expect(denegado.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('el preflight de un origen no permitido no recibe permiso', async () => {
    const denegado = await request(app)
      .options('/api/categories')
      .set('Origin', 'https://otro-sitio.test')
      .set('Access-Control-Request-Method', 'POST');
    const permitido = await request(app)
      .options('/api/categories')
      .set('Origin', env.FRONTEND_URL)
      .set('Access-Control-Request-Method', 'POST');

    expect(denegado.headers['access-control-allow-origin']).toBeUndefined();
    expect(permitido.headers['access-control-allow-origin']).toBe(env.FRONTEND_URL);
  });

  it('helmet está activo', async () => {
    const respuesta = await request(app).get('/api/health');

    expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('cuerpo de la petición', () => {
  it('responde 413 con el formato de error si el cuerpo supera los 100 kb', async () => {
    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cajero@falabella.com', password: 'x'.repeat(200_000) });

    expect(respuesta.status).toBe(413);
    expect(respuesta.body.error.code).toBe('VALIDATION_ERROR');
    expect(respuesta.body.error.message).toContain('tamaño máximo');
    expect(JSON.stringify(respuesta.body)).not.toContain('entity.too.large');
  });

  it('responde 400 VALIDATION_ERROR con un JSON mal formado', async () => {
    const respuesta = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDATION_ERROR');
    expect(respuesta.body.error.message).toContain('JSON');
    expect(JSON.stringify(respuesta.body)).not.toContain('SyntaxError');
  });
});

describe('un error 500 no filtra detalles internos', () => {
  /** Ruta que solo existe en esta prueba, para forzar un error inesperado. */
  function createCrashingApp(): Express {
    const crashingApp = express();
    crashingApp.use(express.json());
    crashingApp.get('/api/boom', () => {
      throw new Error('detalle interno que no debe salir');
    });
    crashingApp.use(errorHandler);
    return crashingApp;
  }

  it('responde con un mensaje genérico, sin stack, y registra el error en consola', async () => {
    const registro = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const respuesta = await request(createCrashingApp()).get('/api/boom');

      expect(respuesta.status).toBe(500);
      expect(respuesta.body).toEqual({
        error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' },
      });
      expect(respuesta.body.stack).toBeUndefined();
      expect(JSON.stringify(respuesta.body)).not.toContain('detalle interno');
      expect(registro).toHaveBeenCalled();
      expect(registro.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    } finally {
      registro.mockRestore();
    }
  });
});
