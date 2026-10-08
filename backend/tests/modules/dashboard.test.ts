import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { ean13CheckDigit } from '../../src/domain/barcode.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

type SummaryResponse = {
  range: { from: string; to: string };
  totals: {
    salesCount: number;
    totalCollectedCents: number;
    cmrSalesCount: number;
    otherSalesCount: number;
    cmrSalesPercent: number;
  };
  salesByDay: Array<{ date: string; salesCount: number; totalCents: number }>;
  byPaymentMethod: Array<{ paymentMethod: string; salesCount: number; totalCents: number }>;
  topScanned: Array<{ productId: number; name: string; barcode: string; scans: number }>;
  lowStock: Array<{ id: number; name: string; barcode: string; stock: number }>;
};

const AHORA = new Date('2026-06-15T15:00:00.000Z');

let app: Express;
let adminToken: string;
let cashierToken: string;
let customerToken: string;
let cliente: { id: number };
let categoria: { id: number };

let emailCounter = 0;
let barcodeCounter = 0;

async function createUser(role: AuthRole): Promise<{ id: number; token: string }> {
  emailCounter += 1;
  const email = `${role.toLowerCase()}-${emailCounter}@falabella.com`;
  const user = await getTestPrisma().user.create({
    data: { email, name: `Usuario ${role}`, role, passwordHash: 'hash-fijo-de-prueba' },
  });

  return { id: user.id, token: signAuthToken({ sub: String(user.id), role, email }) };
}

function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

function nextBarcode(): string {
  barcodeCounter += 1;
  const body = `200000${String(barcodeCounter).padStart(6, '0')}`;

  return `${body}${ean13CheckDigit(body)}`;
}

async function createProduct(name: string, data?: { stock?: number; active?: boolean }): Promise<{
  id: number;
  barcode: string;
  name: string;
}> {
  return getTestPrisma().product.create({
    data: {
      barcode: nextBarcode(),
      name,
      brand: 'Falabella',
      categoryId: categoria.id,
      originalPriceCents: 10000,
      stock: data?.stock ?? 10,
      active: data?.active ?? true,
      maxPerPurchase: 10,
    },
    select: { id: true, barcode: true, name: true },
  });
}

async function createSale(data: {
  customerId: number;
  code: string;
  receiptNumber: string;
  createdAt: Date;
  totalCents: number;
  priceApplied?: 'NORMAL' | 'CMR';
  paymentMethod?: 'CMR_CARD' | 'OTHER_CARD' | 'CASH' | 'ONLINE';
}): Promise<void> {
  const cart = await getTestPrisma().cart.create({
    data: { customerId: data.customerId, status: 'PAID' },
    select: { id: true },
  });

  await getTestPrisma().sale.create({
    data: {
      code: data.code,
      receiptNumber: data.receiptNumber,
      cartId: cart.id,
      customerId: data.customerId,
      cashierId: data.customerId,
      paymentMethod: data.paymentMethod ?? 'CASH',
      priceApplied: data.priceApplied ?? 'NORMAL',
      originalTotalCents: data.totalCents,
      offerTotalCents: data.totalCents,
      cmrTotalCents: data.totalCents,
      totalCents: data.totalCents,
      createdAt: data.createdAt,
    },
  });
}

async function addScan(productId: number, customerId: number, times = 1): Promise<void> {
  for (let count = 0; count < times; count += 1) {
    await getTestPrisma().productScan.create({ data: { productId, customerId } });
  }
}

