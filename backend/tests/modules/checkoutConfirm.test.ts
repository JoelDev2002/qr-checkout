import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { ean13CheckDigit } from '../../src/domain/barcode.js';
import { CART_CODE_ALPHABET } from '../../src/domain/cartCode.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { ChargeConflict, createPaidSale } from '../../src/modules/checkout/repository.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

/** Momento fijo dentro de la vigencia de las campañas de estas pruebas. */
const AHORA = new Date('2026-06-15T15:00:00.000Z');
const CAMPANA_INICIO = new Date('2026-06-01T00:00:00.000Z');
const CAMPANA_FIN = new Date('2026-06-30T00:00:00.000Z');
const MINUTO = 60 * 1000;
const VIGENTE = new Date(AHORA.getTime() + 20 * MINUTO);
const DNI = '12345678';
const RUC = '20123456789';
const RAZON_SOCIAL = 'Comercial Falabella Puruchuco';

type SaleItemResponse = {
  barcode: string;
  name: string;
  quantity: number;
  originalPriceCents: number;
  offerPriceCents: number;
  cmrPriceCents: number;
  paidPriceCents: number;
  subtotalCents: number;
  campaignName: string | null;
};

type SaleResponse = {
  id: number;
  code: string;
  receiptNumber: string;
  createdAt: string;
  paymentMethod: 'CMR_CARD' | 'OTHER_CARD' | 'CASH';
  priceApplied: 'NORMAL' | 'CMR';
  docType: 'TICKET' | 'BOLETA' | 'FACTURA';
  buyerDocType: 'DNI' | 'RUC' | null;
  buyerDocNumber: string | null;
  buyerName: string | null;
  customerName: string;
  cashierName: string | null;
  originalTotalCents: number;
  offerTotalCents: number;
  cmrTotalCents: number;
  totalCents: number;
  items: SaleItemResponse[];
};

type Body = {
  paymentMethod: SaleResponse['paymentMethod'];
  docType: SaleResponse['docType'];
  buyerDocNumber?: string;
  buyerName?: string;
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

type ProductRow = { id: number; barcode: string; name: string };

/** Audífonos de la tabla de ARCHITECTURE.md §10: con la oferta de 5000 céntimos quedan en 3990 / 3790. */
async function insertAudifonos(categoryId: number, stock = 20): Promise<ProductRow> {
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
    select: { id: true, barcode: true, name: true },
  });
}

