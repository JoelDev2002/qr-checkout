import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { ean13CheckDigit } from '../../src/domain/barcode.js';
import { CART_CODE_ALPHABET } from '../../src/domain/cartCode.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';
import { CHECKOUT_RATE_LIMIT_MAX } from '../../src/modules/checkout/routes.js';

/** Momento fijo dentro de la vigencia de las campañas de estas pruebas. */
const AHORA = new Date('2026-06-15T15:00:00.000Z');
const CAMPANA_INICIO = new Date('2026-06-01T00:00:00.000Z');
const CAMPANA_FIN = new Date('2026-06-30T00:00:00.000Z');
const MINUTO = 60 * 1000;
const VIGENTE = new Date(AHORA.getTime() + 20 * MINUTO);

type CheckoutItemResponse = {
  productId: number;
  barcode: string;
  name: string;
  brand: string;
  quantity: number;
  originalPriceCents: number;
  offerPriceCents: number;
  cmrPriceCents: number;
  hasCmrDiscount: boolean;
  campaignName: string | null;
  issue: 'INACTIVE' | 'INSUFFICIENT_STOCK' | null;
};

type CheckoutPreviewResponse = {
  code: string;
  qrExpiresAt: string;
  customerName: string;
  items: CheckoutItemResponse[];
  summary: {
    originalTotalCents: number;
    discountTotalCents: number;
    normalTotalCents: number;
    cmrTotalCents: number;
    cmrSavingCents: number;
  };
  canCharge: boolean;
};

type CartResponse = {
  id: number;
  status: 'OPEN' | 'PENDING' | 'PAID' | 'CANCELLED';
  qrCode: string | null;
  qrExpiresAt: string | null;
  items: CheckoutItemResponse[];
};

let emailCounter = 0;
let barcodeCounter = 0;
let qrCounter = 0;

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

/** Código con el formato de RN-05, sin los caracteres que el cajero puede leer mal. */
function nextQrCode(): string {
  qrCounter += 1;
  let resto = qrCounter;
  let sufijo = '';

  for (let i = 0; i < 5; i++) {
    sufijo = CART_CODE_ALPHABET[resto % CART_CODE_ALPHABET.length] + sufijo;
    resto = Math.floor(resto / CART_CODE_ALPHABET.length);
  }

  return `C-${sufijo}`;
}

function nextBarcode(): string {
  barcodeCounter += 1;
  const body = `200000${String(barcodeCounter).padStart(6, '0')}`;

  return `${body}${ean13CheckDigit(body)}`;
}

/** Audífonos de la tabla de ARCHITECTURE.md §10: con oferta de 5000 céntimos queda en 3990 / 3790. */
async function insertAudifonos(categoryId: number, stock = 20): Promise<{ id: number; barcode: string }> {
  return getTestPrisma().product.create({
    data: {
      barcode: nextBarcode(),
      name: 'Audífonos Xiaomi Redmi Buds 6 Play',
      brand: 'Xiaomi',
      categoryId,
      originalPriceCents: 8990,
      hasCmrDiscount: true,
      cmrDiscountBps: 501,
      stock,
      maxPerPurchase: 20,
    },
    select: { id: true, barcode: true },
  });
}

async function createFixedCampaign(productId: number, name = 'Oferta de audífonos'): Promise<{ id: number }> {
  return getTestPrisma().campaign.create({
    data: {
      name,
      scope: 'PRODUCTS',
      discountType: 'FIXED',
      discountValue: 5000,
      startsAt: CAMPANA_INICIO,
      endsAt: CAMPANA_FIN,
      products: { create: [{ productId }] },
    },
    select: { id: true },
  });
}

/** Carrito del cliente con su QR vigente, como si ya hubiera llegado a caja. */
async function createPendingCart(data: {
  items: Array<{ productId: number; quantity: number }>;
  status?: 'PENDING' | 'PAID';
  expiresAt?: Date | null;
}): Promise<{ id: number; code: string }> {
  const qrCode = nextQrCode();
  const cart = await getTestPrisma().cart.create({
    data: {
      customerId: cliente.id,
      status: data.status ?? 'PENDING',
      qrCode,
      qrExpiresAt: data.expiresAt === undefined ? VIGENTE : data.expiresAt,
      items: { create: data.items },
    },
    select: { id: true, qrCode: true },
  });

  return { id: cart.id, code: cart.qrCode ?? qrCode };
}

let app: Express;
let cliente: { id: number; token: string };
let cajero: { id: number; token: string };
let adminToken: string;
let tecnologia: { id: number };

async function preview(code: string, token = cajero.token): Promise<request.Response> {
  return request(app).get(`/api/checkout/${code}`).set(...bearer(token));
}

async function reject(code: string, token = cajero.token): Promise<request.Response> {
  return request(app).post(`/api/checkout/${code}/reject`).set(...bearer(token));
}

function expectPreview(response: request.Response): CheckoutPreviewResponse {
  expect(response.status).toBe(200);

  return response.body.data as CheckoutPreviewResponse;
}

