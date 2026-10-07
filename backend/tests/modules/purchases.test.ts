import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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
let cliente1: { id: number; token: string };
let cliente2: { id: number; token: string };
let cajero: { id: number; token: string };

let tecnologia: { id: number };
let producto: { id: number; barcode: string };

beforeEach(async () => {
  await cleanDatabase();
  app = createApp();

  cliente1 = await createUser('CUSTOMER', 'María Cliente');
  cliente2 = await createUser('CUSTOMER', 'Pedro Cliente');
  cajero = await createUser('CASHIER', 'Carla Cajera');
  await createUser('ADMIN');

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

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/purchases', () => {
  it('un cliente solo ve sus compras y nunca las de otro', async () => {
    await createSale({
      customerId: cliente1.id,
      cashierId: cajero.id,
      code: 'C-ABC01',
      receiptNumber: 'T001-000001',
      createdAt: new Date('2026-06-15T10:00:00.000Z'),
    });
    await createSale({
      customerId: cliente2.id,
      cashierId: cajero.id,
      code: 'C-ABC02',
      receiptNumber: 'T001-000002',
      createdAt: new Date('2026-06-15T11:00:00.000Z'),
    });
    await createSale({
      customerId: cliente1.id,
      cashierId: cajero.id,
      code: 'C-ABC03',
      receiptNumber: 'T001-000003',
      createdAt: new Date('2026-06-15T12:00:00.000Z'),
    });

    const response = await request(app).get('/api/purchases').set(...bearer(cliente1.token));

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(2);
    const codes = response.body.data.items.map((item: any) => item.code).sort();
    expect(codes).toEqual(['C-ABC01', 'C-ABC03']);
  });

  it('ordena por fecha descendente y soporta paginación', async () => {
    await createSale({
      customerId: cliente1.id,
      cashierId: cajero.id,
      code: 'C-ORD01',
      receiptNumber: 'T001-000001',
      createdAt: new Date('2026-06-15T10:00:00.000Z'),
    });
    await createSale({
      customerId: cliente1.id,
      cashierId: cajero.id,
      code: 'C-ORD02',
      receiptNumber: 'T001-000002',
      createdAt: new Date('2026-06-15T12:00:00.000Z'),
    });
    await createSale({
      customerId: cliente1.id,
      cashierId: cajero.id,
      code: 'C-ORD03',
      receiptNumber: 'T001-000003',
      createdAt: new Date('2026-06-15T11:00:00.000Z'),
    });

    const response = await request(app)
      .get('/api/purchases?page=1&pageSize=2')
      .set(...bearer(cliente1.token));

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(2);
    expect(response.body.data.items[0].code).toBe('C-ORD02');
    expect(response.body.data.items[1].code).toBe('C-ORD03');
    expect(response.body.data.page).toBe(1);
    expect(response.body.data.pageSize).toBe(2);
    expect(response.body.data.total).toBe(3);
  });

  it('requiere rol CUSTOMER', async () => {
    const response = await request(app).get('/api/purchases').set(...bearer(cajero.token));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('requiere autenticación (401)', async () => {
    const response = await request(app).get('/api/purchases');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/purchases/:saleId', () => {
  it('devuelve el detalle con la copia de precios congelados', async () => {
    const { id: saleId } = await createSale({
      customerId: cliente1.id,
      cashierId: cajero.id,
      code: 'C-DET01',
      receiptNumber: 'T001-000010',
      createdAt: new Date('2026-06-15T09:00:00.000Z'),
      items: [
        {
          productId: producto.id,
          barcode: producto.barcode,
          name: 'Audífonos Xiaomi',
          quantity: 2,
          originalPriceCents: 8990,
          normalPriceCents: 3990,
          cmrPriceCents: 3790,
          paidPriceCents: 3790,
          subtotalCents: 7580,
          campaignName: 'Oferta de audífonos',
        },
      ],
      originalTotalCents: 17980,
      offerTotalCents: 7980,
      cmrTotalCents: 7580,
      totalCents: 7580,
      priceApplied: 'CMR',
    });

    const response = await request(app)
      .get(`/api/purchases/${saleId}`)
      .set(...bearer(cliente1.token));

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(saleId);
    expect(response.body.data.code).toBe('C-DET01');
    expect(response.body.data.receiptNumber).toBe('T001-000010');
    expect(response.body.data.items).toHaveLength(1);
    const item = response.body.data.items[0];
    expect(item.name).toBe('Audífonos Xiaomi');
    expect(item.quantity).toBe(2);
    expect(item.originalPriceCents).toBe(8990);
    expect(item.normalPriceCents).toBe(3990);
    expect(item.cmrPriceCents).toBe(3790);
    expect(item.paidPriceCents).toBe(3790);
    expect(item.subtotalCents).toBe(7580);
    expect(item.campaignName).toBe('Oferta de audífonos');
    expect(response.body.data.totals).toEqual({
      originalTotalCents: 17980,
      offerTotalCents: 7980,
      cmrTotalCents: 7580,
      totalCents: 7580,
    });
  });

  it('404 al pedir la compra de otro cliente', async () => {
    const { id: saleId } = await createSale({
      customerId: cliente2.id,
      cashierId: cajero.id,
      code: 'C-DET99',
      receiptNumber: 'T001-000099',
    });

    const response = await request(app)
      .get(`/api/purchases/${saleId}`)
      .set(...bearer(cliente1.token));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('requiere rol CUSTOMER', async () => {
    const { id: saleId } = await createSale({
      customerId: cliente1.id,
      cashierId: cajero.id,
      code: 'C-DET02',
      receiptNumber: 'T001-000020',
    });

    const response = await request(app)
      .get(`/api/purchases/${saleId}`)
      .set(...bearer(cajero.token));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('requiere autenticación (401)', async () => {
    const { id: saleId } = await createSale({
      customerId: cliente1.id,
      cashierId: cajero.id,
      code: 'C-DET03',
      receiptNumber: 'T001-000021',
    });

    const response = await request(app).get(`/api/purchases/${saleId}`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