/** Cama de la tabla de §10, sin descuento CMR: el total CMR es el mismo que el de oferta. */
async function insertCama(categoryId: number, stock = 20): Promise<ProductRow> {
  return getTestPrisma().product.create({
    data: {
      barcode: nextBarcode(),
      name: 'Dormitorio Tempo Issey Queen',
      brand: 'Tempo',
      categoryId,
      originalPriceCents: 424900,
      stock,
      maxPerPurchase: 20,
    },
    select: { id: true, barcode: true, name: true },
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
  status?: 'OPEN' | 'PENDING' | 'PAID';
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

function confirm(code: string, body: Body, token = cajero.token): request.Test {
  return request(app).post(`/api/checkout/${code}/confirm`).set(...bearer(token)).send(body);
}

function expectSale(response: request.Response): SaleResponse {
  expect(response.status).toBe(200);

  return response.body.data as SaleResponse;
}

function firstItem(sale: SaleResponse): SaleItemResponse {
  const item = sale.items[0];

  if (!item) {
    throw new Error('La venta no tiene ítems.');
  }

  return item;
}

async function expectError(response: request.Response, status: number, code: string): Promise<string> {
  expect(response.status).toBe(status);
  expect(response.body.error.code).toBe(code);

  return String(response.body.error.message);
}

/** Lo que no puede haber cambiado si el cobro falló: carrito, stock, ventas y numeración. */
async function expectSinCambios(
  cartId: number,
  stocks: Array<[ProductRow, number]>,
  status: 'PENDING' | 'PAID' | 'OPEN' = 'PENDING',
): Promise<void> {
  expect((await getTestPrisma().cart.findUniqueOrThrow({ where: { id: cartId } })).status).toBe(status);
  expect(await getTestPrisma().sale.count()).toBe(0);
  expect(await getTestPrisma().documentSeries.count()).toBe(0);

  for (const [producto, stock] of stocks) {
    expect((await getTestPrisma().product.findUniqueOrThrow({ where: { id: producto.id } })).stock, producto.name).toBe(
      stock,
    );
  }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);

  await cleanDatabase();
  app = createApp();

  cliente = await createUser('CUSTOMER', 'María Cliente');
  cajero = await createUser('CASHIER', 'Carla Cajera');
  adminToken = (await createUser('ADMIN')).token;

  tecnologia = await getTestPrisma().category.create({ data: { name: 'Dormitorios' } });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/checkout/:code/confirm con tarjeta CMR', () => {
  it('cobra el total CMR, guarda la copia de precios y baja el stock exacto (RN-03, RN-08, RN-09)', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    const { id, code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 3 }] });

    const sale = expectSale(await confirm(code, { paymentMethod: 'CMR_CARD', docType: 'TICKET' }));

    expect(sale.code).toBe(code);
    expect(sale.receiptNumber).toBe('T001-000001');
    // La fecha la pone la base de datos al crear la venta.
    expect(sale.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(sale.paymentMethod).toBe('CMR_CARD');
    expect(sale.priceApplied).toBe('CMR');
    expect(sale.customerName).toBe('María Cliente');
    expect(sale.cashierName).toBe('Carla Cajera');
    expect(sale.docType).toBe('TICKET');
    expect(sale.buyerDocType).toBeNull();
    expect(sale.buyerDocNumber).toBeNull();

    expect(sale.originalTotalCents).toBe(26970);
    expect(sale.offerTotalCents).toBe(11970);
    expect(sale.cmrTotalCents).toBe(11370);
    expect(sale.totalCents).toBe(11370);

    const item = firstItem(sale);
    expect(item).toEqual({
      barcode: producto.barcode,
      name: producto.name,
      quantity: 3,
      originalPriceCents: 8990,
      offerPriceCents: 3990,
      cmrPriceCents: 3790,
      paidPriceCents: 3790,
      subtotalCents: 11370,
      campaignName: 'Oferta de audífonos',
    });

    // La venta guarda los precios con los que se cobró, no los que tendría después (RN-09).
    const guardada = await getTestPrisma().sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { items: true },
    });

    expect(guardada.cartId).toBe(id);
    expect(guardada.customerId).toBe(cliente.id);
    expect(guardada.cashierId).toBe(cajero.id);
    expect(guardada.priceApplied).toBe('CMR');
    expect(guardada.totalCents).toBe(11370);
    expect(guardada.items).toHaveLength(1);
    expect(guardada.items[0]).toEqual(
      expect.objectContaining({
        barcode: producto.barcode,
        name: producto.name,
        quantity: 3,
        originalPriceCents: 8990,
        normalPriceCents: 3990,
        cmrPriceCents: 3790,
        paidPriceCents: 3790,
        subtotalCents: 11370,
        campaignName: 'Oferta de audífonos',
      }),
    );

    // RN-08: el stock baja solo al confirmar, y baja lo comprado.
    expect((await getTestPrisma().product.findUniqueOrThrow({ where: { id: producto.id } })).stock).toBe(17);
    expect((await getTestPrisma().cart.findUniqueOrThrow({ where: { id } })).status).toBe('PAID');
    expect((await getTestPrisma().documentSeries.findUniqueOrThrow({ where: { series: 'T001' } })).lastNumber).toBe(1);
  });

  it('cobra cada ítem a su precio CMR aunque uno no tenga descuento CMR', async () => {
    const audifonos = await insertAudifonos(tecnologia.id);
    const cama = await insertCama(tecnologia.id);
    await createFixedCampaign(audifonos.id);
    const { code } = await createPendingCart({
      items: [
        { productId: audifonos.id, quantity: 1 },
        { productId: cama.id, quantity: 2 },
      ],
    });

    const sale = expectSale(await confirm(code, { paymentMethod: 'CMR_CARD', docType: 'TICKET' }));

    expect(sale.totalCents).toBe(sale.cmrTotalCents);
    expect(sale.cmrTotalCents).toBe(3790 + 849800);
    expect(sale.items).toEqual([
      expect.objectContaining({ barcode: audifonos.barcode, paidPriceCents: 3790, subtotalCents: 3790 }),
      expect.objectContaining({ barcode: cama.barcode, paidPriceCents: 424900, subtotalCents: 849800 }),
    ]);
  });
});

