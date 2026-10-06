import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { installmentsConfig } from '../../src/config/env.js';
import { ean13CheckDigit } from '../../src/domain/barcode.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

type CartItemResponse = {
  productId: number;
  barcode: string;
  name: string;
  brand: string;
  quantity: number;
  maxQuantity: number;
  originalPriceCents: number;
  offerPriceCents: number;
  cmrPriceCents: number;
  hasCmrDiscount: boolean;
  campaignName: string | null;
  issue: 'INACTIVE' | 'INSUFFICIENT_STOCK' | null;
};

type CartSummaryResponse = {
  originalTotalCents: number;
  discountTotalCents: number;
  normalTotalCents: number;
  cmrTotalCents: number;
  cmrSavingCents: number;
};

type CartResponse = {
  id: number;
  status: 'OPEN' | 'PENDING' | 'PAID' | 'CANCELLED';
  qrCode: string | null;
  qrExpiresAt: string | null;
  items: CartItemResponse[];
  summary: CartSummaryResponse;
  installments: Array<{ count: number; installmentCents: number; firstInstallmentCents: number }>;
};

/** Momento fijo: las campañas de estas pruebas solo están vigentes alrededor de esta hora. */
const AHORA = new Date('2026-06-15T15:00:00.000Z');
const CAMPANA_INICIO = new Date('2026-06-01T00:00:00.000Z');
const CAMPANA_FIN = new Date('2026-06-30T00:00:00.000Z');
const MINUTO = 60 * 1000;

const RESUMEN_VACIO = {
  originalTotalCents: 0,
  discountTotalCents: 0,
  normalTotalCents: 0,
  cmrTotalCents: 0,
  cmrSavingCents: 0,
};

/**
 * Los seis productos de ARCHITECTURE.md §10. La oferta llega al precio de la tabla con un descuento
 * fijo por producto; el precio CMR es el que sale de aplicar el porcentaje del producto con el
 * redondeo de domain/pricing.ts, que no coincide con el de la tabla porque esa tabla es ilustrativa.
 */
const REFERENCIA = [
  {
    name: 'Dormitorio Tempo Issey Queen',
    brand: 'Tempo',
    originalPriceCents: 424900,
    discountCents: 175000,
    cmrDiscountBps: 200,
    offerPriceCents: 249900,
    cmrPriceCents: 244902,
  },
  {
    name: 'Dormitorio Boxet Praktibox',
    brand: 'Boxet',
    originalPriceCents: 439900,
    discountCents: 170000,
    cmrDiscountBps: 200,
    offerPriceCents: 269900,
    cmrPriceCents: 264502,
  },
  {
    name: 'Cama Royale Prince Queen',
    brand: 'Royale',
    originalPriceCents: 337900,
    discountCents: 148000,
    cmrDiscountBps: 200,
    offerPriceCents: 189900,
    cmrPriceCents: 186102,
  },
  {
    name: 'Cama Royale Prince King',
    brand: 'Royale',
    originalPriceCents: 413900,
    discountCents: 184000,
    cmrDiscountBps: 200,
    offerPriceCents: 229900,
    cmrPriceCents: 225302,
  },
  {
    name: 'Apple Pencil USB-C',
    brand: 'Apple',
    originalPriceCents: 60000,
    discountCents: 17100,
    cmrDiscountBps: 3200,
    offerPriceCents: 42900,
    cmrPriceCents: 29172,
  },
  {
    name: 'Audífonos Xiaomi Redmi Buds 6 Play',
    brand: 'Xiaomi',
    originalPriceCents: 8990,
    discountCents: 5000,
    cmrDiscountBps: 501,
    offerPriceCents: 3990,
    cmrPriceCents: 3790,
  },
];

let emailCounter = 0;
let barcodeCounter = 0;
let qrCounter = 0;

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

function nextQrCode(): string {
  qrCounter += 1;

  return `C-T${String(qrCounter).padStart(4, '0')}`;
}

async function createCategory(name: string): Promise<{ id: number }> {
  return getTestPrisma().category.create({ data: { name } });
}

