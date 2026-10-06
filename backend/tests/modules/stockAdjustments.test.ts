import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { ean13CheckDigit } from '../../src/domain/barcode.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

type AdjustmentView = {
  id: number;
  productId: number;
  delta: number;
  reason: string;
  createdAt: string;
  userId: number;
  userName: string;
};

type AdjustmentResult = {
  stock: number;
  adjustment: AdjustmentView;
};

type HistoryView = {
  items: AdjustmentView[];
  total: number;
  page: number;
  pageSize: number;
};

type ProductView = {
  id: number;
  stock: number;
};

const ADMIN_NAME = 'Ana Admin';

// Las pruebas no hacen login por HTTP: el hash es un texto fijo porque aquí no se verifica contraseñas.
let emailCounter = 0;

async function createRoleToken(role: AuthRole, name: string): Promise<{ userId: number; token: string }> {
  emailCounter += 1;
  const email = `${role.toLowerCase()}-${emailCounter}@falabella.com`;
  const user = await getTestPrisma().user.create({
    data: { email, name, role, passwordHash: 'hash-fijo-de-prueba' },
  });

  return { userId: user.id, token: signAuthToken({ sub: String(user.id), role, email }) };
}

function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

/** EAN-13 con prefijo interno 200 y el verificador calculado, para no repetir códigos. */
let barcodeCounter = 0;

function nextBarcode(): string {
  barcodeCounter += 1;
  const body = `200000${String(barcodeCounter).padStart(6, '0')}`;

  return `${body}${ean13CheckDigit(body)}`;
}

let app: Express;
let adminToken: string;
let adminUserId: number;
let cashierToken: string;
let customerToken: string;
let categoryId: number;

function productBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    barcode: nextBarcode(),
    name: 'Audífonos Redmi Buds 6 Play',
    brand: 'Xiaomi',
    categoryId,
    originalPriceCents: 8990,
    hasCmrDiscount: false,
    cmrDiscountBps: 0,
    stock: 0,
    maxPerPurchase: 10,
    attributes: {},
    ...overrides,
  };
}

async function createProductOk(overrides: Record<string, unknown> = {}): Promise<ProductView> {
  const response = await request(app).post('/api/products').set(...bearer(adminToken)).send(productBody(overrides));

  expect(response.status).toBe(200);

  return response.body.data as ProductView;
}

async function adjust(
  productId: number,
  body: Record<string, unknown>,
  token = adminToken,
): Promise<request.Response> {
  return request(app).post(`/api/products/${productId}/stock-adjustments`).set(...bearer(token)).send(body);
}

async function adjustOk(productId: number, delta: number, reason: string): Promise<AdjustmentResult> {
  const response = await adjust(productId, { delta, reason });

  expect(response.status).toBe(200);

  return response.body.data as AdjustmentResult;
}

/** La fecha la pone la base de datos; para ordenar el historial se fija a mano en las pruebas. */
async function adjustWithDate(
  productId: number,
  delta: number,
  reason: string,
  createdAt: string,
): Promise<AdjustmentResult> {
  const data = await adjustOk(productId, delta, reason);

  await getTestPrisma().stockAdjustment.update({
    where: { id: data.adjustment.id },
    data: { createdAt: new Date(createdAt) },
  });

  return data;
}

async function history(productId: number, query = ''): Promise<HistoryView> {
  const response = await request(app)
    .get(`/api/products/${productId}/stock-adjustments${query}`)
    .set(...bearer(adminToken));

  expect(response.status).toBe(200);

  return response.body.data as HistoryView;
}

async function stockEnBase(productId: number): Promise<number | undefined> {
  const fila = await getTestPrisma().product.findUnique({ where: { id: productId }, select: { stock: true } });

  return fila?.stock;
}

function countAdjustments(productId: number): Promise<number> {
  return getTestPrisma().stockAdjustment.count({ where: { productId } });
}