describe('POST /api/checkout/:code/confirm con otra tarjeta y en efectivo', () => {
  it.each([
    ['OTHER_CARD' as const, 'Otra tarjeta'],
    ['CASH' as const, 'Efectivo'],
  ])('con %s cobra el total de oferta', async (paymentMethod, name) => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id, name);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 2 }] });

    const sale = expectSale(await confirm(code, { paymentMethod, docType: 'TICKET' }));

    expect(sale.paymentMethod).toBe(paymentMethod);
    expect(sale.priceApplied).toBe('NORMAL');
    expect(sale.totalCents).toBe(sale.offerTotalCents);
    expect(sale.offerTotalCents).toBe(7980);
    expect(sale.totalCents).toBe(7980);
    expect(firstItem(sale).paidPriceCents).toBe(3990);
    expect(firstItem(sale).subtotalCents).toBe(7980);
    expect((await getTestPrisma().product.findUniqueOrThrow({ where: { id: producto.id } })).stock).toBe(18);
  });

  it('sin campañas cobra el precio original y guarda la venta con esos precios', async () => {
    const producto = await insertAudifonos(tecnologia.id, 5);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 5 }] });

    const sale = expectSale(await confirm(code, { paymentMethod: 'CASH', docType: 'TICKET' }));

    expect(sale.offerTotalCents).toBe(44950);
    expect(sale.totalCents).toBe(44950);
    expect(firstItem(sale)).toEqual(
      expect.objectContaining({
        offerPriceCents: 8990,
        cmrPriceCents: 8540,
        paidPriceCents: 8990,
        subtotalCents: 44950,
        campaignName: null,
      }),
    );
  });
});

describe('números de comprobante (RN-23)', () => {
  it('cada serie lleva su propio conteo y los tickets son correlativos', async () => {
    const producto = await insertAudifonos(tecnologia.id, 50);

    const numeros: string[] = [];

    for (const docType of ['TICKET', 'TICKET', 'BOLETA', 'TICKET', 'FACTURA', 'BOLETA'] as const) {
      const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });
      const cuerpo: Body = { paymentMethod: 'CASH', docType };

      if (docType === 'BOLETA') {
        cuerpo.buyerDocNumber = DNI;
      }

      if (docType === 'FACTURA') {
        cuerpo.buyerDocNumber = RUC;
        cuerpo.buyerName = RAZON_SOCIAL;
      }

      numeros.push(expectSale(await confirm(code, cuerpo)).receiptNumber);
    }

    expect(numeros).toEqual([
      'T001-000001',
      'T001-000002',
      'B001-000001',
      'T001-000003',
      'F001-000001',
      'B001-000002',
    ]);

    const series = await getTestPrisma().documentSeries.findMany({ orderBy: { series: 'asc' } });

    expect(series).toEqual([
      { series: 'B001', lastNumber: 2 },
      { series: 'F001', lastNumber: 1 },
      { series: 'T001', lastNumber: 3 },
    ]);
  });

  it('guarda el documento del comprador con su tipo', async () => {
    const producto = await insertAudifonos(tecnologia.id);

    const boleta = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });
    const ventaBoleta = expectSale(
      await confirm(boleta.code, {
        paymentMethod: 'CASH',
        docType: 'BOLETA',
        buyerDocNumber: DNI,
        buyerName: 'María Cliente',
      }),
    );

    expect(ventaBoleta.docType).toBe('BOLETA');
    expect(ventaBoleta.buyerDocType).toBe('DNI');
    expect(ventaBoleta.buyerDocNumber).toBe(DNI);
    expect(ventaBoleta.buyerName).toBe('María Cliente');

    const factura = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });
    const ventaFactura = expectSale(
      await confirm(factura.code, {
        paymentMethod: 'CMR_CARD',
        docType: 'FACTURA',
        buyerDocNumber: RUC,
        buyerName: RAZON_SOCIAL,
      }),
    );

    expect(ventaFactura.buyerDocType).toBe('RUC');
    expect(ventaFactura.buyerDocNumber).toBe(RUC);
    expect(ventaFactura.buyerName).toBe(RAZON_SOCIAL);
    expect(ventaFactura.receiptNumber).toBe('F001-000001');

    const guardada = await getTestPrisma().sale.findUniqueOrThrow({ where: { id: ventaFactura.id } });

    expect(guardada.buyerDocType).toBe('RUC');
    expect(guardada.buyerDocNumber).toBe(RUC);
    expect(guardada.buyerName).toBe(RAZON_SOCIAL);
  });
});