async function insertProduct(data: {
  categoryId: number;
  name: string;
  brand?: string;
  barcode?: string;
  originalPriceCents?: number;
  hasCmrDiscount?: boolean;
  cmrDiscountBps?: number;
  stock?: number;
  maxPerPurchase?: number;
  active?: boolean;
}): Promise<{ id: number; barcode: string }> {
  return getTestPrisma().product.create({
    data: {
      barcode: data.barcode ?? nextBarcode(),
      name: data.name,
      brand: data.brand ?? 'Falabella',
      categoryId: data.categoryId,
      originalPriceCents: data.originalPriceCents ?? 10000,
      hasCmrDiscount: data.hasCmrDiscount ?? false,
      cmrDiscountBps: data.cmrDiscountBps ?? 0,
      stock: data.stock ?? 10,
      maxPerPurchase: data.maxPerPurchase ?? 10,
      active: data.active ?? true,
    },
    select: { id: true, barcode: true },
  });
}

async function createCampaign(data: {
  name?: string;
  scope?: 'PRODUCTS' | 'CATEGORIES' | 'STORE';
  discountType?: 'PERCENT' | 'FIXED';
  discountValue: number;
  priority?: number;
  active?: boolean;
  productIds?: number[];
  categoryIds?: number[];
}): Promise<{ id: number; name: string }> {
  return getTestPrisma().campaign.create({
    data: {
      name: data.name ?? 'Semana de descuentos',
      scope: data.scope ?? 'STORE',
      discountType: data.discountType ?? 'PERCENT',
      discountValue: data.discountValue,
      priority: data.priority ?? 0,
      startsAt: CAMPANA_INICIO,
      endsAt: CAMPANA_FIN,
      active: data.active ?? true,
      products: { create: (data.productIds ?? []).map((productId) => ({ productId })) },
      categories: { create: (data.categoryIds ?? []).map((categoryId) => ({ categoryId })) },
    },
    select: { id: true, name: true },
  });
}

let app: Express;
let cliente: { id: number; token: string };
let otroCliente: { id: number; token: string };
let adminToken: string;
let cashierToken: string;
let dormitorio: { id: number };
let tecnologia: { id: number };

async function getCart(token = cliente.token): Promise<request.Response> {
  return request(app).get('/api/cart').set(...bearer(token));
}

async function addItem(barcode: string, token = cliente.token): Promise<request.Response> {
  return request(app).post('/api/cart/items').set(...bearer(token)).send({ barcode });
}

async function patchItem(productId: number, quantity: unknown, token = cliente.token): Promise<request.Response> {
  return request(app).patch(`/api/cart/items/${productId}`).set(...bearer(token)).send({ quantity });
}

async function deleteItem(productId: number, token = cliente.token): Promise<request.Response> {
  return request(app).delete(`/api/cart/items/${productId}`).set(...bearer(token));
}

async function deleteItems(token = cliente.token): Promise<request.Response> {
  return request(app).delete('/api/cart/items').set(...bearer(token));
}

function expectCart(response: request.Response): CartResponse {
  expect(response.status).toBe(200);
  return response.body.data as CartResponse;
}

/** El único ítem de un carrito que tiene un solo producto. */
function firstItem(cart: CartResponse): CartItemResponse {
  const item = cart.items[0];

  if (!item) {
    throw new Error('El carrito no tiene ítems.');
  }

  return item;
}

/** Pone el carrito del cliente en PENDING con un QR, como si ya se hubiera generado (RN-06). */
async function lockCartWithQr(expiresAt: Date, token = cliente.token): Promise<string> {
  const cart = expectCart(await getCart(token));
  const qrCode = nextQrCode();

  await getTestPrisma().cart.update({
    where: { id: cart.id },
    data: { status: 'PENDING', qrCode, qrExpiresAt: expiresAt },
  });

  return qrCode;
}