beforeEach(async () => {
  await cleanDatabase();
  app = createApp();

  const admin = await createRoleToken('ADMIN', ADMIN_NAME);
  adminToken = admin.token;
  adminUserId = admin.userId;
  cashierToken = (await createRoleToken('CASHIER', 'Carlos Cajero')).token;
  customerToken = (await createRoleToken('CUSTOMER', 'Carla Cliente')).token;

  categoryId = (await getTestPrisma().category.create({ data: { name: 'Audífonos' } })).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/products/:id/stock-adjustments', () => {
  it('sube el stock y registra el ajuste con motivo, usuario y fecha', async () => {
    const producto = await createProductOk({ stock: 10 });

    const response = await adjust(producto.id, { delta: 7, reason: '  Recepción   de mercadería ' });

    expect(response.status).toBe(200);

    const data = response.body.data as AdjustmentResult;

    expect(data.stock).toBe(17);
    expect(data.adjustment).toMatchObject({
      productId: producto.id,
      delta: 7,
      reason: 'Recepción de mercadería',
      userId: adminUserId,
      userName: ADMIN_NAME,
    });
    expect(Number.isNaN(Date.parse(data.adjustment.createdAt))).toBe(false);
    expect(Math.abs(Date.now() - Date.parse(data.adjustment.createdAt))).toBeLessThan(300_000);
    expect(await stockEnBase(producto.id)).toBe(17);

    const fila = await getTestPrisma().stockAdjustment.findUnique({ where: { id: data.adjustment.id } });

    expect(fila?.delta).toBe(7);
    expect(fila?.userId).toBe(adminUserId);
    expect(fila?.reason).toBe('Recepción de mercadería');
  });

  it('baja el stock con un delta negativo y puede dejarlo en cero', async () => {
    const producto = await createProductOk({ stock: 5 });

    const parcial = await adjustOk(producto.id, -2, 'Merma por rotura');
    const total = await adjustOk(producto.id, -3, 'Venta en tienda');

    expect(parcial.stock).toBe(3);
    expect(total.stock).toBe(0);
    expect(await stockEnBase(producto.id)).toBe(0);
  });

  it('acepta el ajuste de un producto inactivo', async () => {
    const producto = await createProductOk({ stock: 4 });

    await request(app)
      .patch(`/api/products/${producto.id}/active`)
      .set(...bearer(adminToken))
      .send({ active: false });

    const data = await adjustOk(producto.id, 6, 'Devolución de cliente');

    expect(data.stock).toBe(10);
    expect(await stockEnBase(producto.id)).toBe(10);
  });

  it('rechaza con 400 un motivo vacío, demasiado corto o que falta, y no cambia nada', async () => {
    const producto = await createProductOk({ stock: 8 });
    const antes = await countAdjustments(producto.id);

    const vacio = await adjust(producto.id, { delta: 1, reason: '   ' });
    const corto = await adjust(producto.id, { delta: 1, reason: 'ok' });
    const sinMotivo = await adjust(producto.id, { delta: 1 });
    const largo = await adjust(producto.id, { delta: 1, reason: 'm'.repeat(201) });

    expect(vacio.status).toBe(400);
    expect(vacio.body.error.code).toBe('VALIDATION_ERROR');
    expect(vacio.body.error.message).toContain('motivo del ajuste');
    expect(corto.status).toBe(400);
    expect(corto.body.error.message).toContain('al menos 3');
    expect(sinMotivo.status).toBe(400);
    expect(sinMotivo.body.error.message).toContain('motivo del ajuste es obligatorio');
    expect(largo.status).toBe(400);
    expect(largo.body.error.message).toContain('200');

    expect(await stockEnBase(producto.id)).toBe(8);
    expect(await countAdjustments(producto.id)).toBe(antes);
  });

  it('rechaza con 400 un delta cero, decimal o que falta, y no cambia nada', async () => {
    const producto = await createProductOk({ stock: 8 });
    const antes = await countAdjustments(producto.id);

    const cero = await adjust(producto.id, { delta: 0, reason: 'Revisión de inventario' });
    const decimal = await adjust(producto.id, { delta: 1.5, reason: 'Conteo parcial' });
    const sinDelta = await adjust(producto.id, { reason: 'Conteo de góndola' });
    const texto = await adjust(producto.id, { delta: '5', reason: 'Conteo de góndola' });

    expect(cero.status).toBe(400);
    expect(cero.body.error.code).toBe('VALIDATION_ERROR');
    expect(cero.body.error.message).toContain('distinta de cero');
    expect(decimal.status).toBe(400);
    expect(decimal.body.error.message).toContain('entero');
    expect(sinDelta.status).toBe(400);
    expect(sinDelta.body.error.message).toContain('cantidad del ajuste es obligatoria');
    expect(texto.status).toBe(400);

    expect(await stockEnBase(producto.id)).toBe(8);
    expect(await countAdjustments(producto.id)).toBe(antes);
  });

  it('responde 409 OUT_OF_STOCK y no cambia nada si el stock quedaría negativo', async () => {
    const producto = await createProductOk({ stock: 3 });
    const antes = await countAdjustments(producto.id);

    const response = await adjust(producto.id, { delta: -4, reason: 'Merma por rotura' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('OUT_OF_STOCK');
    expect(response.body.error.message).toContain('3');
    expect(await stockEnBase(producto.id)).toBe(3);
    expect(await countAdjustments(producto.id)).toBe(antes);
  });

  it('deja el stock en cero cuando el ajuste lo consume todo, y no lo deja pasar', async () => {
    const producto = await createProductOk({ stock: 2 });
    const antes = await countAdjustments(producto.id);

    const exacto = await adjustOk(producto.id, -2, 'Venta en tienda');

    expect(exacto.stock).toBe(0);

    const siguiente = await adjust(producto.id, { delta: -1, reason: 'Otra venta' });

    expect(siguiente.status).toBe(409);
    expect(siguiente.body.error.code).toBe('OUT_OF_STOCK');
    expect(await stockEnBase(producto.id)).toBe(0);
    expect(await countAdjustments(producto.id)).toBe(antes + 1);
  });

  it('dos ajustes seguidos dejan el stock exacto', async () => {
    const producto = await createProductOk({ stock: 10 });

    await adjustOk(producto.id, 5, 'Recepción de mercadería');
    const segundo = await adjustOk(producto.id, -3, 'Venta en tienda');

    expect(segundo.stock).toBe(12);
    expect(await stockEnBase(producto.id)).toBe(12);
  });

  it('rechaza con 400 un campo desconocido', async () => {
    const producto = await createProductOk({ stock: 5 });

    const response = await adjust(producto.id, { delta: 1, reason: 'Prueba', motivo: 'Otro nombre' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('motivo');
    expect(await stockEnBase(producto.id)).toBe(5);
  });

  it('responde 404 si el producto no existe y 400 si el id no es válido', async () => {
    const inexistente = await adjust(987654, { delta: 1, reason: 'Prueba' });
    const noNumerico = await adjust(0, { delta: 1, reason: 'Prueba' });

    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.code).toBe('NOT_FOUND');
    expect(noNumerico.status).toBe(400);
    expect(noNumerico.body.error.code).toBe('VALIDATION_ERROR');
    expect(await getTestPrisma().stockAdjustment.count()).toBe(0);
  });

  it('responde 403 a un cajero y a un cliente, y 401 sin token', async () => {
    const producto = await createProductOk({ stock: 5 });
    const antes = await countAdjustments(producto.id);

    const cajero = await adjust(producto.id, { delta: 1, reason: 'Prueba' }, cashierToken);
    const cliente = await adjust(producto.id, { delta: 1, reason: 'Prueba' }, customerToken);
    const sinToken = await request(app)
      .post(`/api/products/${producto.id}/stock-adjustments`)
      .send({ delta: 1, reason: 'Prueba' });

    expect(cajero.status).toBe(403);
    expect(cajero.body.error.code).toBe('FORBIDDEN');
    expect(cliente.status).toBe(403);
    expect(sinToken.status).toBe(401);
    expect(sinToken.body.error.code).toBe('UNAUTHORIZED');
    expect(await stockEnBase(producto.id)).toBe(5);
    expect(await countAdjustments(producto.id)).toBe(antes);
  });
});

describe('GET /api/products/:id/stock-adjustments', () => {
  it('devuelve el historial del más reciente al más antiguo con delta, motivo, fecha y usuario', async () => {
    const producto = await createProductOk({ stock: 0 });

    await adjustWithDate(producto.id, 12, 'Apertura de tienda', '2026-06-15T15:00:00.000Z');
    await adjustWithDate(producto.id, -2, 'Merma por rotura', '2026-06-15T16:00:00.000Z');
    await adjustWithDate(producto.id, 5, 'Devolución de cliente', '2026-06-15T18:30:00.000Z');

    const listado = await history(producto.id);

    expect(listado.total).toBe(3);
    expect(listado.page).toBe(1);
    expect(listado.pageSize).toBe(20);
    expect(listado.items.map((item) => item.reason)).toEqual([
      'Devolución de cliente',
      'Merma por rotura',
      'Apertura de tienda',
    ]);
    expect(listado.items.map((item) => item.delta)).toEqual([5, -2, 12]);
    expect(listado.items.map((item) => item.createdAt)).toEqual([
      '2026-06-15T18:30:00.000Z',
      '2026-06-15T16:00:00.000Z',
      '2026-06-15T15:00:00.000Z',
    ]);
    expect(listado.items.every((item) => item.userId === adminUserId && item.userName === ADMIN_NAME)).toBe(true);
    expect(listado.items.every((item) => item.productId === producto.id)).toBe(true);
  });

  it('registra el stock inicial de la creación del producto en el historial', async () => {
    const producto = await createProductOk({ stock: 20 });

    const listado = await history(producto.id);

    expect(listado.total).toBe(1);
    expect(listado.items[0]).toMatchObject({ delta: 20, reason: 'Stock inicial', userId: adminUserId });
  });

  it('pagina el historial sin repetir ni perder ajustes', async () => {
    const producto = await createProductOk({ stock: 0 });

    for (let numero = 1; numero <= 5; numero += 1) {
      const hora = String(15 + numero).padStart(2, '0');

      await adjustWithDate(producto.id, numero, `Entrada ${numero}`, `2026-06-15T${hora}:00:00.000Z`);
    }

    const primera = await history(producto.id, '?pageSize=2');
    const segunda = await history(producto.id, '?pageSize=2&page=2');
    const tercera = await history(producto.id, '?pageSize=2&page=3');

    expect(primera.total).toBe(5);
    expect(primera.page).toBe(1);
    expect(primera.pageSize).toBe(2);
    expect(primera.items.map((item) => item.reason)).toEqual(['Entrada 5', 'Entrada 4']);
    expect(segunda.items.map((item) => item.reason)).toEqual(['Entrada 3', 'Entrada 2']);
    expect(tercera.items.map((item) => item.reason)).toEqual(['Entrada 1']);
  });

  it('devuelve la lista vacía para un producto sin ajustes y solo los ajustes de ese producto', async () => {
    const sinAjustes = await createProductOk({ stock: 0 });
    const conAjustes = await createProductOk({ stock: 0 });
    await adjustOk(conAjustes.id, 4, 'Entrada de mercadería');

    const vacio = await history(sinAjustes.id);
    const propio = await history(conAjustes.id);

    expect(vacio.items).toEqual([]);
    expect(vacio.total).toBe(0);
    expect(propio.total).toBe(1);
    expect(propio.items[0]?.productId).toBe(conAjustes.id);
  });

  it('rechaza con 400 una consulta inválida', async () => {
    const producto = await createProductOk({ stock: 3 });
    const pedir = (query: string) =>
      request(app).get(`/api/products/${producto.id}/stock-adjustments${query}`).set(...bearer(adminToken));

    const pagina = await pedir('?page=0');
    const tamano = await pedir('?pageSize=101');

    expect(pagina.status).toBe(400);
    expect(pagina.body.error.code).toBe('VALIDATION_ERROR');
    expect(tamano.status).toBe(400);
    expect(tamano.body.error.message).toContain('100');
  });

  it('responde 404 si el producto no existe y 400 si el id no es válido', async () => {
    const inexistente = await request(app).get('/api/products/987654/stock-adjustments').set(...bearer(adminToken));
    const noNumerico = await request(app).get('/api/products/abc/stock-adjustments').set(...bearer(adminToken));

    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.code).toBe('NOT_FOUND');
    expect(noNumerico.status).toBe(400);
    expect(noNumerico.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('responde 403 a un cajero y a un cliente, y 401 sin token', async () => {
    const producto = await createProductOk({ stock: 3 });

    const cajero = await request(app)
      .get(`/api/products/${producto.id}/stock-adjustments`)
      .set(...bearer(cashierToken));
    const cliente = await request(app)
      .get(`/api/products/${producto.id}/stock-adjustments`)
      .set(...bearer(customerToken));
    const sinToken = await request(app).get(`/api/products/${producto.id}/stock-adjustments`);

    expect(cajero.status).toBe(403);
    expect(cajero.body.error.code).toBe('FORBIDDEN');
    expect(cliente.status).toBe(403);
    expect(sinToken.status).toBe(401);
    expect(sinToken.body.error.code).toBe('UNAUTHORIZED');
  });
});
