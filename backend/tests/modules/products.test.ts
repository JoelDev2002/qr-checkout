import type { FieldType, Prisma } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { ean13CheckDigit } from '../../src/domain/barcode.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

type RoleToken = {
  userId: number;
  token: string;
};

type ProductPrices = {
  originalCents: number;
  normalCents: number;
  cmrCents: number;
  campaignId: number | null;
  campaignName: string | null;
  discountPercent: number;
  cmrPercent: number;
};

type ProductResponse = {
  id: number;
  barcode: string;
  name: string;
  brand: string;
  color: string | null;
  categoryId: number;
  categoryName: string;
  originalPriceCents: number;
  hasCmrDiscount: boolean;
  cmrDiscountBps: number;
  attributes: Record<string, unknown>;
  stock: number;
  maxPerPurchase: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  prices: ProductPrices;
};

type ProductListResponse = {
  items: ProductResponse[];
  total: number;
  page: number;
  pageSize: number;
};

/** Momento fijo de las pruebas: las campañas de debajo están vigentes solo alrededor de esta hora. */
const AHORA = new Date('2026-06-15T15:00:00.000Z');
const CAMPANA_INICIO = new Date('2026-06-01T00:00:00.000Z');
const CAMPANA_FIN = new Date('2026-06-30T00:00:00.000Z');

// Las pruebas no hacen login por HTTP: el hash es un texto fijo porque aquí no se verifica contraseñas.
let emailCounter = 0;

async function createRoleToken(role: AuthRole): Promise<RoleToken> {
  emailCounter += 1;
  const email = `${role.toLowerCase()}-${emailCounter}@falabella.com`;
  const user = await getTestPrisma().user.create({
    data: { email, name: `Usuario ${role}`, role, passwordHash: 'hash-fijo-de-prueba' },
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
    },
    select: { id: true, key: true },
  });
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
  active?: boolean;
  attributes?: Prisma.InputJsonValue;
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
      attributes: data.attributes ?? {},
      stock: data.stock ?? 5,
      active: data.active ?? true,
    },
    select: { id: true, barcode: true },
  });
}