/** Catálogo de referencia con una campaña fija por producto para llegar al precio de la tabla. */
async function createReferenceCatalog(): Promise<Array<{ id: number; barcode: string }>> {
  const productos: Array<{ id: number; barcode: string }> = [];

  for (const fila of REFERENCIA) {
    const producto = await insertProduct({
      categoryId: tecnologia.id,
      name: fila.name,
      brand: fila.brand,
      originalPriceCents: fila.originalPriceCents,
      hasCmrDiscount: true,
      cmrDiscountBps: fila.cmrDiscountBps,
      stock: 5,
      maxPerPurchase: 5,
    });

    await createCampaign({
      name: `${fila.brand} en oferta`,
      scope: 'PRODUCTS',
      discountType: 'FIXED',
      discountValue: fila.discountCents,
      productIds: [producto.id],
    });

    productos.push(producto);
  }

  return productos;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);

  await cleanDatabase();
  app = createApp();

  cliente = await createUser('CUSTOMER');
  otroCliente = await createUser('CUSTOMER');
  adminToken = (await createUser('ADMIN')).token;
  cashierToken = (await createUser('CASHIER')).token;

  dormitorio = await createCategory('Dormitorios');
  tecnologia = await createCategory('Tecnología');
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/cart', () => {
  it('crea el carrito abierto en la primera lectura y lo reutiliza después', async () => {
    const primera = expectCart(await getCart());

    expect(primera.status).toBe('OPEN');
    expect(primera.qrCode).toBeNull();
    expect(primera.qrExpiresAt).toBeNull();
    expect(primera.items).toEqual([]);
    expect(primera.summary).toEqual(RESUMEN_VACIO);
    expect(primera.installments).toEqual([]);

    const segunda = expectCart(await getCart());

    expect(segunda.id).toBe(primera.id);
    expect(await getTestPrisma().cart.count()).toBe(1);
  });

  it('no crea dos carritos si llegan varias lecturas a la vez', async () => {
    const respuestas = await Promise.all([getCart(), getCart(), getCart(), getCart()]);
    const ids = respuestas.map((response) => expectCart(response).id);

    expect(new Set(ids).size).toBe(1);
    expect(await getTestPrisma().cart.count({ where: { customerId: cliente.id } })).toBe(1);
  });

  it('no pierde unidades si llegan tres escaneos del mismo producto a la vez', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds', maxPerPurchase: 5 });

    const respuestas = await Promise.all([addItem(producto.barcode), addItem(producto.barcode), addItem(producto.barcode)]);

    expect(respuestas.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(firstItem(expectCart(await getCart())).quantity).toBe(3);
    expect(await getTestPrisma().cartItem.count()).toBe(1);
  });

  it('devuelve el QR solo mientras el carrito está bloqueado', async () => {
    const qrCode = await lockCartWithQr(new Date(AHORA.getTime() + 20 * MINUTO));

    const bloqueado = expectCart(await getCart());

    expect(bloqueado.status).toBe('PENDING');
    expect(bloqueado.qrCode).toBe(qrCode);
    expect(bloqueado.qrExpiresAt).toBe(new Date(AHORA.getTime() + 20 * MINUTO).toISOString());
  });

  it('un cliente no ve el carrito de otro', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds' });
    await addItem(producto.barcode);

    const mio = expectCart(await getCart());
    const suyo = expectCart(await getCart(otroCliente.token));

    expect(suyo.id).not.toBe(mio.id);
    expect(suyo.items).toEqual([]);
    expect(suyo.summary).toEqual(RESUMEN_VACIO);

    // No puede cambiar ni vaciar el carrito del otro cliente.
    const cambiar = await patchItem(producto.id, 3, otroCliente.token);
    const quitar = await deleteItem(producto.id, otroCliente.token);
    const vaciar = await deleteItems(otroCliente.token);

    expect(cambiar.status).toBe(404);
    expect(cambiar.body.error.code).toBe('NOT_FOUND');
    expect(quitar.status).toBe(404);
    expect(quitar.body.error.code).toBe('NOT_FOUND');
    expect(expectCart(vaciar).items).toEqual([]);

    const despues = expectCart(await getCart());
    expect(despues.id).toBe(mio.id);
    expect(firstItem(despues).quantity).toBe(1);
  });

  it('responde 403 al cajero y al admin, y 401 sin token', async () => {
    const admin = await request(app).get('/api/cart').set(...bearer(adminToken));
    const cajero = await request(app).get('/api/cart').set(...bearer(cashierToken));
    const sinToken = await request(app).get('/api/cart');

    expect(admin.status).toBe(403);
    expect(admin.body.error.code).toBe('FORBIDDEN');
    expect(cajero.status).toBe(403);
    expect(cajero.body.error.code).toBe('FORBIDDEN');
    expect(sinToken.status).toBe(401);
    expect(sinToken.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /api/cart/items', () => {
  it('agrega una unidad y suma 1 si el producto ya estaba (RN-19)', async () => {
    const producto = await insertProduct({
      categoryId: tecnologia.id,
      name: 'Audífonos buds',
      originalPriceCents: 8990,
      hasCmrDiscount: true,
      cmrDiscountBps: 500,
    });

    const primero = expectCart(await addItem(producto.barcode));
    expect(primero.items).toEqual([
      {
        productId: producto.id,
        barcode: producto.barcode,
        name: 'Audífonos buds',
        brand: 'Falabella',
        quantity: 1,
        maxQuantity: 10,
        originalPriceCents: 8990,
        offerPriceCents: 8990,
        cmrPriceCents: 8541,
        hasCmrDiscount: true,
        campaignName: null,
        issue: null,
      },
    ]);

    const segundo = expectCart(await addItem(producto.barcode));

    expect(firstItem(segundo).quantity).toBe(2);
    expect(segundo.summary.originalTotalCents).toBe(17980);
    expect(segundo.summary.cmrTotalCents).toBe(17082);
    expect(await getTestPrisma().cartItem.count()).toBe(1);
  });

  it('responde 404 PRODUCT_NOT_FOUND si no existe, si está inactivo o si su categoría está inactiva', async () => {
    const existente = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos activos' });
    const inactivo = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos inactivos', active: false });
    const conCategoriaInactiva = await insertProduct({ categoryId: dormitorio.id, name: 'Cama sin categoría' });
    const codigoInexistente = nextBarcode();

    const codigoVacio = await addItem(codigoInexistente);
    const productoInactivo = await addItem(inactivo.barcode);

    await getTestPrisma().category.update({ where: { id: dormitorio.id }, data: { active: false } });
    const categoriaInactiva = await addItem(conCategoriaInactiva.barcode);

    expect(codigoVacio.status).toBe(404);
    expect(codigoVacio.body.error.code).toBe('PRODUCT_NOT_FOUND');
    expect(productoInactivo.status).toBe(404);
    expect(productoInactivo.body.error.code).toBe('PRODUCT_NOT_FOUND');
    expect(categoriaInactiva.status).toBe(404);
    expect(categoriaInactiva.body.error.code).toBe('PRODUCT_NOT_FOUND');
    // El mensaje es el mismo en los tres casos: no revela si el código estuvo dado de baja.
    expect(codigoVacio.body.error.message).toBe(productoInactivo.body.error.message);
    expect(productoInactivo.body.error.message).toBe(categoriaInactiva.body.error.message);

    expect(firstItem(expectCart(await addItem(existente.barcode))).productId).toBe(existente.id);
  });

  it('responde 409 OUT_OF_STOCK cuando el stock ya no alcanza', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Poco stock', stock: 2, maxPerPurchase: 10 });

    expect(firstItem(expectCart(await addItem(producto.barcode))).quantity).toBe(1);
    expect(firstItem(expectCart(await addItem(producto.barcode))).quantity).toBe(2);

    const tercero = await addItem(producto.barcode);

    expect(tercero.status).toBe(409);
    expect(tercero.body.error.code).toBe('OUT_OF_STOCK');
    expect(tercero.body.error.message).toContain('2 unidades');

    const carrito = expectCart(await getCart());
    expect(firstItem(carrito).quantity).toBe(2);
    // El límite que ve el cliente es el menor entre el máximo por compra y el stock (RN-04).
    expect(firstItem(carrito).maxQuantity).toBe(2);
  });

  it('responde 409 MAX_PER_PURCHASE cuando se alcanzó el máximo por compra', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Máximo 3', stock: 50, maxPerPurchase: 3 });

    await addItem(producto.barcode);
    await addItem(producto.barcode);
    expect(firstItem(expectCart(await addItem(producto.barcode))).quantity).toBe(3);

    const cuarto = await addItem(producto.barcode);

    expect(cuarto.status).toBe(409);
    expect(cuarto.body.error.code).toBe('MAX_PER_PURCHASE');
    expect(cuarto.body.error.message).toBe('Máximo 3 unidades de este producto por compra.');
    expect(firstItem(expectCart(await getCart())).quantity).toBe(3);
  });

  it('rechaza con 400 un código que no son dígitos o un cuerpo inválido', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds' });

    const conLetras = await addItem('ABCDEFGH');
    const muyCorto = await addItem('1234567');
    const muyLargo = await addItem('123456789012345');
    const sinCodigo = await request(app).post('/api/cart/items').set(...bearer(cliente.token)).send({});
    const desconocido = await request(app)
      .post('/api/cart/items')
      .set(...bearer(cliente.token))
      .send({ barcode: producto.barcode, quantity: 3 });

    expect(conLetras.status).toBe(400);
    expect(conLetras.body.error.code).toBe('VALIDATION_ERROR');
    expect(conLetras.body.error.message).toContain('8 y 14');
    expect(muyCorto.status).toBe(400);
    expect(muyLargo.status).toBe(400);
    expect(sinCodigo.status).toBe(400);
    expect(desconocido.status).toBe(400);
    // Ni una petición rechazada crea ítems.
    expect(await getTestPrisma().cartItem.count()).toBe(0);
  });

  it('responde 409 CART_LOCKED si el carrito tiene un QR vigente', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds' });
    await lockCartWithQr(new Date(AHORA.getTime() + 20 * MINUTO));

    const response = await addItem(producto.barcode);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CART_LOCKED');
    expect(await getTestPrisma().cartItem.count()).toBe(0);
  });

  it('responde 403 al cajero y al admin, y 401 sin token', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds' });

    const cajero = await request(app)
      .post('/api/cart/items')
      .set(...bearer(cashierToken))
      .send({ barcode: producto.barcode });
    const admin = await request(app)
      .post('/api/cart/items')
      .set(...bearer(adminToken))
      .send({ barcode: producto.barcode });
    const sinToken = await request(app).post('/api/cart/items').send({ barcode: producto.barcode });

    expect(cajero.status).toBe(403);
    expect(admin.status).toBe(403);
    expect(sinToken.status).toBe(401);
  });
});

