import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

/** Momento fijo para comparar `deliveredAt` sin depender del reloj real. */
const AHORA = new Date('2026-06-15T15:00:00.000Z');

let emailCounter = 0;
let receiptCounter = 0;

async function createUser(role: AuthRole, name = `Usuario ${role}`): Promise<{ id: number; token: string }> {
  emailCounter += 1;
  const email = `${role.toLowerCase()}-${emailCounter}@falabella.com`;
  const user = await getTestPrisma().user.create({
    data: { email, name, role, passwordHash: 'hash-fijo-de-prueba' },
  });

  return { id: user.id, token: signAuthToken({ sub: String(user.id), role, email }) };
}

function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

/** Una compra pagada en línea: sin cajero, con código `O-XXXXX` y `deliveredAt` en null. */
async function createOnlineSale(data: { code: string; deliveredAt?: Date | null }): Promise<{ id: number }> {
  receiptCounter += 1;
  const cart = await getTestPrisma().cart.create({
    data: { customerId: cliente.id, status: 'PAID' },
    select: { id: true },
  });

  const sale = await getTestPrisma().sale.create({
    data: {
      code: data.code,
      receiptNumber: `T001-${String(receiptCounter).padStart(6, '0')}`,
      cartId: cart.id,
      customerId: cliente.id,
      cashierId: null,
      paymentMethod: 'ONLINE',
      priceApplied: 'NORMAL',
      docType: 'TICKET',
      originalTotalCents: 8990,
      offerTotalCents: 7980,
      cmrTotalCents: 7980,
      totalCents: 7980,
      deliveredAt: data.deliveredAt ?? null,
      items: {
        create: [
          {
            productId: producto.id,
            barcode: producto.barcode,
            name: 'Audífonos Xiaomi',
            quantity: 1,
            originalPriceCents: 8990,
            normalPriceCents: 7980,
            cmrPriceCents: 7980,
            paidPriceCents: 7980,
            subtotalCents: 7980,
            campaignName: null,
          },
        ],
      },
    },
    select: { id: true },
  });

  return { id: sale.id };
}

let app: Express;
let cliente: { id: number; token: string };
let cajero: { id: number; token: string };
let adminToken: string;
let producto: { id: number; barcode: string };

function verify(code: string, token = cajero.token): request.Test {
  return request(app).post(`/api/checkout/exit/${code}/verify`).set(...bearer(token)).send({});
}

async function expectError(response: request.Response, status: number, code: string): Promise<string> {
  expect(response.status).toBe(status);
  expect(response.body.error.code).toBe(code);

  return String(response.body.error.message);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);

  await cleanDatabase();
  app = createApp();

  cliente = await createUser('CUSTOMER', 'María Cliente');
  cajero = await createUser('CASHIER', 'Carla Cajera');
  adminToken = (await createUser('ADMIN')).token;

  const categoria = await getTestPrisma().category.create({ data: { name: 'Tecnología' } });
  producto = await getTestPrisma().product.create({
    data: {
      barcode: '2000000000013',
      name: 'Audífonos Xiaomi',
      brand: 'Xiaomi',
      categoryId: categoria.id,
      originalPriceCents: 8990,
      stock: 50,
      maxPerPurchase: 20,
    },
    select: { id: true, barcode: true },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/checkout/exit/:code/verify (RN-21)', () => {
  it('la primera verificación entrega la compra y devuelve sus datos', async () => {
    const { id } = await createOnlineSale({ code: 'O-8F3K2' });

    const response = await verify('O-8F3K2');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      code: 'O-8F3K2',
      receiptNumber: 'T001-000001',
      customerName: 'María Cliente',
      totalCents: 7980,
      deliveredAt: AHORA.toISOString(),
    });

    const guardada = await getTestPrisma().sale.findUniqueOrThrow({ where: { id } });
    expect(guardada.deliveredAt?.toISOString()).toBe(AHORA.toISOString());
  });

  it('normaliza el código tecleado en minúsculas o con espacios', async () => {
    await createOnlineSale({ code: 'O-8F3K2' });

    const response = await verify(' o - 8f3k2 ');

    expect(response.status).toBe(200);
    expect(response.body.data.code).toBe('O-8F3K2');
  });

  it('la segunda verificación responde ALREADY_DELIVERED sin cambiar la entrega', async () => {
    const { id } = await createOnlineSale({ code: 'O-8F3K2' });

    await verify('O-8F3K2');
    const entregadoEn = (await getTestPrisma().sale.findUniqueOrThrow({ where: { id } })).deliveredAt;

    const mensaje = await expectError(await verify('O-8F3K2'), 409, 'ALREADY_DELIVERED');

    expect(mensaje).toBe('Esta compra ya fue entregada.');
    expect((await getTestPrisma().sale.findUniqueOrThrow({ where: { id } })).deliveredAt).toEqual(entregadoEn);
  });

  it('dos verificaciones simultáneas: una entrega y la otra recibe ALREADY_DELIVERED', async () => {
    await createOnlineSale({ code: 'O-8F3K2' });

    const [primero, segundo] = await Promise.all([verify('O-8F3K2'), verify('O-8F3K2')]);

    const exitos = [primero, segundo].filter((respuesta) => respuesta.status === 200);
    const rechazados = [primero, segundo].filter((respuesta) => respuesta.status !== 200);

    expect(exitos).toHaveLength(1);
    expect(rechazados).toHaveLength(1);
    expect(rechazados[0]?.body.error.code).toBe('ALREADY_DELIVERED');
  });

  it('no entrega una compra que ya estaba entregada', async () => {
    const { id } = await createOnlineSale({ code: 'O-8F3K2', deliveredAt: new Date(AHORA.getTime() - 60_000) });

    const mensaje = await expectError(await verify('O-8F3K2'), 409, 'ALREADY_DELIVERED');

    expect(mensaje).toBe('Esta compra ya fue entregada.');
    const guardada = await getTestPrisma().sale.findUniqueOrThrow({ where: { id } });
    expect(guardada.deliveredAt?.toISOString()).toBe(new Date(AHORA.getTime() - 60_000).toISOString());
  });

  it('responde 404 si el código de salida no existe', async () => {
    const mensaje = await expectError(await verify('O-ZZZZZ'), 404, 'NOT_FOUND');

    expect(mensaje).toBe('No encontramos ninguna compra con ese código de salida.');
  });

  it('rechaza un código que no tiene formato de salida', async () => {
    const mensaje = await expectError(await verify('C-8F3K2'), 400, 'VALIDATION_ERROR');

    expect(mensaje).toBe('El código de salida no tiene el formato válido.');
  });

  it('solo lo puede hacer un cajero', async () => {
    await createOnlineSale({ code: 'O-8F3K2' });

    await expectError(await verify('O-8F3K2', cliente.token), 403, 'FORBIDDEN');
    await expectError(await verify('O-8F3K2', adminToken), 403, 'FORBIDDEN');

    expect((await getTestPrisma().sale.findFirstOrThrow()).deliveredAt).toBeNull();
  });

  it('pide token', async () => {
    await createOnlineSale({ code: 'O-8F3K2' });

    const response = await request(app).post('/api/checkout/exit/O-8F3K2/verify').send({});

    expect(await expectError(response, 401, 'UNAUTHORIZED')).toBe('Se requiere autenticación.');
  });
});