function firstItem(previewData: CheckoutPreviewResponse): CheckoutItemResponse {
  const item = previewData.items[0];

  if (!item) {
    throw new Error('La vista previa no tiene ítems.');
  }

  return item;
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

  tecnologia = await getTestPrisma().category.create({ data: { name: 'Audífonos' } });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/checkout/:code', () => {
  it('muestra el carrito con los dos totales calculados con la campaña vigente', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    await createFixedCampaign(producto.id);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 2 }] });

    const data = expectPreview(await preview(code));

    expect(data.code).toBe(code);
    expect(data.customerName).toBe('María Cliente');
    expect(data.qrExpiresAt).toBe(VIGENTE.toISOString());
    expect(data.canCharge).toBe(true);
    expect(data.items).toHaveLength(1);

    const item = firstItem(data);
    expect(item.name).toBe('Audífonos Xiaomi Redmi Buds 6 Play');
    expect(item.brand).toBe('Xiaomi');
    expect(item.quantity).toBe(2);
    expect(item.originalPriceCents).toBe(8990);
    expect(item.offerPriceCents).toBe(3990);
    expect(item.cmrPriceCents).toBe(3790);
    expect(item.campaignName).toBe('Oferta de audífonos');
    expect(item.issue).toBeNull();

    expect(data.summary).toEqual({
      originalTotalCents: 17980,
      discountTotalCents: 10000,
      normalTotalCents: 7980,
      cmrTotalCents: 7580,
      cmrSavingCents: 400,
    });
  });

  it('sin campañas cobra el precio original y nunca envía el stock exacto', async () => {
    const producto = await insertAudifonos(tecnologia.id, 7);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    const data = expectPreview(await preview(code));
    const item = firstItem(data);

    expect(item.originalPriceCents).toBe(8990);
    expect(item.offerPriceCents).toBe(8990);
    expect(item.cmrPriceCents).toBe(8540);
    expect(item.campaignName).toBeNull();
    expect(item).not.toHaveProperty('stock');
    expect(item).not.toHaveProperty('maxQuantity');
    expect(data.summary.normalTotalCents).toBe(8990);
    expect(data.summary.cmrTotalCents).toBe(8540);
  });

  it('acepta el código en minúsculas y con espacios', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    const data = expectPreview(await preview(` ${code.toLowerCase().replace('-', ' - ')} `));

    expect(data.code).toBe(code);
  });

  it('rechaza con 400 un código con formato inválido, sin llegar a la base de datos', async () => {
    const mensaje = await expectError(await preview('cualquier-cosa'), 400, 'VALIDATION_ERROR');

    expect(mensaje).toBe('El código del QR no tiene el formato válido.');
    expect(await getTestPrisma().cart.count({ where: { qrCode: { not: null } } })).toBe(0);
  });

  it('responde 404 con el mismo mensaje si el código no existe', async () => {
    const mensaje = await expectError(await preview('C-ZZZZZ'), 404, 'NOT_FOUND');

    expect(mensaje).toBe('Código no válido o vencido');
  });

  it('responde 409 ALREADY_PAID si el carrito ya fue cobrado', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    const { code } = await createPendingCart({
      items: [{ productId: producto.id, quantity: 1 }],
      status: 'PAID',
    });

    const mensaje = await expectError(await preview(code), 409, 'ALREADY_PAID');

    expect(mensaje).toBe('Este carrito ya fue cobrado.');
  });

  it('responde 409 QR_EXPIRED y no modifica nada si el QR ya venció', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    const { id, code } = await createPendingCart({
      items: [{ productId: producto.id, quantity: 1 }],
      expiresAt: new Date(AHORA.getTime() - MINUTO),
    });

    const mensaje = await expectError(await preview(code), 409, 'QR_EXPIRED');

    expect(mensaje).toBe('El QR ya venció. Pide al cliente que genere uno nuevo.');

    const carrito = await getTestPrisma().cart.findUniqueOrThrow({ where: { id } });

    expect(carrito.status).toBe('PENDING');
    expect(carrito.qrCode).toBe(code);
  });

  it('no deja cobrar un producto inactivo y avisa en el ítem', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    await getTestPrisma().product.update({ where: { id: producto.id }, data: { active: false } });

    const data = expectPreview(await preview(code));

    expect(data.canCharge).toBe(false);
    expect(firstItem(data).issue).toBe('INACTIVE');
  });

  it('no deja cobrar un producto cuya categoría se desactivó', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    await getTestPrisma().category.update({ where: { id: tecnologia.id }, data: { active: false } });

    const data = expectPreview(await preview(code));

    expect(data.canCharge).toBe(false);
    expect(firstItem(data).issue).toBe('INACTIVE');
  });

  it('no deja cobrar si el stock bajó por debajo de la cantidad del carrito', async () => {
    const producto = await insertAudifonos(tecnologia.id, 3);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 5 }] });

    const data = expectPreview(await preview(code));

    expect(data.canCharge).toBe(false);
    expect(firstItem(data).issue).toBe('INSUFFICIENT_STOCK');
  });

  it('recalcula los precios si una campaña se desactiva entre dos consultas (RN-17)', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    const campana = await createFixedCampaign(producto.id);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    const antes = expectPreview(await preview(code));

    await getTestPrisma().campaign.update({ where: { id: campana.id }, data: { active: false } });

    const despues = expectPreview(await preview(code));

    expect(firstItem(antes).offerPriceCents).toBe(3990);
    expect(firstItem(antes).cmrPriceCents).toBe(3790);
    expect(antes.summary.normalTotalCents).toBe(3990);

    expect(firstItem(despues).offerPriceCents).toBe(8990);
    expect(firstItem(despues).cmrPriceCents).toBe(8540);
    expect(firstItem(despues).campaignName).toBeNull();
    expect(despues.summary.normalTotalCents).toBe(8990);
    expect(despues.summary.cmrTotalCents).toBe(8540);
  });
});