describe('PATCH /api/cart/items/:productId', () => {
  it('fija la cantidad exacta (RN-19)', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds', stock: 6, maxPerPurchase: 6 });
    await addItem(producto.barcode);

    const bajada = expectCart(await patchItem(producto.id, 4));
    expect(firstItem(bajada).quantity).toBe(4);

    const subida = expectCart(await patchItem(producto.id, 6));
    expect(firstItem(subida).quantity).toBe(6);
    expect(subida.summary.originalTotalCents).toBe(60000);

    const ignorada = await patchItem(producto.id, 1);
    expect(firstItem(expectCart(ignorada)).quantity).toBe(1);
  });

  it('responde 409 OUT_OF_STOCK si la cantidad supera el stock', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Poco stock', stock: 2, maxPerPurchase: 10 });
    await addItem(producto.barcode);

    const response = await patchItem(producto.id, 5);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('OUT_OF_STOCK');
    expect(firstItem(expectCart(await getCart())).quantity).toBe(1);
  });

  it('responde 409 MAX_PER_PURCHASE si la cantidad supera el máximo por compra', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Máximo 2', stock: 50, maxPerPurchase: 2 });
    await addItem(producto.barcode);

    const response = await patchItem(producto.id, 3);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('MAX_PER_PURCHASE');
    expect(response.body.error.message).toBe('Máximo 2 unidades de este producto por compra.');
  });

  it('responde 404 NOT_FOUND si el producto no está en el carrito', async () => {
    const enOtroCarrito = await insertProduct({ categoryId: tecnologia.id, name: 'Solo en el carrito de otro' });
    const nuncaAgregado = await insertProduct({ categoryId: tecnologia.id, name: 'Nunca agregado' });
    await addItem(enOtroCarrito.barcode, otroCliente.token);

    const ausente = await patchItem(nuncaAgregado.id, 2);
    const inexistente = await patchItem(999, 2);

    expect(ausente.status).toBe(404);
    expect(ausente.body.error.code).toBe('NOT_FOUND');
    expect(inexistente.status).toBe(404);
  });

  it('rechaza con 400 una cantidad que no es un entero de 1 en adelante', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds' });
    await addItem(producto.barcode);

    const cero = await patchItem(producto.id, 0);
    const negativo = await patchItem(producto.id, -2);
    const decimal = await patchItem(producto.id, 1.5);
    const sinCantidad = await request(app)
      .patch(`/api/cart/items/${producto.id}`)
      .set(...bearer(cliente.token))
      .send({});

    expect(cero.status).toBe(400);
    expect(cero.body.error.code).toBe('VALIDATION_ERROR');
    expect(negativo.status).toBe(400);
    expect(decimal.status).toBe(400);
    expect(sinCantidad.status).toBe(400);
    expect(firstItem(expectCart(await getCart())).quantity).toBe(1);
  });

  it('responde 409 CART_LOCKED si el carrito tiene un QR vigente', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds' });
    await addItem(producto.barcode);
    await lockCartWithQr(new Date(AHORA.getTime() + 20 * MINUTO));

    const response = await patchItem(producto.id, 2);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CART_LOCKED');
    expect(firstItem(expectCart(await getCart())).quantity).toBe(1);
  });

  it('responde 403 al cajero y al admin, y 401 sin token', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds' });
    await addItem(producto.barcode);

    const cajero = await request(app)
      .patch(`/api/cart/items/${producto.id}`)
      .set(...bearer(cashierToken))
      .send({ quantity: 2 });
    const admin = await request(app)
      .patch(`/api/cart/items/${producto.id}`)
      .set(...bearer(adminToken))
      .send({ quantity: 2 });
    const sinToken = await request(app).patch(`/api/cart/items/${producto.id}`).send({ quantity: 2 });

    expect(cajero.status).toBe(403);
    expect(admin.status).toBe(403);
    expect(sinToken.status).toBe(401);
    expect(firstItem(expectCart(await getCart())).quantity).toBe(1);
  });
});

