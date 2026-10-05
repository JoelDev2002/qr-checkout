import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/infrastructure/password.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { authenticate, requireRole } from '../../src/middlewares/auth.js';
import { errorHandler, notFoundHandler } from '../../src/middlewares/errorHandler.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

const PASSWORD = 'ClaveSegura123';

/** Ruta que solo existe en esta prueba: en producción el admin se añadirá en T1.8. */
function createAdminOnlyTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.get('/api/admin-only', authenticate, requireRole('ADMIN'), (_req, res) => {
    res.json({ data: { scope: 'admin' } });
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

async function createUser(email: string, name: string, role: AuthRole) {
  return getTestPrisma().user.create({
    data: { email, name, role, passwordHash: await hashPassword(PASSWORD) },
  });
}

async function loginAs(email: string): Promise<string> {
  const response = await request(createApp())
    .post('/api/auth/login')
    .send({ email, password: PASSWORD });

  expect(response.status).toBe(200);
  return response.body.data.token as string;
}

let app: Express;

beforeEach(async () => {
  await cleanDatabase();
  app = createAdminOnlyTestApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ruta protegida con requireRole("ADMIN")', () => {
  it('deja entrar al admin', async () => {
    await createUser('admin@falabella.com', 'Ana Admin', 'ADMIN');
    const token = await loginAs('admin@falabella.com');

    const response = await request(app)
      .get('/api/admin-only')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { scope: 'admin' } });
  });

  it('impide que el cajero entre', async () => {
    await createUser('cajero@falabella.com', 'Carla Cashier', 'CASHIER');
    const token = await loginAs('cajero@falabella.com');

    const response = await request(app)
      .get('/api/admin-only')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('impide que un CUSTOMER entre', async () => {
    const customer = await getTestPrisma().user.create({
      data: {
        email: 'cliente@correo.com',
        name: 'Luis Cliente',
        role: 'CUSTOMER',
        googleId: 'google-123',
      },
    });

    const token = signAuthToken({ sub: String(customer.id), role: 'CUSTOMER' });

    const response = await request(app)
      .get('/api/admin-only')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('pide autenticación sin token', async () => {
    const response = await request(app).get('/api/admin-only');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('no existe en la app de producción', async () => {
    const response = await request(createApp()).get('/api/admin-only');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});