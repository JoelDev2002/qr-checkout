import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

let emailCounter = 0;

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

async function createSale(data: {
  customerId: number;
  cashierId: number;
  code: string;
  receiptNumber: string;
  createdAt?: Date;
  deliveredAt?: Date | null;
  totalCents?: number;
  offerTotalCents?: number;
  cmrTotalCents?: number;
  originalTotalCents?: number;
  priceApplied?: 'NORMAL' | 'CMR';
  docType?: 'TICKET' | 'BOLETA' | 'FACTURA';
  paymentMethod?: 'CASH' | 'CMR_CARD' | 'OTHER_CARD' | 'ONLINE';
  items?: Array<{
    productId: number;
    barcode: string;
    name: string;
    quantity: number;
    originalPriceCents: number;
    normalPriceCents: number;
    cmrPriceCents: number;
    paidPriceCents: number;
    subtotalCents: number;
    campaignName?: string | null;
  }>;
}): Promise<{ id: number }> {
  const total = data.totalCents ?? 7980;
  const cart = await getTestPrisma().cart.create({
    data: {
      customerId: data.customerId,
      status: 'PAID',
    },
    select: { id: true },
  });

  const sale = await getTestPrisma().sale.create({
    data: {
      code: data.code,
      receiptNumber: data.receiptNumber,
      cartId: cart.id,
      customerId: data.customerId,
      cashierId: data.cashierId,
      paymentMethod: data.paymentMethod ?? 'CASH',
      priceApplied: data.priceApplied ?? 'NORMAL',
      docType: data.docType ?? 'TICKET',
      originalTotalCents: data.originalTotalCents ?? 8990,
      offerTotalCents: data.offerTotalCents ?? total,
      cmrTotalCents: data.cmrTotalCents ?? total,
      totalCents: total,
      createdAt: data.createdAt,
      deliveredAt: data.deliveredAt ?? null,
      items: {
        create:
          data.items ?? [
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
let cajero1: { id: number; token: string };
let cajero2: { id: number; token: string };
let tecnologia: { id: number };
let producto: { id: number; barcode: string };

const AHORA = new Date('2026-06-15T15:00:00.000Z');

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);

  await cleanDatabase();
  app = createApp();

  cliente = await createUser('CUSTOMER', 'María Cliente');
  cajero1 = await createUser('CASHIER', 'Carla Cajera');
  cajero2 = await createUser('CASHIER', 'Carlos Cajero');

  tecnologia = await getTestPrisma().category.create({ data: { name: 'Tecnología' } });
  producto = await getTestPrisma().product.create({
    data: {
      barcode: '2000000000013',
      name: 'Audífonos Xiaomi',
      brand: 'Xiaomi',
      categoryId: tecnologia.id,
      originalPriceCents: 8990,
      hasCmrDiscount: true,
      cmrDiscountBps: 501,
      stock: 100,
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

describe('GET /api/checkout/sales/today', () => {
  it('solo las ventas del cajero que consulta', async () => {
    await createSale({
      customerId: cliente.id,
      cashierId: cajero1.id,
      code: 'C-S01',
      receiptNumber: 'T001-000001',
      createdAt: new Date('2026-06-15T10:00:00.000Z'),
      paymentMethod: 'CASH',
      totalCents: 5000,
    });
    await createSale({
      customerId: cliente.id,
      cashierId: cajero2.id,
      code: 'C-S02',
      receiptNumber: 'T001-000002',
      createdAt: new Date('2026-06-15T10:30:00.000Z'),
      paymentMethod: 'CASH',
      totalCents: 6000,
    });
    await createSale({
      customerId: cliente.id,
      cashierId: cajero1.id,
      code: 'C-S03',
      receiptNumber: 'T001-000003',
      createdAt: new Date('2026-06-15T11:00:00.000Z'),
      paymentMethod: 'ONLINE',
      totalCents: 3000,
    });

    const response = await request(app)
      .get('/api/checkout/sales/today')
      .set(...bearer(cajero1.token));

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(2);
    const codes = response.body.data.items.map((item: any) => item.code).sort();
    expect(codes).toEqual(['C-S01', 'C-S03']);
  });

  it('desglose por medio de pago', async () => {
    await createSale({
      customerId: cliente.id,
      cashierId: cajero1.id,
      code: 'C-P01',
      receiptNumber: 'T001-000010',
      createdAt: new Date('2026-06-15T09:00:00.000Z'),
      paymentMethod: 'CASH',
      totalCents: 5000,
    });
    await createSale({
      customerId: cliente.id,
      cashierId: cajero1.id,
      code: 'C-P02',
      receiptNumber: 'T001-000011',
      createdAt: new Date('2026-06-15T09:30:00.000Z'),
      paymentMethod: 'ONLINE',
      totalCents: 3000,
    });
    await createSale({
      customerId: cliente.id,
      cashierId: cajero1.id,
      code: 'C-P03',
      receiptNumber: 'T001-000012',
      createdAt: new Date('2026-06-15T10:00:00.000Z'),
      paymentMethod: 'CASH',
      totalCents: 2000,
    });

    const response = await request(app)
      .get('/api/checkout/sales/today')
      .set(...bearer(cajero1.token));

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(3);
    expect(response.body.data.summary.count).toBe(3);
    expect(response.body.data.summary.totalCents).toBe(10000);
    expect(response.body.data.summary.byPaymentMethod).toEqual({
      CASH: 7000,
      ONLINE: 3000,
    });
  });

  it('requiere rol CASHIER', async () => {
    const response = await request(app)
      .get('/api/checkout/sales/today')
      .set(...bearer(cliente.token));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('requiere autenticación (401)', async () => {
    const response = await request(app).get('/api/checkout/sales/today');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('/sales/today no es capturada por /:code', async () => {
    const response = await request(app)
      .get('/api/checkout/sales/today')
      .set(...bearer(cajero1.token));
    expect(response.status).toBe(200);
  });
});