async function createCampaign(data: {
  name?: string;
  scope?: 'PRODUCTS' | 'CATEGORIES' | 'STORE';
  discountValue: number;
  active?: boolean;
  productIds?: number[];
  categoryIds?: number[];
}): Promise<{ id: number; name: string }> {
  return getTestPrisma().campaign.create({
    data: {
      name: data.name ?? 'Semana de descuentos',
      scope: data.scope ?? 'STORE',
      discountType: 'PERCENT',
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
let adminUserId: number;
let cashierToken: string;
let customerToken: string;
let audifonos: { id: number };
let camas: { id: number };
let conectividad: { id: number; key: string };

function productBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    barcode: nextBarcode(),
    name: 'Audífonos Xiaomi Redmi Buds 6 Play',
    brand: 'Xiaomi',
    color: 'Negro',
    categoryId: audifonos.id,
    originalPriceCents: 8990,
    hasCmrDiscount: true,
    cmrDiscountBps: 500,
    stock: 20,
    maxPerPurchase: 20,
    attributes: { conectividad: 'Bluetooth', bateria_horas: 36 },
    ...overrides,
  };
}

async function postProduct(body: Record<string, unknown>): Promise<request.Response> {
  return request(app).post('/api/products').set(...bearer(adminToken)).send(body);
}

async function createProductOk(overrides: Record<string, unknown> = {}): Promise<ProductResponse> {
  const response = await postProduct(productBody(overrides));

  expect(response.status).toBe(200);

  return response.body.data as ProductResponse;
}

async function getList(query = ''): Promise<ProductListResponse> {
  const response = await request(app).get(`/api/products${query}`).set(...bearer(adminToken));

  expect(response.status).toBe(200);

  return response.body.data as ProductListResponse;
}

beforeEach(async () => {
  // La hora se controla para que las campañas de prueba estén vigentes en los bordes conocidos.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);

  await cleanDatabase();
  app = createApp();

  const admin = await createRoleToken('ADMIN');
  adminToken = admin.token;
  adminUserId = admin.userId;
  cashierToken = (await createRoleToken('CASHIER')).token;
  customerToken = (await createRoleToken('CUSTOMER')).token;

  audifonos = await createCategory('Audífonos');
  camas = await createCategory('Camas');

  conectividad = await createField(audifonos.id, {
    key: 'conectividad',
    label: 'Conexión',
    type: 'TEXT',
    required: true,
  });
  await createField(audifonos.id, { key: 'bateria_horas', label: 'Batería', type: 'NUMBER', unit: 'horas' });
  await createField(audifonos.id, {
    key: 'color_disponible',
    label: 'Color disponible',
    type: 'SELECT',
    options: ['Negro', 'Blanco', 'Azul'],
  });
  await createField(camas.id, { key: 'medida', label: 'Medida', type: 'TEXT', required: true });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/products', () => {
  it('crea un producto con descuento CMR guardando la regla, no el resultado', async () => {
    const producto = await createProductOk({
      name: '  Audífonos   Xiaomi  Redmi Buds 6 Play ',
      originalPriceCents: 10000,
      cmrDiscountBps: 2850,
      maxPerPurchase: undefined,
      attributes: { conectividad: '  Bluetooth  ', bateria_horas: 36, color_disponible: 'Negro' },
    });

    expect(producto.name).toBe('Audífonos Xiaomi Redmi Buds 6 Play');
    expect(producto.categoryName).toBe('Audífonos');
    expect(producto.hasCmrDiscount).toBe(true);
    expect(producto.cmrDiscountBps).toBe(2850);
    expect(producto.attributes).toEqual({ conectividad: 'Bluetooth', bateria_horas: 36, color_disponible: 'Negro' });
    // Sin maxPerPurchase se guarda el valor por defecto.
    expect(producto.maxPerPurchase).toBe(10);

    const fila = await getTestPrisma().product.findUnique({ where: { id: producto.id } });

    expect(fila?.originalPriceCents).toBe(10000);
    expect(fila?.cmrDiscountBps).toBe(2850);
    expect(fila?.maxPerPurchase).toBe(10);
    expect(fila?.stock).toBe(20);
    expect(fila?.active).toBe(true);
  });

  it('devuelve los tres precios calculados, sin guardarlos en el producto', async () => {
    const producto = await createProductOk({ originalPriceCents: 10000, cmrDiscountBps: 500 });

    expect(producto.prices).toMatchObject({
      originalCents: 10000,
      normalCents: 10000,
      cmrCents: 9500,
      campaignId: null,
      campaignName: null,
      discountPercent: 0,
      cmrPercent: 5,
    });

    const fila = await getTestPrisma().product.findUnique({ where: { id: producto.id } });

    // El producto solo guarda el precio original y su regla CMR.
    expect(Object.keys(fila ?? {}).filter((clave) => clave.includes('Price'))).toEqual(['originalPriceCents']);
  });

  it('crea un producto sin descuento CMR: el precio CMR es el de oferta', async () => {
    const producto = await createProductOk({
      originalPriceCents: 8990,
      hasCmrDiscount: false,
      cmrDiscountBps: 0,
    });

    expect(producto.prices.normalCents).toBe(producto.prices.originalCents);
    expect(producto.prices.cmrCents).toBe(producto.prices.originalCents);
    expect(producto.prices.cmrPercent).toBe(0);
  });

  it('registra el stock inicial como un ajuste con motivo y con el admin que lo creó', async () => {
    const producto = await createProductOk({ stock: 20 });

    expect(producto.stock).toBe(20);

    const ajustes = await getTestPrisma().stockAdjustment.findMany({ where: { productId: producto.id } });

    expect(ajustes).toHaveLength(1);
    expect(ajustes[0]?.delta).toBe(20);
    expect(ajustes[0]?.reason).toBe('Stock inicial');
    expect(ajustes[0]?.userId).toBe(adminUserId);
  });

  it('no crea ningún ajuste si el stock inicial es cero', async () => {
    const producto = await createProductOk({ stock: 0 });

    expect(producto.stock).toBe(0);
    expect(await getTestPrisma().stockAdjustment.count({ where: { productId: producto.id } })).toBe(0);
  });

  it('responde 409 DUPLICATE_BARCODE si el código ya existe', async () => {
    const barcode = nextBarcode();
    await createProductOk({ barcode });

    const repetido = await postProduct(productBody({ barcode }));

    expect(repetido.status).toBe(409);
    expect(repetido.body.error.code).toBe('DUPLICATE_BARCODE');
    expect(await getTestPrisma().product.count()).toBe(1);
  });

  it('rechaza con 400 un código que no es un EAN-13 válido', async () => {
    const sinVerificador = await postProduct(productBody({ barcode: '2000000000000' }));
    const conLetras = await postProduct(productBody({ barcode: 'ABCDEFGHIJKLM' }));
    const corto = await postProduct(productBody({ barcode: '200000000001' }));

    expect(sinVerificador.status).toBe(400);
    expect(sinVerificador.body.error.code).toBe('VALIDATION_ERROR');
    expect(sinVerificador.body.error.message).toContain('EAN-13');
    expect(conLetras.status).toBe(400);
    expect(conLetras.body.error.message).toContain('13 dígitos');
    expect(corto.status).toBe(400);
    expect(await getTestPrisma().product.count()).toBe(0);
  });

  it('rechaza con 400 una categoría que no existe o que está desactivada', async () => {
    const inexistente = await postProduct(productBody({ categoryId: 987654 }));
    await getTestPrisma().category.update({ where: { id: camas.id }, data: { active: false } });
    const inactiva = await postProduct(productBody({ categoryId: camas.id }));

    expect(inexistente.status).toBe(400);
    expect(inexistente.body.error.code).toBe('VALIDATION_ERROR');
    expect(inexistente.body.error.message).toContain('categoría no existe');
    expect(inactiva.status).toBe(400);
    expect(inactiva.body.error.message).toContain('desactivada');
    expect(await getTestPrisma().product.count()).toBe(0);
  });

  it('rechaza con 400 INVALID_ATTRIBUTES si falta un campo obligatorio o el valor está mal', async () => {
    const sinObligatorio = await postProduct(
      productBody({ attributes: { bateria_horas: 36, color_disponible: 'Negro' } }),
    );
    const tipoIncorrecto = await postProduct(productBody({ attributes: { conectividad: 'Bluetooth', bateria_horas: '36' } }));
    const fueraDeLaLista = await postProduct(
      productBody({ attributes: { conectividad: 'Bluetooth', color_disponible: 'Verde' } }),
    );
    const claveDesconocida = await postProduct(
      productBody({ attributes: { conectividad: 'Bluetooth', loudness: 12 } }),
    );
    const sinAtributos = await postProduct({ ...productBody(), attributes: undefined });

    expect(sinObligatorio.status).toBe(400);
    expect(sinObligatorio.body.error.code).toBe('INVALID_ATTRIBUTES');
    expect(sinObligatorio.body.error.message).toContain('Conexión es obligatorio');
    expect(tipoIncorrecto.status).toBe(400);
    expect(tipoIncorrecto.body.error.code).toBe('INVALID_ATTRIBUTES');
    expect(tipoIncorrecto.body.error.message).toContain('Batería');
    expect(fueraDeLaLista.status).toBe(400);
    expect(fueraDeLaLista.body.error.message).toContain('Negro, Blanco, Azul');
    expect(claveDesconocida.status).toBe(400);
    expect(claveDesconocida.body.error.message).toContain('loudness');
    expect(sinAtributos.status).toBe(400);
    expect(sinAtributos.body.error.code).toBe('INVALID_ATTRIBUTES');
    expect(await getTestPrisma().product.count()).toBe(0);
  });

  it('rechaza con 400 un campo obligatorio del formulario que falta', async () => {
    const sinNombre = await postProduct(productBody({ name: undefined }));
    const sinMarca = await postProduct(productBody({ brand: undefined }));
    const sinPrecio = await postProduct(productBody({ originalPriceCents: undefined }));
    const sinStock = await postProduct(productBody({ stock: undefined }));

    expect(sinNombre.status).toBe(400);
    expect(sinNombre.body.error.code).toBe('VALIDATION_ERROR');
    expect(sinNombre.body.error.message).toContain('nombre del producto es obligatorio');
    expect(sinMarca.status).toBe(400);
    expect(sinPrecio.status).toBe(400);
    expect(sinStock.status).toBe(400);
    expect(await getTestPrisma().product.count()).toBe(0);
  });

  it('rechaza con 400 un precio, un stock o un máximo por compra que no son enteros válidos', async () => {
    const precioCero = await postProduct(productBody({ originalPriceCents: 0 }));
    const precioDecimal = await postProduct(productBody({ originalPriceCents: 8990.5 }));
    const stockNegativo = await postProduct(productBody({ stock: -1 }));
    const maximoCero = await postProduct(productBody({ maxPerPurchase: 0 }));

    expect(precioCero.status).toBe(400);
    expect(precioCero.body.error.message).toContain('mayor que cero');
    expect(precioDecimal.status).toBe(400);
    expect(precioDecimal.body.error.message).toContain('entero');
    expect(stockNegativo.status).toBe(400);
    expect(maximoCero.status).toBe(400);
  });

  it('rechaza con 400 un porcentaje CMR que no llega al 1, que pasa del 90 % o que viene sin descuento CMR', async () => {
    const enCero = await postProduct(productBody({ cmrDiscountBps: 0 }));
    const demais = await postProduct(productBody({ cmrDiscountBps: 9001 }));
    const maximo = await postProduct(productBody({ cmrDiscountBps: 9000 }));
    const sinDescuento = await postProduct(productBody({ hasCmrDiscount: false, cmrDiscountBps: 500 }));
    const sinCampo = await postProduct({ ...productBody(), cmrDiscountBps: undefined, hasCmrDiscount: true });

    expect(enCero.status).toBe(400);
    expect(enCero.body.error.code).toBe('VALIDATION_ERROR');
    expect(enCero.body.error.message).toContain('hasta 90');
    expect(demais.status).toBe(400);
    expect(maximo.status).toBe(200);
    expect(sinDescuento.status).toBe(400);
    expect(sinDescuento.body.error.message).toContain('en 0');
    expect(sinCampo.status).toBe(400);
  });

  it('acepta un producto sin color y con los campos de otra categoría', async () => {
    const producto = await createProductOk({
      barcode: nextBarcode(),
      name: 'Cama matrimonial',
      brand: 'Dormitorio Tempo',
      color: undefined,
      categoryId: camas.id,
      originalPriceCents: 424900,
      hasCmrDiscount: false,
      cmrDiscountBps: 0,
      stock: 3,
      attributes: { medida: 'Matrimonial' },
    });

    expect(producto.color).toBeNull();
    expect(producto.categoryName).toBe('Camas');
    expect(producto.attributes).toEqual({ medida: 'Matrimonial' });
  });

  it('responde 403 a un cajero y a un cliente, y 401 sin token', async () => {
    const cuerpo = productBody();

    const cajero = await request(app).post('/api/products').set(...bearer(cashierToken)).send(cuerpo);
    const cliente = await request(app).post('/api/products').set(...bearer(customerToken)).send(cuerpo);
    const sinToken = await request(app).post('/api/products').send(cuerpo);

    expect(cajero.status).toBe(403);
    expect(cajero.body.error.code).toBe('FORBIDDEN');
    expect(cliente.status).toBe(403);
    expect(sinToken.status).toBe(401);
    expect(sinToken.body.error.code).toBe('UNAUTHORIZED');
    expect(await getTestPrisma().product.count()).toBe(0);
  });
});

describe('PUT /api/products/:id', () => {
  it('actualiza los datos y devuelve los precios recalculados', async () => {
    const producto = await createProductOk({ originalPriceCents: 10000, cmrDiscountBps: 500 });

    const response = await request(app)
      .put(`/api/products/${producto.id}`)
      .set(...bearer(adminToken))
      .send({
        name: '  Audífonos  Redmi Buds 6 ',
        brand: '  Xiaomi ',
        color: '  Blanco ',
        categoryId: audifonos.id,
        originalPriceCents: 12000,
        hasCmrDiscount: true,
        cmrDiscountBps: 1000,
        maxPerPurchase: 5,
        attributes: { conectividad: 'Bluetooth', bateria_horas: 36, color_disponible: 'Blanco' },
      });

    expect(response.status).toBe(200);

    const actualizado = response.body.data as ProductResponse;

    expect(actualizado.name).toBe('Audífonos Redmi Buds 6');
    expect(actualizado.brand).toBe('Xiaomi');
    expect(actualizado.color).toBe('Blanco');
    expect(actualizado.originalPriceCents).toBe(12000);
    expect(actualizado.cmrDiscountBps).toBe(1000);
    expect(actualizado.maxPerPurchase).toBe(5);
    expect(actualizado.barcode).toBe(producto.barcode);
    expect(actualizado.stock).toBe(producto.stock);
    expect(actualizado.prices.normalCents).toBe(12000);
    expect(actualizado.prices.cmrCents).toBe(10800);
  });

  it('rechaza con 400 el código de barras, el stock y cualquier campo desconocido', async () => {
    const producto = await createProductOk();
    const cuerpo = {
      name: 'Otro nombre',
      brand: 'Xiaomi',
      categoryId: audifonos.id,
      originalPriceCents: 8990,
      hasCmrDiscount: true,
      cmrDiscountBps: 500,
      maxPerPurchase: 20,
      attributes: { conectividad: 'Bluetooth' },
    };

    const conBarcode = await request(app)
      .put(`/api/products/${producto.id}`)
      .set(...bearer(adminToken))
      .send({ ...cuerpo, barcode: nextBarcode() });
    const conStock = await request(app)
      .put(`/api/products/${producto.id}`)
      .set(...bearer(adminToken))
      .send({ ...cuerpo, stock: 50 });
    const conDesconocido = await request(app)
      .put(`/api/products/${producto.id}`)
      .set(...bearer(adminToken))
      .send({ ...cuerpo, imageUrl: 'https://ejemplo.com/foto.png' });

    expect(conBarcode.status).toBe(400);
    expect(conBarcode.body.error.code).toBe('VALIDATION_ERROR');
    expect(conBarcode.body.error.message).toContain('barcode');
    expect(conStock.status).toBe(400);
    expect(conStock.body.error.message).toContain('stock');
    expect(conDesconocido.status).toBe(400);
    expect(conDesconocido.body.error.message).toContain('imageUrl');

    const fila = await getTestPrisma().product.findUnique({ where: { id: producto.id } });

    expect(fila?.name).toBe('Audífonos Xiaomi Redmi Buds 6 Play');
    expect(fila?.stock).toBe(20);
    expect(await getTestPrisma().stockAdjustment.count({ where: { productId: producto.id } })).toBe(1);
  });

  it('conserva los valores ya guardados de los campos desactivados', async () => {
    const producto = await createProductOk({ attributes: { conectividad: 'Bluetooth', bateria_horas: 36 } });

    await getTestPrisma().categoryField.update({ where: { id: conectividad.id }, data: { active: false } });

    const response = await request(app)
      .put(`/api/products/${producto.id}`)
      .set(...bearer(adminToken))
      .send({
        name: 'Audífonos Xiaomi Redmi Buds 6 Play',
        brand: 'Xiaomi',
        categoryId: audifonos.id,
        originalPriceCents: 8990,
        hasCmrDiscount: true,
        cmrDiscountBps: 500,
        maxPerPurchase: 20,
        attributes: { bateria_horas: 40 },
      });

    expect(response.status).toBe(200);
    // El valor del campo desactivado sobrevive y el del activo se reemplaza.
    expect((response.body.data as ProductResponse).attributes).toEqual({
      conectividad: 'Bluetooth',
      bateria_horas: 40,
    });
  });

  it('rechaza con 400 enviar la clave de un campo desactivado', async () => {
    const producto = await createProductOk();
    await getTestPrisma().categoryField.update({ where: { id: conectividad.id }, data: { active: false } });

    const response = await request(app)
      .put(`/api/products/${producto.id}`)
      .set(...bearer(adminToken))
      .send({
        name: 'Audífonos Xiaomi Redmi Buds 6 Play',
        brand: 'Xiaomi',
        categoryId: audifonos.id,
        originalPriceCents: 8990,
        hasCmrDiscount: true,
        cmrDiscountBps: 500,
        maxPerPurchase: 20,
        attributes: { conectividad: 'Bluetooth', bateria_horas: 40 },
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_ATTRIBUTES');
    expect(response.body.error.message).toContain('conectividad');
  });

  it('responde 409 CONFLICT con las claves si al cambiar de categoría sobran valores', async () => {
    const producto = await createProductOk({ attributes: { conectividad: 'Bluetooth', bateria_horas: 36 } });

    const response = await request(app)
      .put(`/api/products/${producto.id}`)
      .set(...bearer(adminToken))
      .send({
        name: 'Cama matrimonial',
        brand: 'Dormitorio Tempo',
        categoryId: camas.id,
        originalPriceCents: 424900,
        hasCmrDiscount: true,
        cmrDiscountBps: 500,
        maxPerPurchase: 10,
        attributes: { medida: 'Matrimonial' },
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
    expect(response.body.error.message).toContain('conectividad');
    expect(response.body.error.message).toContain('bateria_horas');

    const fila = await getTestPrisma().product.findUnique({ where: { id: producto.id } });

    expect(fila?.categoryId).toBe(audifonos.id);
    expect(fila?.attributes).toEqual({ conectividad: 'Bluetooth', bateria_horas: 36 });
  });

  it('cambia de categoría y descarta esos valores cuando el cuerpo trae discardAttributes', async () => {
    const producto = await createProductOk({ attributes: { conectividad: 'Bluetooth', bateria_horas: 36 } });

    const response = await request(app)
      .put(`/api/products/${producto.id}`)
      .set(...bearer(adminToken))
      .send({
        name: 'Cama matrimonial',
        brand: 'Dormitorio Tempo',
        categoryId: camas.id,
        originalPriceCents: 424900,
        hasCmrDiscount: true,
        cmrDiscountBps: 500,
        maxPerPurchase: 10,
        attributes: { medida: 'Matrimonial' },
        discardAttributes: true,
      });

    expect(response.status).toBe(200);

    const actualizado = response.body.data as ProductResponse;

    expect(actualizado.categoryId).toBe(camas.id);
    expect(actualizado.categoryName).toBe('Camas');
    expect(actualizado.attributes).toEqual({ medida: 'Matrimonial' });
  });

  it('deja el producto como estaba si el cambio de categoría se rechaza', async () => {
    const producto = await createProductOk();

    const invalidos = await request(app)
      .put(`/api/products/${producto.id}`)
      .set(...bearer(adminToken))
      .send({
        name: 'Audífonos Xiaomi Redmi Buds 6 Play',
        brand: 'Xiaomi',
        categoryId: 987654,
        originalPriceCents: 8990,
        hasCmrDiscount: true,
        cmrDiscountBps: 500,
        maxPerPurchase: 20,
        attributes: { conectividad: 'Bluetooth' },
      });
    const atributosInvalidos = await request(app)
      .put(`/api/products/${producto.id}`)
      .set(...bearer(adminToken))
      .send({
        name: 'Audífonos Xiaomi Redmi Buds 6 Play',
        brand: 'Xiaomi',
        categoryId: audifonos.id,
        originalPriceCents: 8990,
        hasCmrDiscount: true,
        cmrDiscountBps: 500,
        maxPerPurchase: 20,
        attributes: { loudness: 12 },
      });

    expect(invalidos.status).toBe(400);
    expect(invalidos.body.error.code).toBe('VALIDATION_ERROR');
    expect(atributosInvalidos.status).toBe(400);
    expect(atributosInvalidos.body.error.code).toBe('INVALID_ATTRIBUTES');

    const fila = await getTestPrisma().product.findUnique({ where: { id: producto.id } });

    expect(fila?.name).toBe('Audífonos Xiaomi Redmi Buds 6 Play');
    expect(fila?.originalPriceCents).toBe(8990);
  });

  it('responde 404 si el producto no existe y 400 si el id no es un número', async () => {
    const cuerpo = {
      name: 'Audífonos',
      brand: 'Xiaomi',
      categoryId: audifonos.id,
      originalPriceCents: 8990,
      hasCmrDiscount: false,
      cmrDiscountBps: 0,
      maxPerPurchase: 10,
      attributes: { conectividad: 'Bluetooth' },
    };

    const inexistente = await request(app).put('/api/products/999').set(...bearer(adminToken)).send(cuerpo);
    const noNumerico = await request(app).put('/api/products/abc').set(...bearer(adminToken)).send(cuerpo);
    const cero = await request(app).put('/api/products/0').set(...bearer(adminToken)).send(cuerpo);

    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.code).toBe('NOT_FOUND');
    expect(noNumerico.status).toBe(400);
    expect(noNumerico.body.error.code).toBe('VALIDATION_ERROR');
    expect(cero.status).toBe(400);
  });

  it('responde 403 a un cajero y a un cliente, y 401 sin token', async () => {
    const producto = await createProductOk();
    const cuerpo = {
      name: 'Otro nombre',
      brand: 'Xiaomi',
      categoryId: audifonos.id,
      originalPriceCents: 8990,
      hasCmrDiscount: false,
      cmrDiscountBps: 0,
      maxPerPurchase: 10,
      attributes: { conectividad: 'Bluetooth' },
    };

    const cajero = await request(app).put(`/api/products/${producto.id}`).set(...bearer(cashierToken)).send(cuerpo);
    const cliente = await request(app)
      .put(`/api/products/${producto.id}`)
      .set(...bearer(customerToken))
      .send(cuerpo);
    const sinToken = await request(app).put(`/api/products/${producto.id}`).send(cuerpo);

    expect(cajero.status).toBe(403);
    expect(cliente.status).toBe(403);
    expect(sinToken.status).toBe(401);
  });
});

describe('PATCH /api/products/:id/active', () => {
  it('desactiva y reactiva el producto sin borrarlo', async () => {
    const producto = await createProductOk();

    const desactivado = await request(app)
      .patch(`/api/products/${producto.id}/active`)
      .set(...bearer(adminToken))
      .send({ active: false });

    expect(desactivado.status).toBe(200);
    expect((desactivado.body.data as ProductResponse).active).toBe(false);
    expect(await getTestPrisma().product.findUnique({ where: { id: producto.id } })).not.toBeNull();

    const reactivado = await request(app)
      .patch(`/api/products/${producto.id}/active`)
      .set(...bearer(adminToken))
      .send({ active: true });

    expect(reactivado.status).toBe(200);
    expect((reactivado.body.data as ProductResponse).active).toBe(true);
    expect(await getTestPrisma().product.findUnique({ where: { id: producto.id } })).not.toBeNull();
  });

  it('rechaza con 400 un active que no es booleano y con 404 un producto que no existe', async () => {
    const producto = await createProductOk();

    const invalido = await request(app)
      .patch(`/api/products/${producto.id}/active`)
      .set(...bearer(adminToken))
      .send({ active: 'no' });
    const inexistente = await request(app)
      .patch('/api/products/999/active')
      .set(...bearer(adminToken))
      .send({ active: false });

    expect(invalido.status).toBe(400);
    expect(invalido.body.error.code).toBe('VALIDATION_ERROR');
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.code).toBe('NOT_FOUND');
  });

  it('responde 403 a un cajero y 401 sin token', async () => {
    const producto = await createProductOk();

    const cajero = await request(app)
      .patch(`/api/products/${producto.id}/active`)
      .set(...bearer(cashierToken))
      .send({ active: false });
    const sinToken = await request(app)
      .patch(`/api/products/${producto.id}/active`)
      .send({ active: false });

    expect(cajero.status).toBe(403);
    expect(sinToken.status).toBe(401);
  });
});

describe('GET /api/products', () => {
  it('calcula los precios con la campaña vigente y nombra la campaña que gana', async () => {
    const conCmr = await insertProduct({
      categoryId: audifonos.id,
      name: 'Audifonos buds',
      originalPriceCents: 10000,
      hasCmrDiscount: true,
      cmrDiscountBps: 500,
    });
    const sinCmr = await insertProduct({ categoryId: camas.id, name: 'Cama king', originalPriceCents: 20000 });

    const campana = await createCampaign({ discountValue: 3000, scope: 'PRODUCTS', productIds: [conCmr.id] });

    const listado = await getList();
    const porId = new Map(listado.items.map((producto) => [producto.id, producto]));

    expect(porId.get(conCmr.id)?.prices).toEqual({
      originalCents: 10000,
      normalCents: 7000,
      cmrCents: 6650,
      campaignId: campana.id,
      campaignName: 'Semana de descuentos',
      discountPercent: 30,
      cmrPercent: 34,
    });
    // La campaña no alcanza a este producto: oferta = original y CMR = oferta.
    expect(porId.get(sinCmr.id)?.prices).toMatchObject({
      normalCents: 20000,
      cmrCents: 20000,
      campaignId: null,
      campaignName: null,
    });
  });

  it('deja el producto sin descuento cuando no hay ninguna campaña vigente', async () => {
    await insertProduct({
      categoryId: audifonos.id,
      name: 'Audifonos buds',
      originalPriceCents: 10000,
      hasCmrDiscount: true,
      cmrDiscountBps: 500,
    });

    await createCampaign({ discountValue: 3000, active: false });
    await getTestPrisma().campaign.create({
      data: {
        name: 'Fuera de fecha',
        scope: 'STORE',
        discountType: 'PERCENT',
        discountValue: 3000,
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2026-01-31T00:00:00.000Z'),
        active: true,
      },
    });

    const listado = await getList();

    expect(listado.items[0]?.prices).toMatchObject({
      originalCents: 10000,
      normalCents: 10000,
      cmrCents: 9500,
      campaignId: null,
      campaignName: null,
      discountPercent: 0,
    });
  });

  it('busca por nombre, por marca y por código de barras', async () => {
    const audifono = await insertProduct({
      categoryId: audifonos.id,
      name: 'Audifonos Redmi Buds 6 Play',
      brand: 'Xiaomi',
    });
    const cama = await insertProduct({ categoryId: camas.id, name: 'Cama matrimonial', brand: 'Dormitorio Tempo' });

    expect((await getList('?q=Redmi')).items.map((item) => item.id)).toEqual([audifono.id]);
    expect((await getList('?q=matrimonial')).items.map((item) => item.id)).toEqual([cama.id]);
    expect((await getList('?q=Tempo')).items.map((item) => item.id)).toEqual([cama.id]);
    expect((await getList(`?q=${audifono.barcode}`)).items.map((item) => item.id)).toEqual([audifono.id]);
    expect((await getList('?q=Nada de esto')).items).toEqual([]);
  });

  it('filtra por categoría y por estado activo', async () => {
    const activo = await insertProduct({ categoryId: audifonos.id, name: 'Audifonos activo' });
    const inactivo = await insertProduct({ categoryId: audifonos.id, name: 'Audifonos inactivo', active: false });
    const cama = await insertProduct({ categoryId: camas.id, name: 'Cama activa' });

    const porCategoria = await getList(`?categoryId=${audifonos.id}`);
    expect(porCategoria.items.map((item) => item.id)).toEqual([activo.id, inactivo.id]);

    const soloActivos = await getList('?active=true');
    expect(soloActivos.items.map((item) => item.id)).toEqual([activo.id, cama.id]);

    const soloInactivos = await getList('?active=false');
    expect(soloInactivos.items.map((item) => item.id)).toEqual([inactivo.id]);

    const combinados = await getList(`?categoryId=${audifonos.id}&active=false`);
    expect(combinados.items.map((item) => item.id)).toEqual([inactivo.id]);
    expect(combinados.total).toBe(1);
  });

  it('ordena por nombre y pagina sin repetir ni perder productos', async () => {
    const cama = await insertProduct({ categoryId: camas.id, name: 'Camilla king' });
    const audifono = await insertProduct({ categoryId: audifonos.id, name: 'Audifonos buds' });
    const zapatillas = await insertProduct({ categoryId: audifonos.id, name: 'Zapatillas running' });

    const todo = await getList();

    expect(todo.total).toBe(3);
    expect(todo.items.map((item) => item.name)).toEqual([
      'Audifonos buds',
      'Camilla king',
      'Zapatillas running',
    ]);
    expect(todo.page).toBe(1);
    expect(todo.pageSize).toBe(20);

    const primera = await getList('?pageSize=2');
    expect(primera.pageSize).toBe(2);
    expect(primera.total).toBe(3);
    expect(primera.items.map((item) => item.id)).toEqual([audifono.id, cama.id]);

    const segunda = await getList('?pageSize=2&page=2');
    expect(segunda.items.map((item) => item.id)).toEqual([zapatillas.id]);

    const tercera = await getList('?pageSize=2&page=3');
    expect(tercera.items).toEqual([]);
    expect(tercera.total).toBe(3);
  });

  it('rechaza con 400 una consulta inválida', async () => {
    const pedir = (query: string) => request(app).get(`/api/products${query}`).set(...bearer(adminToken));

    const categoria = await pedir('?categoryId=abc');
    const pagina = await pedir('?page=0');
    const tamano = await pedir('?pageSize=101');
    const estado = await pedir('?active=quiza');

    expect(categoria.status).toBe(400);
    expect(categoria.body.error.code).toBe('VALIDATION_ERROR');
    expect(pagina.status).toBe(400);
    expect(tamano.status).toBe(400);
    expect(tamano.body.error.message).toContain('100');
    expect(estado.status).toBe(400);
  });
});

describe('GET /api/products/:id', () => {
  it('devuelve el producto con sus precios y los de sus datos guardados', async () => {
    const producto = await createProductOk({ originalPriceCents: 10000, cmrDiscountBps: 500 });

    const response = await request(app).get(`/api/products/${producto.id}`).set(...bearer(adminToken));

    expect(response.status).toBe(200);

    const detalle = response.body.data as ProductResponse;

    expect(detalle.id).toBe(producto.id);
    expect(detalle.barcode).toBe(producto.barcode);
    expect(detalle.stock).toBe(20);
    expect(detalle.prices).toMatchObject({ originalCents: 10000, normalCents: 10000, cmrCents: 9500 });
    expect(typeof detalle.createdAt).toBe('string');
  });

  it('responde 404 si el producto no existe y 400 si el id no es un número', async () => {
    const inexistente = await request(app).get('/api/products/999').set(...bearer(adminToken));
    const noNumerico = await request(app).get('/api/products/abc').set(...bearer(adminToken));

    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.code).toBe('NOT_FOUND');
    expect(noNumerico.status).toBe(400);
    expect(noNumerico.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('responde 403 a un cajero y a un cliente, y 401 sin token', async () => {
    const producto = await createProductOk();

    const cajero = await request(app).get(`/api/products/${producto.id}`).set(...bearer(cashierToken));
    const cliente = await request(app).get(`/api/products/${producto.id}`).set(...bearer(customerToken));
    const sinToken = await request(app).get(`/api/products/${producto.id}`);

    expect(cajero.status).toBe(403);
    expect(cajero.body.error.code).toBe('FORBIDDEN');
    expect(cliente.status).toBe(403);
    expect(sinToken.status).toBe(401);

    const listadoCajero = await request(app).get('/api/products').set(...bearer(cashierToken));
    expect(listadoCajero.status).toBe(403);
  });
});