describe('DELETE /api/cart/items/:productId', () => {
  it('quita el producto del carrito', async () => {
    const queda = await insertProduct({ categoryId: tecnologia.id, name: 'Se queda' });
    const sale = await insertProduct({ categoryId: tecnologia.id, name: 'Sale' });
    await addItem(sale.barcode);
    await addItem(queda.barcode);

    const response = expectCart(await deleteItem(sale.id));

    expect(response.items.map((item) => item.productId)).toEqual([queda.id]);
    expect(await getTestPrisma().cartItem.count()).toBe(1);
  });

  it('responde 404 NOT_FOUND si el producto no está en el carrito', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Nunca agregado' });

    const response = await deleteItem(producto.id);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect((await deleteItem(999)).status).toBe(404);
  });

  it('responde 409 CART_LOCKED si el carrito tiene un QR vigente', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds' });
    await addItem(producto.barcode);
    await lockCartWithQr(new Date(AHORA.getTime() + 20 * MINUTO));

    const response = await deleteItem(producto.id);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CART_LOCKED');
    expect(await getTestPrisma().cartItem.count()).toBe(1);
  });

  it('responde 403 al cajero y al admin, y 401 sin token', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds' });
    await addItem(producto.barcode);

    const cajero = await request(app).delete(`/api/cart/items/${producto.id}`).set(...bearer(cashierToken));
    const admin = await request(app).delete(`/api/cart/items/${producto.id}`).set(...bearer(adminToken));
    const sinToken = await request(app).delete(`/api/cart/items/${producto.id}`);

    expect(cajero.status).toBe(403);
    expect(admin.status).toBe(403);
    expect(sinToken.status).toBe(401);
    expect(await getTestPrisma().cartItem.count()).toBe(1);
  });
});

