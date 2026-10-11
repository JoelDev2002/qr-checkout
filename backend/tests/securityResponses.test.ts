import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signAuthToken, type AuthRole } from '../src/infrastructure/jwt.js';
import { hashPassword } from '../src/infrastructure/password.js';
import { prisma } from '../src/infrastructure/prisma.js';
import { cleanDatabase, getTestPrisma } from './helpers/db.js';

/**
 * Respuestas sin filtraciones (T3.3 parte B). Arma datos con valores sensibles reales
 * (passwordHash, googleId, stock y cmrDiscountBps) y comprueba que ninguna respuesta que
 * ve un cliente o un cajero los expone, ni siquiera como clave anidada.
 */

const PASSWORD = 'ClaveSegura123';
const CMR_DISCOUNT_BPS = 2850;
const PRODUCT_STOCK = 4;
const PRODUCT_BARCODE = '7751234567890';
const GOOGLE_ID = '109876543210987654321';

/** Claves que jamás deben salir hacia el cliente ni hacia caja. */
const FORBIDDEN_KEYS = ['passwordHash', 'googleId', 'stock', 'cmrDiscountBps'];

let app: Express;
let customerToken: string;
let cashierToken: string;
let customerId: number;
let cashierId: number;
let productId: number;
let cartWithQrCode: string;
let paidSaleId: number;

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, keys);
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeys(child, keys);
    }
  }

  return keys;
}

function expectNoLeak(response: request.Response, contexto: string): void {
  expect(response.status, contexto).toBe(200);

  const keys = collectKeys(response.body);
  const filtradas = FORBIDDEN_KEYS.filter((key) => keys.includes(key));

  expect(filtradas, `${contexto} expuso: ${filtradas.join(', ')}`).toEqual([]);
  expect(JSON.stringify(response.body), `${contexto} expuso un hash`).not.toContain('$2b$');
}

async function createUser(role: AuthRole, email: string, googleId?: string): Promise<number> {
  const user = await getTestPrisma().user.create({
    data: {
      email,
      name: `Usuario ${role}`,
      role,
      passwordHash: await hashPassword(PASSWORD),
      googleId: googleId ?? null,
    },
    select: { id: true },
  });

  return user.id;
}

