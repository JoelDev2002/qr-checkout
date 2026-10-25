import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

type SupplierResponse = {
  id: number;
  ruc: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type RoleUser = { userId: number; token: string };

// RUC válidos (dígito verificador correcto) para no depender de datos reales.
const RUC_A = '20100047218';
const RUC_B = '20131312955';

let emailCounter = 0;

async function createRoleUser(role: AuthRole): Promise<RoleUser> {
  emailCounter += 1;
  const email = `${role.toLowerCase()}-proveedores-${emailCounter}@falabella.com`;
  const user = await getTestPrisma().user.create({
    data: { email, name: `Usuario ${role}`, role, passwordHash: 'hash-fijo-de-prueba' },
  });

  return { userId: user.id, token: signAuthToken({ sub: String(user.id), role, email }) };
}

function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

let app: Express;
let admin: RoleUser;
let cashier: RoleUser;
let customer: RoleUser;

async function postSupplier(overrides: Record<string, unknown> = {}): Promise<SupplierResponse> {
  const response = await request(app)
    .post('/api/suppliers')
    .set(...bearer(admin.token))
    .send({ ruc: RUC_A, businessName: 'Distribuidora Andina SAC', ...overrides });

  expect(response.status).toBe(200);

  return response.body.data as SupplierResponse;
}

beforeEach(async () => {
  await cleanDatabase();
  app = createApp();

  admin = await createRoleUser('ADMIN');
  cashier = await createRoleUser('CASHIER');
  customer = await createRoleUser('CUSTOMER');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/suppliers', () => {
  it('crea un proveedor activo con los datos normalizados', async () => {
    const response = await request(app)
      .post('/api/suppliers')
      .set(...bearer(admin.token))
      .send({
        ruc: ' 2010 0047 218 ',
        businessName: '  Distribuidora Andina SAC ',
        contactName: 'Rosa Pérez',
        phone: '01 555-1234',
        email: 'Ventas@Andina.PE',
        address: '',
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: expect.any(Number),
      ruc: RUC_A,
      businessName: 'Distribuidora Andina SAC',
      contactName: 'Rosa Pérez',
      phone: '01 555-1234',
      email: 'ventas@andina.pe',
      address: null,
      active: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('responde 409 CONFLICT si el RUC ya existe', async () => {
    await postSupplier();

    const response = await request(app)
      .post('/api/suppliers')
      .set(...bearer(admin.token))
      .send({ ruc: RUC_A, businessName: 'Otro nombre' });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: 'CONFLICT',
      message: `Ya existe un proveedor con el RUC ${RUC_A}.`,
    });
    expect(await getTestPrisma().supplier.count()).toBe(1);
  });

  it('responde 400 con un RUC de dígito verificador incorrecto', async () => {
    const response = await request(app)
      .post('/api/suppliers')
      .set(...bearer(admin.token))
      .send({ ruc: '20100047219', businessName: 'Andina' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('revisa el último dígito');
  });

  it('explica en español un campo que no se permite', async () => {
    const response = await request(app)
      .post('/api/suppliers')
      .set(...bearer(admin.token))
      .send({ ruc: RUC_A, businessName: 'Andina', active: false });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Estos campos no se permiten aquí: active.');
  });
});

describe('GET /api/suppliers', () => {
  it('lista por razón social y filtra por estado y búsqueda', async () => {
    const zeta = await postSupplier({ ruc: RUC_A, businessName: 'Zeta Importaciones' });
    await postSupplier({ ruc: RUC_B, businessName: 'Alfa Distribuciones' });
    await request(app)
      .patch(`/api/suppliers/${zeta.id}/active`)
      .set(...bearer(admin.token))
      .send({ active: false });

    const todos = await request(app).get('/api/suppliers').set(...bearer(admin.token));
    expect(todos.status).toBe(200);
    expect((todos.body.data as SupplierResponse[]).map((s) => s.businessName)).toEqual([
      'Alfa Distribuciones',
      'Zeta Importaciones',
    ]);

    const activos = await request(app).get('/api/suppliers?active=true').set(...bearer(admin.token));
    expect((activos.body.data as SupplierResponse[]).map((s) => s.businessName)).toEqual([
      'Alfa Distribuciones',
    ]);

    const porRuc = await request(app)
      .get(`/api/suppliers?search=${RUC_A.slice(0, 6)}`)
      .set(...bearer(admin.token));
    expect((porRuc.body.data as SupplierResponse[]).map((s) => s.id)).toEqual([zeta.id]);
  });

  it('devuelve un proveedor por id y 404 si no existe', async () => {
    const creado = await postSupplier();

    const encontrado = await request(app).get(`/api/suppliers/${creado.id}`).set(...bearer(admin.token));
    expect(encontrado.status).toBe(200);
    expect(encontrado.body.data.ruc).toBe(RUC_A);

    const inexistente = await request(app)
      .get(`/api/suppliers/${creado.id + 1000}`)
      .set(...bearer(admin.token));
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.code).toBe('NOT_FOUND');
  });
});

describe('PUT /api/suppliers/:id', () => {
  it('edita los datos pero no el RUC', async () => {
    const creado = await postSupplier();

    const editado = await request(app)
      .put(`/api/suppliers/${creado.id}`)
      .set(...bearer(admin.token))
      .send({ businessName: 'Andina Distribuciones SAC', phone: '987654321' });

    expect(editado.status).toBe(200);
    expect(editado.body.data).toMatchObject({
      id: creado.id,
      ruc: RUC_A,
      businessName: 'Andina Distribuciones SAC',
      phone: '987654321',
    });

    const conRuc = await request(app)
      .put(`/api/suppliers/${creado.id}`)
      .set(...bearer(admin.token))
      .send({ ruc: RUC_B, businessName: 'Andina' });

    expect(conRuc.status).toBe(400);
    expect(conRuc.body.error.message).toBe('Estos campos no se permiten aquí: ruc.');
  });
});

describe('PATCH /api/suppliers/:id/active', () => {
  it('desactiva y reactiva sin borrar', async () => {
    const creado = await postSupplier();

    const off = await request(app)
      .patch(`/api/suppliers/${creado.id}/active`)
      .set(...bearer(admin.token))
      .send({ active: false });
    expect(off.status).toBe(200);
    expect(off.body.data.active).toBe(false);

    const on = await request(app)
      .patch(`/api/suppliers/${creado.id}/active`)
      .set(...bearer(admin.token))
      .send({ active: true });
    expect(on.body.data.active).toBe(true);
    expect(await getTestPrisma().supplier.count()).toBe(1);
  });
});

describe('permisos', () => {
  it('sin token responde 401', async () => {
    const response = await request(app).get('/api/suppliers');

    expect(response.status).toBe(401);
  });

  it('el cajero y el cliente no acceden (403)', async () => {
    for (const user of [cashier, customer]) {
      const lista = await request(app).get('/api/suppliers').set(...bearer(user.token));
      const alta = await request(app)
        .post('/api/suppliers')
        .set(...bearer(user.token))
        .send({ ruc: RUC_A, businessName: 'Andina' });

      expect(lista.status).toBe(403);
      expect(alta.status).toBe(403);
    }

    expect(await getTestPrisma().supplier.count()).toBe(0);
  });
});