describe('DELETE /api/cart/items', () => {
  it('vacía el carrito completo (RN-22)', async () => {
    const primero = await insertProduct({ categoryId: tecnologia.id, name: 'Uno' });
    const segundo = await insertProduct({ categoryId: dormitorio.id, name: 'Dos' });
    await addItem(primero.barcode);
    await addItem(segundo.barcode);
    await addItem(segundo.barcode);

    const response = expectCart(await deleteItems());

    expect(response.items).toEqual([]);
    expect(response.summary).toEqual(RESUMEN_VACIO);
    expect(response.installments).toEqual([]);
    expect(response.status).toBe('OPEN');
    expect(await getTestPrisma().cartItem.count()).toBe(0);
  });

  it('responde 409 CART_LOCKED si el carrito tiene un QR vigente', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds' });
    await addItem(producto.barcode);
    await lockCartWithQr(new Date(AHORA.getTime() + 20 * MINUTO));

    const response = await deleteItems();

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CART_LOCKED');
    expect(await getTestPrisma().cartItem.count()).toBe(1);
  });

  it('responde 403 al cajero y al admin, y 401 sin token', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds' });
    await addItem(producto.barcode);

    const cajero = await request(app).delete('/api/cart/items').set(...bearer(cashierToken));
    const admin = await request(app).delete('/api/cart/items').set(...bearer(adminToken));
    const sinToken = await request(app).delete('/api/cart/items');

    expect(cajero.status).toBe(403);
    expect(admin.status).toBe(403);
    expect(sinToken.status).toBe(401);
    expect(await getTestPrisma().cartItem.count()).toBe(1);
  });
});