beforeEach(async () => {
  await cleanDatabase();
  app = createApp();

  customerId = await createUser('CUSTOMER', 'cliente@falabella.com', GOOGLE_ID);
  cashierId = await createUser('CASHIER', 'cajero@falabella.com');
  await createUser('ADMIN', 'admin@falabella.com');

  customerToken = signAuthToken({ sub: String(customerId), role: 'CUSTOMER' });
  cashierToken = signAuthToken({ sub: String(cashierId), role: 'CASHIER' });

  const category = await getTestPrisma().category.create({
    data: { name: 'Tecnología' },
    select: { id: true },
  });

  const product = await getTestPrisma().product.create({
    data: {
      barcode: PRODUCT_BARCODE,
      name: 'Televisor 55 pulgadas',
      brand: 'Falabella',
      categoryId: category.id,
      originalPriceCents: 200000,
      hasCmrDiscount: true,
      cmrDiscountBps: CMR_DISCOUNT_BPS,
      stock: PRODUCT_STOCK,
      maxPerPurchase: 3,
    },
    select: { id: true },
  });
  productId = product.id;

  // Carrito OPEN con un ítem: sirve para carrito, escaneo y QR.
  const cart = await getTestPrisma().cart.create({
    data: { customerId, status: 'OPEN' },
    select: { id: true },
  });
  await getTestPrisma().cartItem.create({ data: { cartId: cart.id, productId, quantity: 1 } });

  cartWithQrCode = 'C-ABCDE';

  // Venta ya cobrada, para el historial del cliente.
  const paidCart = await getTestPrisma().cart.create({
    data: { customerId, status: 'PAID', qrCode: cartWithQrCode },
    select: { id: true },
  });
  await getTestPrisma().cartItem.create({ data: { cartId: paidCart.id, productId, quantity: 1 } });

  const sale = await getTestPrisma().sale.create({
    data: {
      code: cartWithQrCode,
      receiptNumber: 'T001-000001',
      cartId: paidCart.id,
      customerId,
      cashierId,
      paymentMethod: 'CMR_CARD',
      priceApplied: 'CMR',
      originalTotalCents: 200000,
      offerTotalCents: 200000,
      cmrTotalCents: 143000,
      totalCents: 143000,
    },
    select: { id: true },
  });
  paidSaleId = sale.id;

  await getTestPrisma().saleItem.create({
    data: {
      saleId: sale.id,
      productId,
      barcode: PRODUCT_BARCODE,
      name: 'Televisor 55 pulgadas',
      quantity: 1,
      originalPriceCents: 200000,
      normalPriceCents: 200000,
      cmrPriceCents: 143000,
      paidPriceCents: 143000,
      subtotalCents: 143000,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('respuestas hacia clientes y caja', () => {
  it('los sensibles existen en la base (la prueba tiene algo que ocultar)', async () => {
    const user = await getTestPrisma().user.findUniqueOrThrow({ where: { id: customerId } });
    const product = await getTestPrisma().product.findUniqueOrThrow({ where: { id: productId } });

    expect(user.passwordHash).toContain('$2b$');
    expect(user.googleId).toBe(GOOGLE_ID);
    expect(product.stock).toBe(PRODUCT_STOCK);
    expect(product.cmrDiscountBps).toBe(CMR_DISCOUNT_BPS);
  });

  it('el login y /auth/me devuelven solo el usuario público', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cajero@falabella.com', password: PASSWORD });
    expectNoLeak(login, 'POST /api/auth/login');
    expect(login.body.data.user).not.toHaveProperty('passwordHash');
    expect(login.body.data.user).not.toHaveProperty('googleId');

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${customerToken}`);
    expectNoLeak(me, 'GET /api/auth/me');
  });

  it('el escaneo de un producto no revela stock ni descuento CMR', async () => {
    const response = await request(app)
      .get(`/api/products/barcode/${PRODUCT_BARCODE}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expectNoLeak(response, 'GET /api/products/barcode/:barcode');
  });

  it('el carrito (leer, agregar, editar, quitar) no revela stock ni descuento CMR', async () => {
    const leer = await request(app).get('/api/cart').set('Authorization', `Bearer ${customerToken}`);
    expectNoLeak(leer, 'GET /api/cart');

    const agregar = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ barcode: PRODUCT_BARCODE });
    expectNoLeak(agregar, 'POST /api/cart/items');

    const editar = await request(app)
      .patch(`/api/cart/items/${productId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ quantity: 2 });
    expectNoLeak(editar, 'PATCH /api/cart/items/:productId');

    const quitar = await request(app)
      .delete(`/api/cart/items/${productId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expectNoLeak(quitar, 'DELETE /api/cart/items/:productId');
  });

  it('el QR del cliente y su lectura en caja no revelan stock ni descuento CMR', async () => {
    const qr = await request(app).post('/api/cart/qr').set('Authorization', `Bearer ${customerToken}`);
    expectNoLeak(qr, 'POST /api/cart/qr');

    const codigo = qr.body.data.qrCode as string;

    const preview = await request(app)
      .get(`/api/checkout/${codigo}`)
      .set('Authorization', `Bearer ${cashierToken}`);
    expectNoLeak(preview, 'GET /api/checkout/:code');

    const cancelar = await request(app)
      .delete('/api/cart/qr')
      .set('Authorization', `Bearer ${customerToken}`);
    expectNoLeak(cancelar, 'DELETE /api/cart/qr');
  });

  it('el historial de compras no revela stock ni descuento CMR', async () => {
    const lista = await request(app)
      .get('/api/purchases')
      .set('Authorization', `Bearer ${customerToken}`);
    expectNoLeak(lista, 'GET /api/purchases');

    const detalle = await request(app)
      .get(`/api/purchases/${paidSaleId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expectNoLeak(detalle, 'GET /api/purchases/:saleId');
  });

  it('las ventas del día en caja no revelan descuento CMR (RN-14)', async () => {
    const response = await request(app)
      .get('/api/checkout/sales/today')
      .set('Authorization', `Bearer ${cashierToken}`);

    expectNoLeak(response, 'GET /api/checkout/sales/today');
  });
});
