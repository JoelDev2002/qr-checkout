import type { FieldType, Prisma } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { ean13CheckDigit } from '../../src/domain/barcode.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

type DisplayAttribute = {
  key: string;
  label: string;
  value: string | number;
  unit: string | null;
};

type ScannedProductResponse = {
  id: number;
  barcode: string;
  name: string;
  brand: string;
  color: string | null;
  originalPriceCents: number;
  offerPriceCents: number;
  cmrPriceCents: number;
  hasCmrDiscount: boolean;
  campaignName: string | null;
  discountPercent: number;
  details: DisplayAttribute[];
  maxQuantity: number;
};



/** Momento fijo: las campañas de debajo solo están vigentes alrededor de esta hora. */
const AHORA = new Date('2026-06-15T15:00:00.000Z');
const CAMPANA_INICIO = new Date('2026-06-01T00:00:00.000Z');
const CAMPANA_FIN = new Date('2026-06-30T00:00:00.000Z');

let emailCounter = 0;

async function createRoleToken(role: AuthRole): Promise<{ id: number; token: string }> {
  emailCounter += 1;
  const user = await getTestPrisma().user.create({
    data: {
      email: `${role.toLowerCase()}-${emailCounter}@falabella.com`,
      name: `Usuario ${role}`,
      role,
      passwordHash: 'hash-fijo-de-prueba',
    },
  });

  return { id: user.id, token: signAuthToken({ sub: String(user.id), role, email: user.email }) };
}

function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

let barcodeCounter = 0;

function nextBarcode(): string {
  barcodeCounter += 1;
  const body = `200000${String(barcodeCounter).padStart(6, '0')}`;

  return `${body}${ean13CheckDigit(body)}`;
}

async function createCategory(name: string): Promise<{ id: number }> {
  return getTestPrisma().category.create({ data: { name } });
}

async function createField(
  categoryId: number,
  data: {
    key: string;
    label: string;
    type: FieldType;
    required?: boolean;
    options?: string[];
    unit?: string;
    sortOrder?: number;
  },
): Promise<{ id: number; key: string }> {
  return getTestPrisma().categoryField.create({
    data: {
      categoryId,
      key: data.key,
      label: data.label,
      type: data.type,
      required: data.required ?? false,
      options: data.options,
      unit: data.unit,
      sortOrder: data.sortOrder ?? 0,
    },
    select: { id: true, key: true },
  });
}

async function insertProduct(data: {
  categoryId: number;
  name: string;
  brand?: string;
  color?: string | null;
  barcode?: string;
  originalPriceCents?: number;
  hasCmrDiscount?: boolean;
  cmrDiscountBps?: number;
  stock?: number;
  maxPerPurchase?: number;
  active?: boolean;
  attributes?: Prisma.InputJsonValue;
}): Promise<{ id: number; barcode: string; categoryId: number }> {
  return getTestPrisma().product.create({
    data: {
      barcode: data.barcode ?? nextBarcode(),
      name: data.name,
      brand: data.brand ?? 'Falabella',
      color: data.color ?? 'Negro',
      categoryId: data.categoryId,
      originalPriceCents: data.originalPriceCents ?? 10000,
      hasCmrDiscount: data.hasCmrDiscount ?? false,
      cmrDiscountBps: data.cmrDiscountBps ?? 0,
      attributes: data.attributes ?? {},
      stock: data.stock ?? 5,
      maxPerPurchase: data.maxPerPurchase ?? 10,
      active: data.active ?? true,
    },
    select: { id: true, barcode: true, categoryId: true },
  });
}