describe('precios del carrito', () => {
  it('devuelve el resumen de los seis productos de referencia y las cuotas sobre el total CMR', async () => {
    const productos = await createReferenceCatalog();

    for (const producto of productos) {
      await addItem(producto.barcode);
    }

    const data = expectCart(await getCart());

    expect(data.items.map((item) => item.productId)).toEqual(productos.map((producto) => producto.id));
    expect(data.items).toHaveLength(REFERENCIA.length);

    REFERENCIA.forEach((fila, index) => {
      expect(data.items[index]).toMatchObject({
        name: fila.name,
        originalPriceCents: fila.originalPriceCents,
        offerPriceCents: fila.offerPriceCents,
        cmrPriceCents: fila.cmrPriceCents,
        hasCmrDiscount: true,
        campaignName: `${fila.brand} en oferta`,
        quantity: 1,
        issue: null,
      });
    });

    expect(data.summary).toEqual({
      originalTotalCents: 1685590,
      discountTotalCents: 699100,
      normalTotalCents: 986490,
      cmrTotalCents: 953770,
      cmrSavingCents: 32720,
    });

    expect(data.installments.map((cuota) => cuota.count)).toEqual([3, 6, 12]);
    // 953770 entre 3 no es exacto: la primera cuota absorbe los céntimos sobrantes.
    expect(data.installments[0]).toEqual({
      count: 3,
      installmentCents: 317923,
      firstInstallmentCents: 317924,
    });
    expect(data.installments[2]).toEqual({
      count: 12,
      installmentCents: 79480,
      firstInstallmentCents: 79490,
    });
  });

  it('no ofrece cuotas con un total menor al mínimo configurado', async () => {
    const producto = await insertProduct({
      categoryId: tecnologia.id,
      name: 'Producto barato',
      originalPriceCents: Math.floor(installmentsConfig.minTotalCents / 2),
      stock: 5,
    });

    const data = expectCart(await addItem(producto.barcode));

    expect(data.summary.cmrTotalCents).toBeLessThan(installmentsConfig.minTotalCents);
    expect(data.installments).toEqual([]);
  });

  it('muestra los precios vigentes en el momento de cada lectura (RN-17)', async () => {
    const producto = await insertProduct({
      categoryId: tecnologia.id,
      name: 'Audífonos buds',
      originalPriceCents: 10000,
      hasCmrDiscount: true,
      cmrDiscountBps: 500,
    });
    const campana = await createCampaign({ name: 'Tienda en oferta', discountValue: 3000 });

    const primera = expectCart(await addItem(producto.barcode));

    await getTestPrisma().campaign.update({ where: { id: campana.id }, data: { discountValue: 5000 } });

    const segunda = expectCart(await getCart());

    expect(firstItem(primera)).toMatchObject({ offerPriceCents: 7000, cmrPriceCents: 6650 });
    expect(primera.summary).toMatchObject({ normalTotalCents: 7000, cmrTotalCents: 6650 });
    expect(firstItem(segunda)).toMatchObject({ offerPriceCents: 5000, cmrPriceCents: 4750 });
    expect(segunda.summary).toMatchObject({ normalTotalCents: 5000, cmrTotalCents: 4750 });

    // El precio no se guarda en el carrito: el total CMR sigue al de la campaña vigente.
    const carrito = await getTestPrisma().cart.findUniqueOrThrow({
      where: { id: segunda.id },
      include: { items: true },
    });
    expect(Object.keys(carrito.items[0] ?? {}).sort()).toEqual(['cartId', 'id', 'productId', 'quantity']);
  });

  it('marca INSUFFICIENT_STOCK cuando el stock baja de la cantidad del carrito', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Poco stock', stock: 5, maxPerPurchase: 5 });
    await addItem(producto.barcode);
    expectCart(await patchItem(producto.id, 3));

    await getTestPrisma().product.update({ where: { id: producto.id }, data: { stock: 2 } });

    const data = expectCart(await getCart());

    expect(firstItem(data).issue).toBe('INSUFFICIENT_STOCK');
    expect(firstItem(data).maxQuantity).toBe(2);
    expect(firstItem(data).quantity).toBe(3);
  });

  it('marca INACTIVE si el producto o su categoría se desactivan', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds' });
    await addItem(producto.barcode);

    await getTestPrisma().product.update({ where: { id: producto.id }, data: { active: false } });
    const conProductoInactivo = expectCart(await getCart());
    expect(firstItem(conProductoInactivo).issue).toBe('INACTIVE');

    await getTestPrisma().product.update({ where: { id: producto.id }, data: { active: true } });
    await getTestPrisma().category.update({ where: { id: tecnologia.id }, data: { active: false } });
    const conCategoriaInactiva = expectCart(await getCart());
    expect(firstItem(conCategoriaInactiva).issue).toBe('INACTIVE');
  });

  it('nunca devuelve el stock exacto ni el porcentaje CMR', async () => {
    const producto = await insertProduct({
      categoryId: tecnologia.id,
      name: 'Audífonos buds',
      originalPriceCents: 8990,
      hasCmrDiscount: true,
      cmrDiscountBps: 2850,
      stock: 7,
      maxPerPurchase: 4,
    });

    const data = expectCart(await addItem(producto.barcode));
    const claves = Object.keys(firstItem(data));

    expect(claves).not.toContain('stock');
    expect(claves).not.toContain('maxPerPurchase');
    expect(claves).not.toContain('cmrDiscountBps');
    expect(firstItem(data).maxQuantity).toBe(4);
    expect(JSON.stringify(data)).not.toContain('cmrDiscountBps');
  });

  it('deja el precio CMR igual a la oferta si el producto no tiene descuento CMR', async () => {
    const producto = await insertProduct({
      categoryId: dormitorio.id,
      name: 'Cama king',
      originalPriceCents: 424900,
      hasCmrDiscount: false,
      cmrDiscountBps: 0,
    });
    await createCampaign({
      name: 'Camas en oferta',
      scope: 'CATEGORIES',
      discountType: 'FIXED',
      discountValue: 175000,
      categoryIds: [dormitorio.id],
    });

    const data = expectCart(await addItem(producto.barcode));

    expect(firstItem(data)).toMatchObject({
      originalPriceCents: 424900,
      offerPriceCents: 249900,
      cmrPriceCents: 249900,
      hasCmrDiscount: false,
      campaignName: 'Camas en oferta',
    });
    expect(data.summary.cmrSavingCents).toBe(0);
  });
});