describe('comprobantes inválidos (RN-11)', () => {
  it('exige el DNI de la boleta y no toca nada', async () => {
    const producto = await insertAudifonos(tecnologia.id, 9);
    const { id, code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    expect(await expectError(await confirm(code, { paymentMethod: 'CASH', docType: 'BOLETA' }), 400, 'INVALID_DOCUMENT')).toBe(
      'Falta el DNI del comprador.',
    );

    for (const buyerDocNumber of ['1234567', '123456789', 'abcdefgh', '1234567a']) {
      const mensaje = await expectError(
        await confirm(code, { paymentMethod: 'CASH', docType: 'BOLETA', buyerDocNumber }),
        400,
        'INVALID_DOCUMENT',
      );

      expect(mensaje).toBe('El DNI debe tener 8 dígitos.');
    }

    await expectSinCambios(id, [[producto, 9]]);
  });

  it('exige el RUC de la factura y no toca nada', async () => {
    const producto = await insertAudifonos(tecnologia.id, 9);
    const { id, code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    expect(await expectError(await confirm(code, { paymentMethod: 'CASH', docType: 'FACTURA', buyerName: RAZON_SOCIAL }), 400, 'INVALID_DOCUMENT')).toBe(
      'Falta el RUC del comprador.',
    );
    expect(
      await expectError(
        await confirm(code, { paymentMethod: 'CASH', docType: 'FACTURA', buyerDocNumber: '2012345678', buyerName: RAZON_SOCIAL }),
        400,
        'INVALID_DOCUMENT',
      ),
    ).toBe('El RUC debe tener 11 dígitos.');

    await expectSinCambios(id, [[producto, 9]]);
  });

  it('exige la razón social de la factura', async () => {
    const producto = await insertAudifonos(tecnologia.id, 9);
    const { id, code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    const mensaje = await expectError(
      await confirm(code, { paymentMethod: 'CASH', docType: 'FACTURA', buyerDocNumber: RUC }),
      400,
      'INVALID_DOCUMENT',
    );

    expect(mensaje).toBe('Falta la razón social para la factura.');
    await expectSinCambios(id, [[producto, 9]]);
  });

  it('no acepta un documento en el ticket', async () => {
    const producto = await insertAudifonos(tecnologia.id, 9);
    const { id, code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    const mensaje = await expectError(
      await confirm(code, { paymentMethod: 'CASH', docType: 'TICKET', buyerDocNumber: DNI }),
      400,
      'INVALID_DOCUMENT',
    );

    expect(mensaje).toBe('El ticket no lleva número de documento.');
    await expectSinCambios(id, [[producto, 9]]);
  });
});

describe('el cuerpo se valida entero', () => {
  it('rechaza campos desconocidos, incluidos los montos que manda el navegador (RN-07)', async () => {
    const producto = await insertAudifonos(tecnologia.id, 9);
    const { id, code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    const mensaje = await expectError(
      await confirm(code, { paymentMethod: 'CASH', docType: 'TICKET', totalCents: 1 } as Body),
      400,
      'VALIDATION_ERROR',
    );

    expect(mensaje).toBe('Estos campos no se permiten aquí: totalCents.');

    const otro = await expectError(
      await confirm(code, { paymentMethod: 'CASH', docType: 'TICKET', discountPercent: 90 } as unknown as Body),
      400,
      'VALIDATION_ERROR',
    );

    expect(otro).toBe('Estos campos no se permiten aquí: discountPercent.');
    await expectSinCambios(id, [[producto, 9]]);
  });

  it('rechaza un medio de pago o un comprobante que no existen', async () => {
    const producto = await insertAudifonos(tecnologia.id, 9);
    const { id, code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    expect(
      await expectError(
        await confirm(code, { paymentMethod: 'ONLINE', docType: 'TICKET' } as unknown as Body),
        400,
        'VALIDATION_ERROR',
      ),
    ).toBe('El medio de pago debe ser CMR_CARD, OTHER_CARD o CASH.');

    expect(
      await expectError(
        await confirm(code, { paymentMethod: 'CASH', docType: 'NOTA' } as unknown as Body),
        400,
        'VALIDATION_ERROR',
      ),
    ).toBe('El comprobante debe ser TICKET, BOLETA o FACTURA.');

    await expectSinCambios(id, [[producto, 9]]);
  });
});

describe('un carrito se cobra una sola vez (RN-08)', () => {
  it('dos confirmaciones simultáneas: una cobra y la otra recibe ALREADY_PAID', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 2 }] });

    const [primero, segundo] = await Promise.all([
      confirm(code, { paymentMethod: 'CMR_CARD', docType: 'TICKET' }),
      confirm(code, { paymentMethod: 'CASH', docType: 'TICKET' }),
    ]);

    const exitos = [primero, segundo].filter((respuesta) => respuesta.status === 200);
    const rechazados = [primero, segundo].filter((respuesta) => respuesta.status !== 200);

    expect(exitos).toHaveLength(1);
    expect(rechazados).toHaveLength(1);
    expect(rechazados[0]?.body.error.code).toBe('ALREADY_PAID');
    expect(rechazados[0]?.body.error.message).toBe('Este carrito ya fue cobrado.');

    // El stock baja una sola vez y solo hay una venta, con un solo número de comprobante.
    expect((await getTestPrisma().product.findUniqueOrThrow({ where: { id: producto.id } })).stock).toBe(18);
    const ventas = await getTestPrisma().sale.findMany({ include: { items: true } });

    expect(ventas).toHaveLength(1);
    expect(ventas[0]?.items).toHaveLength(1);
    expect((await getTestPrisma().documentSeries.findUniqueOrThrow({ where: { series: 'T001' } })).lastNumber).toBe(1);
  });

  it('una venta anterior del mismo producto no impide cobrar otro carrito', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    const primero = await createPendingCart({ items: [{ productId: producto.id, quantity: 2 }] });

    await confirm(primero.code, { paymentMethod: 'CASH', docType: 'TICKET' });

    const segundo = await createPendingCart({ items: [{ productId: producto.id, quantity: 3 }] });
    const sale = expectSale(await confirm(segundo.code, { paymentMethod: 'CASH', docType: 'TICKET' }));

    expect(sale.receiptNumber).toBe('T001-000002');
    expect((await getTestPrisma().product.findUniqueOrThrow({ where: { id: producto.id } })).stock).toBe(15);
  });

  it('no vuelve a cobrar un carrito ya pagado', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    await confirm(code, { paymentMethod: 'CASH', docType: 'TICKET' });

    expect(await expectError(await confirm(code, { paymentMethod: 'CASH', docType: 'TICKET' }), 409, 'ALREADY_PAID')).toBe(
      'Este carrito ya fue cobrado.',
    );

    expect((await getTestPrisma().product.findUniqueOrThrow({ where: { id: producto.id } })).stock).toBe(19);
    expect(await getTestPrisma().sale.count()).toBe(1);
    expect((await getTestPrisma().documentSeries.findUniqueOrThrow({ where: { series: 'T001' } })).lastNumber).toBe(1);
  });
});

