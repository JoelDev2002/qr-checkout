import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { hashPassword } from '../../src/infrastructure/password.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { LOGIN_RATE_LIMIT_MAX } from '../../src/modules/auth/routes.js';
import { GENERIC_LOGIN_ERROR_MESSAGE } from '../../src/modules/auth/service.js';
import type { AuthRole } from '../../src/infrastructure/jwt.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

const PASSWORD = 'ClaveSegura123';

type UserToCreate = {
  email: string;
  name: string;
  role: AuthRole;
  password?: string;
  active?: boolean;
};

async function createUser(data: UserToCreate) {
  return getTestPrisma().user.create({
    data: {
      email: data.email,
      name: data.name,
      role: data.role,
      passwordHash: data.password ? await hashPassword(data.password) : null,
      active: data.active ?? true,
    },
  });
}

function signExpiredToken(userId: number, role: AuthRole): string {
  return jwt.sign({ sub: String(userId), role }, env.JWT_SECRET, { expiresIn: '-1s' });
}

let app: Express;

beforeEach(async () => {
  await cleanDatabase();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/auth/login', () => {
  it('entra con el correo y la contraseña del cajero', async () => {
    const cashier = await createUser({
      email: 'cajero@falabella.com',
      name: 'Carla Cashier',
      role: 'CASHIER',
      password: PASSWORD,
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cajero@falabella.com', password: PASSWORD });

    expect(response.status).toBe(200);
    expect(typeof response.body.data.token).toBe('string');
    expect(response.body.data.token.length).toBeGreaterThan(20);
    expect(response.body.data.user).toEqual({
      id: cashier.id,
      email: 'cajero@falabella.com',
      name: 'Carla Cashier',
      role: 'CASHIER',
    });
  });

  it('entra con el correo y la contraseña del admin', async () => {
    await createUser({
      email: 'admin@falabella.com',
      name: 'Ana Admin',
      role: 'ADMIN',
      password: PASSWORD,
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@falabella.com', password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.user.role).toBe('ADMIN');
  });

  it('acepta el correo con mayúsculas y espacios', async () => {
    await createUser({
      email: 'cajero@falabella.com',
      name: 'Carla Cashier',
      role: 'CASHIER',
      password: PASSWORD,
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: '  Cajero@Falabella.com ', password: PASSWORD });

    expect(response.status).toBe(200);
  });

  it('rechaza con 401 si la contraseña es incorrecta', async () => {
    await createUser({
      email: 'cajero@falabella.com',
      name: 'Carla Cashier',
      role: 'CASHIER',
      password: PASSWORD,
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cajero@falabella.com', password: 'ClaveEquivocada' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rechaza con 401 si el correo no existe', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nadie@falabella.com', password: PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rechaza con 401 si el usuario está inactivo', async () => {
    await createUser({
      email: 'cajero@falabella.com',
      name: 'Carla Cashier',
      role: 'CASHIER',
      password: PASSWORD,
      active: false,
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cajero@falabella.com', password: PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rechaza con 401 a un CUSTOMER sin contraseña', async () => {
    await createUser({
      email: 'cliente@correo.com',
      name: 'Luis Cliente',
      role: 'CUSTOMER',
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cliente@correo.com', password: PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('muestra el mismo mensaje en todos los fallos de acceso', async () => {
    await createUser({
      email: 'inactivo@falabella.com',
      name: 'Carla Cashier',
      role: 'CASHIER',
      password: PASSWORD,
      active: false,
    });
    await createUser({
      email: 'cliente@correo.com',
      name: 'Luis Cliente',
      role: 'CUSTOMER',
    });
    await createUser({
      email: 'cajero@falabella.com',
      name: 'Carla Cashier',
      role: 'CASHIER',
      password: PASSWORD,
    });

    const intentos = [
      { email: 'cajero@falabella.com', password: 'ClaveEquivocada' },
      { email: 'nadie@falabella.com', password: PASSWORD },
      { email: 'inactivo@falabella.com', password: PASSWORD },
      { email: 'cliente@correo.com', password: PASSWORD },
    ];

    const mensajes: string[] = [];

    for (const intento of intentos) {
      const response = await request(app).post('/api/auth/login').send(intento);
      expect(response.status).toBe(401);
      mensajes.push(response.body.error.message);
    }

    expect(new Set(mensajes).size).toBe(1);
    expect(mensajes[0]).toBe(GENERIC_LOGIN_ERROR_MESSAGE);
  });

  it('valida el cuerpo con Zod', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'no-es-un-correo', password: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('Escribe un correo válido.');
    expect(response.body.error.message).toContain('La contraseña es obligatoria.');
  });

  it('nunca devuelve el hash de la contraseña', async () => {
    const user = await createUser({
      email: 'cajero@falabella.com',
      name: 'Carla Cashier',
      role: 'CASHIER',
      password: PASSWORD,
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cajero@falabella.com', password: PASSWORD });

    const cuerpo = JSON.stringify(response.body);
    expect(cuerpo).not.toContain('passwordHash');
    expect(cuerpo).not.toContain('$2');
    expect(user.passwordHash).not.toBeNull();
  });

  it('responde 429 con el formato de error al superar el límite de intentos', async () => {
    const respuestaDeLimite = createApp();

    let ultima: request.Response | null = null;

    for (let intento = 1; intento <= LOGIN_RATE_LIMIT_MAX + 1; intento += 1) {
      ultima = await request(respuestaDeLimite)
        .post('/api/auth/login')
        .send({ email: 'cajero@falabella.com', password: 'ClaveEquivocada' });

      if (intento <= LOGIN_RATE_LIMIT_MAX) {
        expect(ultima.status).toBe(401);
      }
    }

    expect(ultima?.status).toBe(429);
    expect(ultima?.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(typeof ultima?.body.error.message).toBe('string');
  });
});

describe('GET /api/auth/me', () => {
  it('devuelve el usuario del token leído de la base de datos', async () => {
    const cashier = await createUser({
      email: 'cajero@falabella.com',
      name: 'Carla Cashier',
      role: 'CASHIER',
      password: PASSWORD,
    });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cajero@falabella.com', password: PASSWORD });
    const token: string = login.body.data.token;

    await getTestPrisma().user.update({
      where: { id: cashier.id },
      data: { name: 'Carla Cashier Actualizada' },
    });

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: cashier.id,
      email: 'cajero@falabella.com',
      name: 'Carla Cashier Actualizada',
      role: 'CASHIER',
    });
  });

  it('rechaza con 401 sin token', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rechaza con 401 un token falso', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer token-falso');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rechaza con 401 un token vencido', async () => {
    const cashier = await createUser({
      email: 'cajero@falabella.com',
      name: 'Carla Cashier',
      role: 'CASHIER',
      password: PASSWORD,
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${signExpiredToken(cashier.id, 'CASHIER')}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rechaza con 401 si el usuario se desactivó después de recibir el token', async () => {
    await createUser({
      email: 'cajero@falabella.com',
      name: 'Carla Cashier',
      role: 'CASHIER',
      password: PASSWORD,
    });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cajero@falabella.com', password: PASSWORD });
    const token: string = login.body.data.token;

    await getTestPrisma().user.updateMany({ data: { active: false } });

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rechaza con 401 si el usuario ya no existe', async () => {
    const cashier = await createUser({
      email: 'cajero@falabella.com',
      name: 'Carla Cashier',
      role: 'CASHIER',
      password: PASSWORD,
    });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cajero@falabella.com', password: PASSWORD });
    const token: string = login.body.data.token;

    await getTestPrisma().user.delete({ where: { id: cashier.id } });

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});