describe('expiración del QR al leer (RN-06)', () => {
  it('devuelve el carrito a OPEN y borra el código cuando la expiración ya pasó', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds' });
    await addItem(producto.barcode);
    const qrCode = await lockCartWithQr(new Date(AHORA.getTime() - MINUTO));

    const expirado = expectCart(await getCart());

    expect(expirado.status).toBe('OPEN');
    expect(expirado.qrCode).toBeNull();
    expect(expirado.qrExpiresAt).toBeNull();
    expect(firstItem(expirado).productId).toBe(producto.id);

    const fila = await getTestPrisma().cart.findUniqueOrThrow({ where: { id: expirado.id } });
    expect(fila.status).toBe('OPEN');
    expect(fila.qrCode).toBeNull();
    expect(fila.qrExpiresAt).toBeNull();

    // El código liberado se puede volver a usar y el carrito vuelve a ser editable.
    expect(expectCart(await getCart()).status).toBe('OPEN');
    expect(firstItem(expectCart(await addItem(producto.barcode))).quantity).toBe(2);
    expect(await getTestPrisma().cart.count()).toBe(1);
    expect(qrCode).toMatch(/^C-/);
  });

  it('deja el carrito bloqueado mientras el QR sigue vigente', async () => {
    const producto = await insertProduct({ categoryId: tecnologia.id, name: 'Audífonos buds' });
    await addItem(producto.barcode);
    await lockCartWithQr(new Date(AHORA.getTime() + 1 * MINUTO));

    const vigente = expectCart(await getCart());

    expect(vigente.status).toBe('PENDING');
    expect(vigente.qrCode).not.toBeNull();
    expect(vigente.qrExpiresAt).toBe(new Date(AHORA.getTime() + 1 * MINUTO).toISOString());
    expect((await addItem(producto.barcode)).status).toBe(409);
  });
});