describe('stock insuficiente revierte todo', () => {
  it('no cobra si un ítem no tiene stock y no crea ninguna venta', async () => {
    const primero = await insertAudifonos(tecnologia.id, 10);
    const segundo = await insertCama(tecnologia.id, 1);
    const { id, code } = await createPendingCart({
      items: [
        { productId: primero.id, quantity: 2 },
        { productId: segundo.id, quantity: 3 },
      ],
    });

    const mensaje = await expectError(
      await confirm(code, { paymentMethod: 'CMR_CARD', docType: 'TICKET' }),
      409,
      'OUT_OF_STOCK',
    );

    expect(mensaje).toContain(segundo.name);
    await expectSinCambios(id, [
      [primero, 10],
      [segundo, 1],
    ]);
  });

  it('la transacción revierte el stock ya descontado cuando un ítem posterior falla', async () => {
    const primero = await insertAudifonos(tecnologia.id, 10);
    const segundo = await insertCama(tecnologia.id, 1);
    const { id, code } = await createPendingCart({
      items: [
        { productId: primero.id, quantity: 2 },
        { productId: segundo.id, quantity: 3 },
      ],
    });

    // El servicio no ve el problema porque el stock cambió después de su comprobación.
    const fallo = createPaidSale({
      code,
      series: 'T001',
      cartId: id,
      customerId: cliente.id,
      cashierId: cajero.id,
      paymentMethod: 'CMR_CARD',
      priceApplied: 'CMR',
      originalTotalCents: 1000,
      offerTotalCents: 800,
      cmrTotalCents: 758,
      totalCents: 758,
      docType: 'TICKET',
      buyerDocType: null,
      buyerDocNumber: null,
      buyerName: null,
      items: [
        {
          productId: primero.id,
          barcode: primero.barcode,
          name: primero.name,
          quantity: 2,
          originalPriceCents: 8990,
          normalPriceCents: 3990,
          cmrPriceCents: 3790,
          paidPriceCents: 3790,
          subtotalCents: 7580,
          campaignName: null,
        },
        {
          productId: segundo.id,
          barcode: segundo.barcode,
          name: segundo.name,
          quantity: 3,
          originalPriceCents: 424900,
          normalPriceCents: 424900,
          cmrPriceCents: 424900,
          paidPriceCents: 424900,
          subtotalCents: 1274700,
          campaignName: null,
        },
      ],
    });

    const error: unknown = await fallo.then(
      () => null,
      (fallado: unknown) => fallado,
    );

    expect(error).toBeInstanceOf(ChargeConflict);
    expect((error as ChargeConflict).reason).toBe('OUT_OF_STOCK');
    expect((error as ChargeConflict).productName).toBe(segundo.name);

    await expectSinCambios(id, [
      [primero, 10],
      [segundo, 1],
    ]);
  });
});