async function createCampaign(data: {
  name?: string;
  scope?: 'PRODUCTS' | 'CATEGORIES' | 'STORE';
  discountType?: 'PERCENT' | 'FIXED';
  discountValue: number;
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
let adminToken: string;
let cashierToken: string;
let customerToken: string;
let customerId: number;
let audifonos: { id: number };
let camas: { id: number };

async function getByBarcode(barcode: string, token = customerToken): Promise<request.Response> {
  return request(app).get(`/api/products/barcode/${barcode}`).set(...bearer(token));
}

async function preview(body: Record<string, unknown>, token = adminToken): Promise<request.Response> {
  return request(app).post('/api/products/price-preview').set(...bearer(token)).send(body);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);

  await cleanDatabase();
  app = createApp();

  const admin = await createRoleToken('ADMIN');
  adminToken = admin.token;
  const cashier = await createRoleToken('CASHIER');
  cashierToken = cashier.token;
  const customer = await createRoleToken('CUSTOMER');
  customerToken = customer.token;
  customerId = customer.id;

  audifonos = await createCategory('Audífonos');
  camas = await createCategory('Camas');

  await createField(audifonos.id, { key: 'conectividad', label: 'Conexión', type: 'TEXT', sortOrder: 1 });
  await createField(audifonos.id, {
    key: 'bateria_horas',
    label: 'Batería',
    type: 'NUMBER',
    unit: 'horas',
    sortOrder: 2,
  });
  await createField(camas.id, { key: 'medida', label: 'Medida', type: 'TEXT', sortOrder: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/products/barcode/:barcode', () => {
  it('devuelve el producto activo con la campaña vigente y su descuento CMR', async () => {
    const producto = await insertProduct({
      categoryId: audifonos.id,
      name: 'Audífonos Xiaomi Redmi Buds 6 Play',
      brand: 'Xiaomi',
      color: 'Negro',
      originalPriceCents: 10000,
      hasCmrDiscount: true,
      cmrDiscountBps: 500,
      stock: 7,
      maxPerPurchase: 20,
      attributes: { conectividad: 'Bluetooth', bateria_horas: 36 },
    });
    await createCampaign({ discountValue: 3000, scope: 'PRODUCTS', productIds: [producto.id] });

    const response = await getByBarcode(producto.barcode);

    expect(response.status).toBe(200);

    const data = response.body.data as ScannedProductResponse;

    expect(data).toEqual({
      id: producto.id,
      barcode: producto.barcode,
      name: 'Audífonos Xiaomi Redmi Buds 6 Play',
      brand: 'Xiaomi',
      color: 'Negro',
      originalPriceCents: 10000,
      offerPriceCents: 7000,
      cmrPriceCents: 6650,
      hasCmrDiscount: true,
      campaignName: 'Semana de descuentos',
      discountPercent: 34,
      details: [
        { key: 'conectividad', label: 'Conexión', value: 'Bluetooth', unit: null },
        { key: 'bateria_horas', label: 'Batería', value: 36, unit: 'horas' },
      ],
      // El menor entre el máximo por compra (20) y el stock (7).
      maxQuantity: 7,
    });
  });

  it('deja los tres precios iguales cuando no hay ninguna campaña vigente', async () => {
    const producto = await insertProduct({
      categoryId: audifonos.id,
      name: 'Audífonos buds',
      originalPriceCents: 8990,
    });
    await createCampaign({ discountValue: 3000, active: false });

    const response = await getByBarcode(producto.barcode);

    expect(response.status).toBe(200);

    const data = response.body.data as ScannedProductResponse;

    expect(data.offerPriceCents).toBe(8990);
    expect(data.cmrPriceCents).toBe(8990);
    expect(data.hasCmrDiscount).toBe(false);
    expect(data.campaignName).toBeNull();
    expect(data.discountPercent).toBe(0);
  });

  it('deja el precio CMR igual al de oferta si el producto no tiene descuento CMR', async () => {
    const producto = await insertProduct({ categoryId: camas.id, name: 'Cama king', originalPriceCents: 424900 });
    await createCampaign({
      name: 'Camas en oferta',
      scope: 'CATEGORIES',
      discountType: 'FIXED',
      discountValue: 175000,
      categoryIds: [camas.id],
    });

    const response = await getByBarcode(producto.barcode);

    expect(response.status).toBe(200);

    const data = response.body.data as ScannedProductResponse;

    expect(data.offerPriceCents).toBe(249900);
    expect(data.cmrPriceCents).toBe(249900);
    expect(data.campaignName).toBe('Camas en oferta');
    expect(data.hasCmrDiscount).toBe(false);
  });

  it('nunca devuelve el stock exacto ni el porcentaje CMR', async () => {
    const producto = await insertProduct({
      categoryId: audifonos.id,
      name: 'Audífonos buds',
      originalPriceCents: 10000,
      hasCmrDiscount: true,
      cmrDiscountBps: 2850,
      stock: 4,
      maxPerPurchase: 4,
    });

    const response = await getByBarcode(producto.barcode);
    const claves = Object.keys((response.body.data as ScannedProductResponse) ?? {});

    expect(response.status).toBe(200);
    expect(claves).not.toContain('stock');
    expect(claves).not.toContain('cmrDiscountBps');
    expect(claves).not.toContain('maxPerPurchase');
    expect(JSON.stringify(response.body)).not.toContain('cmrDiscountBps');
  });

  it('devuelve maxQuantity 0 si no hay stock, sin esconder el producto', async () => {
    const producto = await insertProduct({ categoryId: audifonos.id, name: 'Audífonos agotados', stock: 0 });

    const response = await getByBarcode(producto.barcode);

    expect(response.status).toBe(200);

    const data = response.body.data as ScannedProductResponse;

    expect(data.id).toBe(producto.id);
    expect(data.maxQuantity).toBe(0);
  });

  it('devuelve maxQuantity igual al máximo por compra cuando hay más stock', async () => {
    const producto = await insertProduct({
      categoryId: audifonos.id,
      name: 'Audífonos con stock',
      stock: 50,
      maxPerPurchase: 3,
    });

    const response = await getByBarcode(producto.barcode);

    expect((response.body.data as ScannedProductResponse).maxQuantity).toBe(3);
  });

  it('omite los campos sin valor y los campos desactivados de la categoría', async () => {
    const producto = await insertProduct({
      categoryId: audifonos.id,
      name: 'Audífonos con detalles',
      attributes: { conectividad: 'Bluetooth', bateria_horas: 36 },
    });
    const campos = await getTestPrisma().categoryField.findMany({ where: { categoryId: audifonos.id } });
    const conectividad = campos.find((campo) => campo.key === 'conectividad');
    await getTestPrisma().categoryField.update({ where: { id: conectividad?.id }, data: { active: false } });

    const response = await getByBarcode(producto.barcode);

    expect(response.status).toBe(200);
    expect((response.body.data as ScannedProductResponse).details).toEqual([
      { key: 'bateria_horas', label: 'Batería', value: 36, unit: 'horas' },
    ]);
  });

  it('responde 404 PRODUCT_NOT_FOUND si no existe, si está inactivo o si su categoría está inactiva', async () => {
    const existente = await insertProduct({ categoryId: audifonos.id, name: 'Audífonos activos' });
    const inactivo = await insertProduct({
      categoryId: audifonos.id,
      name: 'Audífonos inactivos',
      active: false,
    });
    const conCategoriaInactiva = await insertProduct({ categoryId: camas.id, name: 'Cama sin categoría activa' });

    const codigoInexistente = await getByBarcode(nextBarcode());
    const productoInactivo = await getByBarcode(inactivo.barcode);

    await getTestPrisma().category.update({ where: { id: camas.id }, data: { active: false } });
    const categoriaInactiva = await getByBarcode(conCategoriaInactiva.barcode);

    expect(codigoInexistente.status).toBe(404);
    expect(codigoInexistente.body.error.code).toBe('PRODUCT_NOT_FOUND');
    expect(productoInactivo.status).toBe(404);
    expect(productoInactivo.body.error.code).toBe('PRODUCT_NOT_FOUND');
    expect(categoriaInactiva.status).toBe(404);
    expect(categoriaInactiva.body.error.code).toBe('PRODUCT_NOT_FOUND');

    // El mensaje es el mismo en los tres casos: no revela si el código estuvo dado de baja.
    expect(codigoInexistente.body.error.message).toBe(productoInactivo.body.error.message);
    expect(productoInactivo.body.error.message).toBe(categoriaInactiva.body.error.message);

    const activo = await getByBarcode(existente.barcode);

    expect(activo.status).toBe(200);
  });

  it('responde 400 si el código no son dígitos o no tiene entre 8 y 14', async () => {
    const conLetras = await getByBarcode('ABCDEFGH');
    const muyCorto = await getByBarcode('1234567');
    const muyLargo = await getByBarcode('123456789012345');

    expect(conLetras.status).toBe(400);
    expect(conLetras.body.error.code).toBe('VALIDATION_ERROR');
    expect(conLetras.body.error.message).toContain('8 y 14');
    expect(muyCorto.status).toBe(400);
    expect(muyLargo.status).toBe(400);
  });

  it('deja escanear a cualquier usuario autenticado y pide token si no hay', async () => {
    const producto = await insertProduct({ categoryId: audifonos.id, name: 'Audífonos buds' });

    const admin = await getByBarcode(producto.barcode, adminToken);
    const cajero = await getByBarcode(producto.barcode, cashierToken);
    const cliente = await getByBarcode(producto.barcode, customerToken);
    const sinToken = await request(app).get(`/api/products/barcode/${producto.barcode}`);

    expect(admin.status).toBe(200);
    expect(cajero.status).toBe(200);
    expect(cliente.status).toBe(200);
    expect(sinToken.status).toBe(401);
    expect(sinToken.body.error.code).toBe('UNAUTHORIZED');
  });

  it('registra una lectura solo cuando la consulta es de un cliente y el producto se encuentra', async () => {
    const producto = await insertProduct({ categoryId: audifonos.id, name: 'Audífonos buds' });

    const delCliente = await getByBarcode(producto.barcode, customerToken);
    expect(delCliente.status).toBe(200);

    const delCajero = await getByBarcode(producto.barcode, cashierToken);
    expect(delCajero.status).toBe(200);

    const delAdmin = await getByBarcode(producto.barcode, adminToken);
    expect(delAdmin.status).toBe(200);

    // No se registra cuando la consulta falla: ni código inexistente ni producto inactivo.
    const inexistente = await getByBarcode(nextBarcode());
    expect(inexistente.status).toBe(404);

    const inactivo = await insertProduct({ categoryId: audifonos.id, name: 'Audífonos inactivos', active: false });
    const desactivado = await getByBarcode(inactivo.barcode);
    expect(desactivado.status).toBe(404);

    const lecturas = await getTestPrisma().productScan.findMany({
      where: { productId: producto.id },
      select: { customerId: true },
    });

    expect(lecturas.map((lectura) => lectura.customerId)).toEqual([customerId]);
    expect(await getTestPrisma().productScan.count()).toBe(1);
  });
});

describe('POST /api/products/price-preview', () => {
  it('calcula la oferta y el CMR con la campaña de tienda', async () => {
    const response = await preview({
      originalPriceCents: 10000,
      categoryId: audifonos.id,
      hasCmrDiscount: true,
      cmrDiscountBps: 500,
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      offerPriceCents: 10000,
      cmrPriceCents: 9500,
      campaignName: null,
      discountPercent: 5,
      cmrSavingCents: 500,
    });
  });

  it('aplica la campaña de categoría y no la de producto si no recibe productId', async () => {
    const producto = await insertProduct({ categoryId: audifonos.id, name: 'Audífonos buds' });
    await createCampaign({
      name: 'Audífonos en oferta',
      scope: 'CATEGORIES',
      discountValue: 3000,
      categoryIds: [audifonos.id],
    });
    await createCampaign({ name: 'Solo este producto', scope: 'PRODUCTS', discountValue: 5000, productIds: [producto.id] });

    const sinProductId = await preview({
      originalPriceCents: 10000,
      categoryId: audifonos.id,
      hasCmrDiscount: true,
      cmrDiscountBps: 1000,
    });
    const conProductId = await preview({
      originalPriceCents: 10000,
      categoryId: audifonos.id,
      hasCmrDiscount: true,
      cmrDiscountBps: 1000,
      productId: producto.id,
    });

    expect(sinProductId.body.data).toEqual({
      offerPriceCents: 7000,
      cmrPriceCents: 6300,
      campaignName: 'Audífonos en oferta',
      discountPercent: 37,
      cmrSavingCents: 700,
    });
    expect(conProductId.body.data).toEqual({
      offerPriceCents: 5000,
      cmrPriceCents: 4500,
      campaignName: 'Solo este producto',
      discountPercent: 55,
      cmrSavingCents: 500,
    });
  });

  it('devuelve el CMR igual a la oferta y ahorro cero si el producto no tiene descuento CMR', async () => {
    const response = await preview({
      originalPriceCents: 20000,
      categoryId: camas.id,
      hasCmrDiscount: false,
      cmrDiscountBps: 0,
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      offerPriceCents: 20000,
      cmrPriceCents: 20000,
      campaignName: null,
      discountPercent: 0,
      cmrSavingCents: 0,
    });
  });

  it('no escribe nada en la base de datos', async () => {
    await preview({ originalPriceCents: 10000, categoryId: audifonos.id, hasCmrDiscount: true, cmrDiscountBps: 500 });

    expect(await getTestPrisma().product.count()).toBe(0);
    expect(await getTestPrisma().category.count()).toBe(2);
  });

  it('rechaza con 400 un cuerpo inválido', async () => {
    const sinPrecio = await preview({ categoryId: audifonos.id, hasCmrDiscount: true, cmrDiscountBps: 500 });
    const sinCategoria = await preview({ originalPriceCents: 10000, hasCmrDiscount: true, cmrDiscountBps: 500 });
    const cmrSinDescuento = await preview({
      originalPriceCents: 10000,
      categoryId: audifonos.id,
      hasCmrDiscount: false,
      cmrDiscountBps: 500,
    });
    const cmrExcesivo = await preview({
      originalPriceCents: 10000,
      categoryId: audifonos.id,
      hasCmrDiscount: true,
      cmrDiscountBps: 9001,
    });
    const desconocido = await preview({
      originalPriceCents: 10000,
      categoryId: audifonos.id,
      hasCmrDiscount: true,
      cmrDiscountBps: 500,
      stock: 3,
    });

    expect(sinPrecio.status).toBe(400);
    expect(sinPrecio.body.error.code).toBe('VALIDATION_ERROR');
    expect(sinCategoria.status).toBe(400);
    expect(cmrSinDescuento.status).toBe(400);
    expect(cmrExcesivo.status).toBe(400);
    expect(desconocido.status).toBe(400);
    expect(desconocido.body.error.message).toContain('stock');
  });

  it('responde 403 a un cajero y a un cliente, y 401 sin token', async () => {
    const cuerpo = {
      originalPriceCents: 10000,
      categoryId: audifonos.id,
      hasCmrDiscount: true,
      cmrDiscountBps: 500,
    };

    const cajero = await preview(cuerpo, cashierToken);
    const cliente = await preview(cuerpo, customerToken);
    const sinToken = await request(app).post('/api/products/price-preview').send(cuerpo);

    expect(cajero.status).toBe(403);
    expect(cajero.body.error.code).toBe('FORBIDDEN');
    expect(cliente.status).toBe(403);
    expect(sinToken.status).toBe(401);
    expect(sinToken.body.error.code).toBe('UNAUTHORIZED');
  });
});