describe('POST /api/checkout/:code/reject', () => {
  it('devuelve el carrito al cliente, que puede volver a editarlo (RN-06)', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    const { id, code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    const respuesta = await reject(code);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toEqual({ code, customerName: 'María Cliente' });

    const carrito = await getTestPrisma().cart.findUniqueOrThrow({ where: { id }, include: { items: true } });

    expect(carrito.status).toBe('OPEN');
    expect(carrito.qrCode).toBeNull();
    expect(carrito.qrExpiresAt).toBeNull();
    expect(carrito.items).toHaveLength(1);

    const vista = await request(app).get('/api/cart').set(...bearer(cliente.token));

    expect(vista.status).toBe(200);
    expect((vista.body.data as CartResponse).status).toBe('OPEN');
    expect((vista.body.data as CartResponse).qrCode).toBeNull();

    const edicion = await request(app)
      .patch(`/api/cart/items/${producto.id}`)
      .set(...bearer(cliente.token))
      .send({ quantity: 3 });

    expect(edicion.status).toBe(200);
    expect((edicion.body.data as CartResponse).items).toEqual([
      expect.objectContaining({ productId: producto.id, quantity: 3 }),
    ]);
  });

  it('el código rechazado ya no sirve para consultar el carrito', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    await reject(code);

    const mensaje = await expectError(await preview(code), 404, 'NOT_FOUND');

    expect(mensaje).toBe('Código no válido o vencido');
  });

  it('no libera un carrito con el QR vencido', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    const { id, code } = await createPendingCart({
      items: [{ productId: producto.id, quantity: 1 }],
      expiresAt: new Date(AHORA.getTime() - MINUTO),
    });

    await expectError(await reject(code), 409, 'QR_EXPIRED');

    const carrito = await getTestPrisma().cart.findUniqueOrThrow({ where: { id } });

    expect(carrito.status).toBe('PENDING');
    expect(carrito.qrCode).toBe(code);
  });

  it('no libera un carrito ya cobrado', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    const { id, code } = await createPendingCart({
      items: [{ productId: producto.id, quantity: 1 }],
      status: 'PAID',
    });

    await expectError(await reject(code), 409, 'ALREADY_PAID');

    expect((await getTestPrisma().cart.findUniqueOrThrow({ where: { id } })).status).toBe('PAID');
  });

  it('responde los mismos errores de código que la vista previa', async () => {
    await expectError(await reject('C-ZZZZZ'), 404, 'NOT_FOUND');
    await expectError(await reject('codigo-malo'), 400, 'VALIDATION_ERROR');
  });
});

describe('permisos de la caja', () => {
  it('no deja ver ni rechazar el carrito a un cliente', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    await expectError(await preview(code, cliente.token), 403, 'FORBIDDEN');
    await expectError(await reject(code, cliente.token), 403, 'FORBIDDEN');
  });

  it('no deja ver ni rechazar el carrito a un admin', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    await expectError(await preview(code, adminToken), 403, 'FORBIDDEN');
    await expectError(await reject(code, adminToken), 403, 'FORBIDDEN');
  });

  it('pide token en las dos rutas', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    const consulta = await request(app).get(`/api/checkout/${code}`);
    const rechazo = await request(app).post(`/api/checkout/${code}/reject`);

    await expectError(consulta, 401, 'UNAUTHORIZED');
    await expectError(rechazo, 401, 'UNAUTHORIZED');
  });
});

describe('límite de intentos', () => {
  it('responde 429 al cajero que supera el máximo por usuario', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    for (let intento = 1; intento <= CHECKOUT_RATE_LIMIT_MAX; intento++) {
      const respuesta = await preview(code);

      expect(respuesta.status, `intento ${intento}`).toBe(200);
    }

    const mensaje = await expectError(await preview(code), 429, 'TOO_MANY_REQUESTS');

    expect(mensaje).toBe('Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
    await expectError(await reject(code), 429, 'TOO_MANY_REQUESTS');
  });

  it('el límite es por cajero, no por toda la tienda', async () => {
    const producto = await insertAudifonos(tecnologia.id);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });
    const otroCajero = await createUser('CASHIER', 'Luis Cajero');

    for (let intento = 1; intento <= CHECKOUT_RATE_LIMIT_MAX; intento++) {
      await preview(code);
    }

    await expectError(await preview(code), 429, 'TOO_MANY_REQUESTS');
    expect((await preview(code, otroCajero.token)).status).toBe(200);
  });
});