describe('carritos que no se pueden cobrar', () => {
  it('no cobra un producto inactivo', async () => {
    const producto = await insertAudifonos(tecnologia.id, 10);
    const { id, code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    await getTestPrisma().product.update({ where: { id: producto.id }, data: { active: false } });

    const mensaje = await expectError(
      await confirm(code, { paymentMethod: 'CASH', docType: 'TICKET' }),
      409,
      'OUT_OF_STOCK',
    );

    expect(mensaje).toBe(`${producto.name} ya no está a la venta.`);
    await expectSinCambios(id, [[producto, 10]]);
  });

  it('no cobra un producto cuya categoría se desactivó', async () => {
    const producto = await insertAudifonos(tecnologia.id, 10);
    const { id, code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    await getTestPrisma().category.update({ where: { id: tecnologia.id }, data: { active: false } });

    await expectError(await confirm(code, { paymentMethod: 'CASH', docType: 'TICKET' }), 409, 'OUT_OF_STOCK');
    await expectSinCambios(id, [[producto, 10]]);
  });

  it('no cobra con el QR vencido y lo deja como estaba', async () => {
    const producto = await insertAudifonos(tecnologia.id, 10);
    const { id, code } = await createPendingCart({
      items: [{ productId: producto.id, quantity: 1 }],
      expiresAt: new Date(AHORA.getTime() - MINUTO),
    });

    expect(await expectError(await confirm(code, { paymentMethod: 'CASH', docType: 'TICKET' }), 409, 'QR_EXPIRED')).toBe(
      'El QR ya venció. Pide al cliente que genere uno nuevo.',
    );

    await expectSinCambios(id, [[producto, 10]]);
    expect((await getTestPrisma().cart.findUniqueOrThrow({ where: { id } })).qrCode).toBe(code);
  });

  it('no cobra un código que no existe', async () => {
    expect(await expectError(await confirm('C-ZZZZZ', { paymentMethod: 'CASH', docType: 'TICKET' }), 404, 'NOT_FOUND')).toBe(
      'Código no válido o vencido',
    );

    expect(await getTestPrisma().sale.count()).toBe(0);
  });

  it('no cobra un carrito que ya no está esperando el cobro', async () => {
    const producto = await insertAudifonos(tecnologia.id, 10);
    const { id, code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }], status: 'OPEN' });

    expect(await expectError(await confirm(code, { paymentMethod: 'CASH', docType: 'TICKET' }), 409, 'CART_NOT_PENDING')).toBe(
      'Este carrito ya no está esperando el cobro.',
    );

    await expectSinCambios(id, [[producto, 10]], 'OPEN');
  });

  it('no cobra un código con formato inválido', async () => {
    const mensaje = await expectError(
      await confirm('codigo-malo', { paymentMethod: 'CASH', docType: 'TICKET' }),
      400,
      'VALIDATION_ERROR',
    );

    expect(mensaje).toBe('El código del QR no tiene el formato válido.');
    expect(await getTestPrisma().sale.count()).toBe(0);
  });
});