function getSummary(query: Record<string, unknown> = {}, token = adminToken): Promise<request.Response> {
  return request(app).get('/api/dashboard/summary').query(query).set(...bearer(token));
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);

  await cleanDatabase();
  app = createApp();

  const admin = await createUser('ADMIN');
  adminToken = admin.token;
  const cashier = await createUser('CASHIER');
  cashierToken = cashier.token;
  const customer = await createUser('CUSTOMER');
  customerToken = customer.token;
  cliente = { id: customer.id };

  categoria = await getTestPrisma().category.create({ data: { name: 'Tecnología' } });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/dashboard/summary', () => {
  it('usa por defecto los últimos 30 días contando hoy', async () => {
    await createSale({
      customerId: cliente.id,
      code: 'C-D1',
      receiptNumber: 'T001-000101',
      createdAt: new Date('2026-06-10T12:00:00.000Z'),
      totalCents: 5000,
    });
    await createSale({
      customerId: cliente.id,
      code: 'C-D2',
      receiptNumber: 'T001-000102',
      createdAt: new Date('2026-05-16T12:00:00.000Z'),
      totalCents: 9000,
    });

    const response = await getSummary();

    expect(response.status).toBe(200);
    const data = response.body.data as SummaryResponse;
    expect(data.range).toEqual({ from: '2026-05-17', to: '2026-06-15' });
    expect(data.totals.salesCount).toBe(1);
    expect(data.totals.totalCollectedCents).toBe(5000);
    expect(data.salesByDay).toHaveLength(30);
    expect(data.salesByDay.find((entry) => entry.date === '2026-06-10')).toEqual({
      date: '2026-06-10',
      salesCount: 1,
      totalCents: 5000,
    });
  });

  it('rechaza rangos inválidos con 400', async () => {
    const toAntesDeFrom = await getSummary({ from: '2026-06-15', to: '2026-06-14' });
    const masDe366 = await getSummary({ from: '2020-01-01', to: '2026-06-15' });
    const soloFrom = await getSummary({ from: '2026-06-01' });
    const soloTo = await getSummary({ to: '2026-06-01' });
    const malFormato = await getSummary({ from: '15-06-2026', to: '2026-06-15' });
    const umbralNegativo = await getSummary({ lowStockThreshold: -1 });

    expect(toAntesDeFrom.status).toBe(400);
    expect(toAntesDeFrom.body.error.code).toBe('VALIDATION_ERROR');
    expect(masDe366.status).toBe(400);
    expect(soloFrom.status).toBe(400);
    expect(soloTo.status).toBe(400);
    expect(malFormato.status).toBe(400);
    expect(umbralNegativo.status).toBe(400);
  });

  it('completa con ceros los días sin ventas', async () => {
    await createSale({
      customerId: cliente.id,
      code: 'C-C1',
      receiptNumber: 'T001-000201',
      createdAt: new Date('2026-06-10T12:00:00.000Z'),
      totalCents: 1500,
    });

    const response = await getSummary({ from: '2026-06-08', to: '2026-06-12' });

    expect((response.body.data as SummaryResponse).salesByDay).toEqual([
      { date: '2026-06-08', salesCount: 0, totalCents: 0 },
      { date: '2026-06-09', salesCount: 0, totalCents: 0 },
      { date: '2026-06-10', salesCount: 1, totalCents: 1500 },
      { date: '2026-06-11', salesCount: 0, totalCents: 0 },
      { date: '2026-06-12', salesCount: 0, totalCents: 0 },
    ]);
  });

  it('agrupa cada venta por su día de Lima (las ventas están guardadas en UTC)', async () => {
    await createSale({
      customerId: cliente.id,
      code: 'C-M1',
      receiptNumber: 'T001-000301',
      createdAt: new Date('2026-06-15T04:59:59.999Z'),
      totalCents: 1000,
    });
    await createSale({
      customerId: cliente.id,
      code: 'C-M2',
      receiptNumber: 'T001-000302',
      createdAt: new Date('2026-06-15T05:00:00.000Z'),
      totalCents: 2000,
    });

    const response = await getSummary({ from: '2026-06-14', to: '2026-06-15' });

    expect((response.body.data as SummaryResponse).salesByDay).toEqual([
      { date: '2026-06-14', salesCount: 1, totalCents: 1000 },
      { date: '2026-06-15', salesCount: 1, totalCents: 2000 },
    ]);
  });

  it('cuenta ventas CMR y calcula el porcentaje entero redondeado', async () => {
    for (let index = 0; index < 3; index += 1) {
      await createSale({
        customerId: cliente.id,
        code: `C-CMR${index + 1}`,
        receiptNumber: `T001-00040${index + 1}`,
        createdAt: new Date(`2026-06-0${index + 2}T12:00:00.000Z`),
        totalCents: 10000,
        priceApplied: 'CMR',
        paymentMethod: 'CMR_CARD',
      });
    }
    await createSale({
      customerId: cliente.id,
      code: 'C-NML',
      receiptNumber: 'T001-000404',
      createdAt: new Date('2026-06-05T12:00:00.000Z'),
      totalCents: 5000,
      priceApplied: 'NORMAL',
      paymentMethod: 'CASH',
    });

    const response = await getSummary({ from: '2026-06-01', to: '2026-06-10' });
    const data = response.body.data as SummaryResponse;

    expect(data.totals.salesCount).toBe(4);
    expect(data.totals.cmrSalesCount).toBe(3);
    expect(data.totals.otherSalesCount).toBe(1);
    expect(data.totals.cmrSalesPercent).toBe(75);
    expect(data.totals.totalCollectedCents).toBe(35000);
  });

  it('desglosa el total cobrado por medio de pago', async () => {
    await createSale({
      customerId: cliente.id,
      code: 'C-B1',
      receiptNumber: 'T001-000501',
      createdAt: new Date('2026-06-02T12:00:00.000Z'),
      totalCents: 5000,
      paymentMethod: 'CASH',
    });
    await createSale({
      customerId: cliente.id,
      code: 'C-B2',
      receiptNumber: 'T001-000502',
      createdAt: new Date('2026-06-03T12:00:00.000Z'),
      totalCents: 3000,
      paymentMethod: 'CMR_CARD',
    });
    await createSale({
      customerId: cliente.id,
      code: 'C-B3',
      receiptNumber: 'T001-000503',
      createdAt: new Date('2026-06-04T12:00:00.000Z'),
      totalCents: 2000,
      paymentMethod: 'CASH',
    });

    const response = await getSummary({ from: '2026-06-01', to: '2026-06-10' });

    expect((response.body.data as SummaryResponse).byPaymentMethod).toEqual([
      { paymentMethod: 'CASH', salesCount: 2, totalCents: 7000 },
      { paymentMethod: 'CMR_CARD', salesCount: 1, totalCents: 3000 },
    ]);
  });

  it('devuelve los 10 más escaneados y resuelve los empates por nombre', async () => {
    const productos: Array<{ id: number; name: string }> = [];

    for (const name of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']) {
      const producto = await createProduct(name);
      productos.push({ id: producto.id, name: producto.name });
      await addScan(producto.id, cliente.id, name === 'A' ? 2 : 1);
    }

    const response = await getSummary();

    expect(response.status).toBe(200);
    const data = response.body.data as SummaryResponse;
    expect(data.topScanned).toHaveLength(10);
    expect(data.topScanned.map((producto) => producto.name)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
      'I',
      'J',
    ]);
  });

  it('lowStock: productos activos con stock menor o igual al umbral, de menor a mayor stock', async () => {
    await createProduct('Agotado', { stock: 0 });
    await createProduct('Poco', { stock: 2 });
    await createProduct('Casi', { stock: 3 });
    await createProduct('Borde', { stock: 4 });
    await createProduct('Suficiente', { stock: 5 });
    await createProduct('Inactivo', { stock: 1, active: false });

    const porDefecto = await getSummary();
    const porDefectoData = porDefecto.body.data as SummaryResponse;
    expect(porDefectoData.lowStock.map((producto) => ({ name: producto.name, stock: producto.stock }))).toEqual([
      { name: 'Agotado', stock: 0 },
      { name: 'Poco', stock: 2 },
      { name: 'Casi', stock: 3 },
    ]);
    expect(porDefectoData.lowStock.some((producto) => producto.name === 'Inactivo')).toBe(false);

    const umbralCuatro = await getSummary({ lowStockThreshold: 4 });
    expect(
      (umbralCuatro.body.data as SummaryResponse).lowStock.map((producto) => producto.name),
    ).toEqual(['Agotado', 'Poco', 'Casi', 'Borde']);
  });

  it('requiere rol ADMIN y autenticación', async () => {
    const cajero = await getSummary({}, cashierToken);
    const clienteRespuesta = await getSummary({}, customerToken);
    const sinToken = await request(app).get('/api/dashboard/summary');

    expect(cajero.status).toBe(403);
    expect(cajero.body.error.code).toBe('FORBIDDEN');
    expect(clienteRespuesta.status).toBe(403);
    expect(sinToken.status).toBe(401);
    expect(sinToken.body.error.code).toBe('UNAUTHORIZED');
  });
});