describe('cambios de precio durante el cobro (RN-17)', () => {
  it('cobra con los precios vigentes en ese momento, no con los de la vista previa', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    const campana = await createFixedCampaign(producto.id);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 2 }] });

    const vistaPrevia = await request(app).get(`/api/checkout/${code}`).set(...bearer(cajero.token));

    expect(vistaPrevia.status).toBe(200);
    expect((vistaPrevia.body.data as { summary: { normalTotalCents: number } }).summary.normalTotalCents).toBe(7980);

    await getTestPrisma().campaign.update({ where: { id: campana.id }, data: { active: false } });

    const sale = expectSale(await confirm(code, { paymentMethod: 'CASH', docType: 'TICKET' }));

    expect(sale.offerTotalCents).toBe(17980);
    expect(sale.totalCents).toBe(17980);
    expect(firstItem(sale)).toEqual(
      expect.objectContaining({
        offerPriceCents: 8990,
        paidPriceCents: 8990,
        subtotalCents: 17980,
        campaignName: null,
      }),
    );
  });

  it('cobra con la campaña que empezó después de la vista previa', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    const { code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    await request(app).get(`/api/checkout/${code}`).set(...bearer(cajero.token));
    await createFixedCampaign(producto.id);

    const sale = expectSale(await confirm(code, { paymentMethod: 'CASH', docType: 'TICKET' }));

    expect(sale.totalCents).toBe(3990);
    expect(firstItem(sale).campaignName).toBe('Oferta de audífonos');
  });
});

describe('permisos de la caja', () => {
  it('no deja cobrar a un cliente ni a un admin', async () => {
    const producto = await insertAudifonos(tecnologia.id, 10);
    const { id, code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    await expectError(
      await confirm(code, { paymentMethod: 'CASH', docType: 'TICKET' }, cliente.token),
      403,
      'FORBIDDEN',
    );
    await expectError(
      await confirm(code, { paymentMethod: 'CASH', docType: 'TICKET' }, adminToken),
      403,
      'FORBIDDEN',
    );

    await expectSinCambios(id, [[producto, 10]]);
  });

  it('pide token para confirmar el cobro', async () => {
    const producto = await insertAudifonos(tecnologia.id, 10);
    const { id, code } = await createPendingCart({ items: [{ productId: producto.id, quantity: 1 }] });

    const respuesta = await request(app)
      .post(`/api/checkout/${code}/confirm`)
      .send({ paymentMethod: 'CASH', docType: 'TICKET' });

    expect(await expectError(respuesta, 401, 'UNAUTHORIZED')).toBe('Se requiere autenticación.');
    await expectSinCambios(id, [[producto, 10]]);
  });
});