import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createApp } from '../../src/app.js';
import { ean13CheckDigit } from '../../src/domain/barcode.js';
import { hashToken } from '../../src/domain/mpAmount.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import {
  MercadoPagoError,
  type CreateOrderInput,
  type MercadoPagoClient,
  type MpOrder,
} from '../../src/infrastructure/mercadopago.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { LOGIN_RATE_LIMIT_MAX } from '../../src/modules/auth/routes.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

/**
 * Cobro en línea (Architecture.md §7). El cliente de Mercado Pago se inyecta: nunca hay red. La
 * campaña usa un rango amplio, así que no hace falta fijar la fecha del sistema.
 */

const CAMPANA_INICIO = new Date('2020-01-01T00:00:00.000Z');
const CAMPANA_FIN = new Date('2099-12-31T00:00:00.000Z');
const DNI = '12345678';

// Audífonos de ARCHITECTURE.md §10: con la oferta de 5000 céntimos quedan en 3990 y 3790.
const OFERTA_AUDIFONOS = 3990;
const CMR_AUDIFONOS = 3790;

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
  paymentMethod: 'CMR_CARD' | 'OTHER_CARD' | 'CASH' | 'ONLINE';
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

type PayBody = {
  token: string;
  expectedAmountCents: number;
  paymentMethodId?: string;
  docType?: SaleResponse['docType'];
  buyerDocNumber?: string;
  buyerName?: string;
  cardLast4?: string;
};

let emailCounter = 0;
let barcodeCounter = 0;
let tokenCounter = 0;

async function createUser(role: AuthRole, name = `Usuario ${role}`): Promise<{ id: number; email: string; token: string }> {
  emailCounter += 1;
  const email = `${role.toLowerCase()}-${emailCounter}@falabella.com`;
  const user = await getTestPrisma().user.create({
    data: { email, name, role, passwordHash: 'hash-fijo-de-prueba' },
  });

  return { id: user.id, email, token: signAuthToken({ sub: String(user.id), role, email }) };
}

function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

/** Un token de un solo uso distinto por prueba, como el que entrega el Brick. */
function nextToken(): string {
  tokenCounter += 1;
  return `mp-token-${tokenCounter}-${'0'.repeat(12)}`;
}

function nextBarcode(): string {
  barcodeCounter += 1;
  const body = `300000${String(barcodeCounter).padStart(6, '0')}`;

  return `${body}${ean13CheckDigit(body)}`;
}

type ProductRow = { id: number; barcode: string; name: string };

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

async function createFixedCampaign(productId: number): Promise<{ id: number }> {
  return getTestPrisma().campaign.create({
    data: {
      name: 'Oferta de audífonos',
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

async function createCart(data: {
  items?: Array<{ productId: number; quantity: number }>;
  status?: 'OPEN' | 'PENDING' | 'PAID';
  qrCode?: string | null;
  qrExpiresAt?: Date | null;
}): Promise<{ id: number }> {
  const cart = await getTestPrisma().cart.create({
    data: {
      customerId: cliente.id,
      status: data.status ?? 'OPEN',
      qrCode: data.qrCode ?? null,
      qrExpiresAt: data.qrExpiresAt ?? null,
      items: data.items ? { create: data.items } : undefined,
    },
    select: { id: true },
  });

  return { id: cart.id };
}

function approvedOrder(id = 'MP-ORDER-1'): MpOrder {
  return {
    id,
    status: 'processed',
    statusDetail: 'accredited',
    payments: [{ id: `${id}-PAY`, status: 'processed', statusDetail: 'accredited' }],
  };
}

function processingOrder(id = 'MP-ORDER-2'): MpOrder {
  return { id, status: 'processing', statusDetail: 'pending_review', payments: [] };
}

let app: Express;
let createOrder: Mock;
let cliente: { id: number; email: string; token: string };
let tecnologia: { id: number };

function pay(body: PayBody, token = cliente.token): request.Test {
  const payload = { paymentMethodId: 'visa', docType: 'TICKET', cardLast4: '1234', ...body };

  return request(app).post('/api/payments/online').set(...bearer(token)).send(payload);
}

function expectSale(response: request.Response): SaleResponse {
  expect(response.status).toBe(200);

  return response.body.data as SaleResponse;
}

async function expectError(response: request.Response, status: number, code: string): Promise<string> {
  expect(response.status).toBe(status);
  expect(response.body.error.code).toBe(code);

  return String(response.body.error.message);
}

function firstItem(sale: SaleResponse): SaleItemResponse {
  const item = sale.items[0];

  if (!item) {
    throw new Error('La venta no tiene ítems.');
  }

  return item;
}

beforeEach(async () => {
  await cleanDatabase();

  createOrder = vi.fn();
  const client = {
    createOrder,
    getOrder: vi.fn(),
    cancelOrder: vi.fn(),
    refundOrder: vi.fn(),
  } as unknown as MercadoPagoClient;

  app = createApp({ mercadoPagoClient: client });

  cliente = await createUser('CUSTOMER', 'María Cliente');
  tecnologia = await getTestPrisma().category.create({ data: { name: 'Tecnología' } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/payments/online cobra el total de oferta en línea (RN-20)', () => {
  it('cobra de punta a punta, crea la venta ONLINE y deja el intento en SALE_CREATED', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    const { id: cartId } = await createCart({ items: [{ productId: producto.id, quantity: 2 }] });
    createOrder.mockResolvedValue(approvedOrder());
    const token = nextToken();

    const sale = expectSale(await pay({ token, expectedAmountCents: 2 * OFERTA_AUDIFONOS }));

    // RN-23: código de salida O-XXXXX y serie de ticket con su correlativo.
    expect(sale.code).toMatch(/^O-[A-Z2-9]{5}$/);
    expect(sale.receiptNumber).toBe('T001-000001');
    expect(sale.paymentMethod).toBe('ONLINE');
    expect(sale.priceApplied).toBe('NORMAL');
    expect(sale.cashierName).toBeNull();
    expect(sale.customerName).toBe('María Cliente');

    // Siempre el total de oferta, nunca el CMR (RN-20).
    expect(sale.originalTotalCents).toBe(17980);
    expect(sale.offerTotalCents).toBe(7980);
    expect(sale.cmrTotalCents).toBe(7580);
    expect(sale.totalCents).toBe(7980);
    expect(firstItem(sale)).toEqual({
      barcode: producto.barcode,
      name: producto.name,
      quantity: 2,
      originalPriceCents: 8990,
      offerPriceCents: OFERTA_AUDIFONOS,
      cmrPriceCents: CMR_AUDIFONOS,
      paidPriceCents: OFERTA_AUDIFONOS,
      subtotalCents: 2 * OFERTA_AUDIFONOS,
      campaignName: 'Oferta de audífonos',
    });

    // La order sale con el monto que decidió el servidor, sin cuotas y con el correo de la cuenta.
    expect(createOrder).toHaveBeenCalledTimes(1);
    const enviado = createOrder.mock.calls[0]?.[0] as CreateOrderInput;

    expect(enviado).toEqual({
      cardToken: token,
      paymentMethodId: 'visa',
      paymentType: 'credit_card',
      installments: 1,
      payerEmail: cliente.email,
      amountCents: 7980,
      externalReference: expect.stringMatching(/^QRC\d{10}$/),
      idempotencyKey: expect.stringMatching(/^QRC\d{10}-CREATE$/),
    });

    const guardada = await getTestPrisma().sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { items: true },
    });

    expect(guardada.cartId).toBe(cartId);
    expect(guardada.customerId).toBe(cliente.id);
    expect(guardada.cardBrand).toBe('visa');
    expect(guardada.cardLast4).toBe('1234');
    expect(guardada.buyerEmail).toBe(cliente.email);
    expect(guardada.items).toHaveLength(1);

    // RN-08: el stock baja al aprobarse el pago y el carrito queda PAID.
    expect((await getTestPrisma().product.findUniqueOrThrow({ where: { id: producto.id } })).stock).toBe(18);
    expect((await getTestPrisma().cart.findUniqueOrThrow({ where: { id: cartId } })).status).toBe('PAID');

    const attempt = await getTestPrisma().paymentAttempt.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });

    expect(attempt.status).toBe('SALE_CREATED');
    expect(attempt.cartId).toBe(cartId);
    expect(attempt.customerId).toBe(cliente.id);
    expect(attempt.amountCents).toBe(7980);
    expect(attempt.mpOrderId).toBe('MP-ORDER-1');
    expect(attempt.externalReference).toBe(enviado.externalReference);
    expect(attempt.failureCode).toBeNull();
  });

  it('con boleta y factura guarda el comprobante, el comprador y su propia serie', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    createOrder.mockResolvedValueOnce(approvedOrder('MP-1')).mockResolvedValueOnce(approvedOrder('MP-2'));

    const boleta = await createCart({ items: [{ productId: producto.id, quantity: 1 }] });
    const ventaBoleta = expectSale(
      await pay({
        token: nextToken(),
        expectedAmountCents: OFERTA_AUDIFONOS,
        docType: 'BOLETA',
        buyerDocNumber: DNI,
      }),
    );

    expect(ventaBoleta.docType).toBe('BOLETA');
    expect(ventaBoleta.buyerDocType).toBe('DNI');
    expect(ventaBoleta.buyerDocNumber).toBe(DNI);
    expect(ventaBoleta.receiptNumber).toBe('B001-000001');

    await createCart({ items: [{ productId: producto.id, quantity: 1 }] });
    const ventaFactura = expectSale(
      await pay({
        token: nextToken(),
        expectedAmountCents: OFERTA_AUDIFONOS,
        docType: 'FACTURA',
        buyerDocNumber: '20123456789',
        buyerName: 'Comercial Falabella Puruchuco',
      }),
    );

    expect(ventaFactura.docType).toBe('FACTURA');
    expect(ventaFactura.buyerDocType).toBe('RUC');
    expect(ventaFactura.buyerName).toBe('Comercial Falabella Puruchuco');
    expect(ventaFactura.receiptNumber).toBe('F001-000001');
    expect(boleta.id).toBeGreaterThan(0);
  });

  it('nunca escribe el token de la tarjeta en claro (RN-20)', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    await createCart({ items: [{ productId: producto.id, quantity: 1 }] });
    createOrder.mockResolvedValue(approvedOrder());
    const token = nextToken();

    const sale = expectSale(await pay({ token, expectedAmountCents: OFERTA_AUDIFONOS }));

    const attempt = await getTestPrisma().paymentAttempt.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });
    const venta = await getTestPrisma().sale.findUniqueOrThrow({ where: { id: sale.id } });

    expect(attempt.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(attempt)).not.toContain(token);
    expect(JSON.stringify(venta)).not.toContain(token);
  });
});

describe('un token ya usado no se vuelve a cobrar (RN-28)', () => {
  it('responde PAYMENT_TOKEN_INVALID y no crea otra venta', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    await createCart({ items: [{ productId: producto.id, quantity: 1 }] });
    createOrder.mockResolvedValue(approvedOrder());
    const token = nextToken();

    expectSale(await pay({ token, expectedAmountCents: OFERTA_AUDIFONOS }));

    expect(
      await expectError(await pay({ token, expectedAmountCents: OFERTA_AUDIFONOS }), 409, 'PAYMENT_TOKEN_INVALID'),
    ).toBe('Ese token de pago ya se usó. Vuelve a ingresar la tarjeta.');

    // El cobro solo salió una vez y no hay ventas ni intentos de más.
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(await getTestPrisma().sale.count()).toBe(1);
    expect(await getTestPrisma().paymentAttempt.count()).toBe(1);
    expect((await getTestPrisma().product.findUniqueOrThrow({ where: { id: producto.id } })).stock).toBe(19);
  });

  it('rechaza un token reusado incluso si el carrito ya no se puede pagar', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    const { id: cartId } = await createCart({ items: [{ productId: producto.id, quantity: 1 }] });
    createOrder.mockResolvedValue(approvedOrder());
    const token = nextToken();

    expectSale(await pay({ token, expectedAmountCents: OFERTA_AUDIFONOS }));
    await getTestPrisma().cart.update({ where: { id: cartId }, data: { status: 'PAID' } });

    await expectError(await pay({ token, expectedAmountCents: OFERTA_AUDIFONOS }), 409, 'PAYMENT_TOKEN_INVALID');
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('también rechaza el token reusado tras un rechazo del banco', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    const { id: cartId } = await createCart({ items: [{ productId: producto.id, quantity: 1 }] });
    createOrder.mockRejectedValue(
      new MercadoPagoError('REJECTED', 'Mercado Pago rechazó el pago.', 'cc_rejected_insufficient_amount', 402),
    );
    const token = nextToken();

    expect(
      await expectError(await pay({ token, expectedAmountCents: OFERTA_AUDIFONOS }), 402, 'PAYMENT_DECLINED'),
    ).toBe('El banco rechazó la tarjeta. Prueba con otra tarjeta.');

    // El token ya quedó registrado como FAILED: el segundo envío no vuelve a cobrar aunque el carrito
    // siga OPEN y pueda pagarse (el chequeo del token va antes de validar el carrito).
    expect(
      await expectError(await pay({ token, expectedAmountCents: OFERTA_AUDIFONOS }), 409, 'PAYMENT_TOKEN_INVALID'),
    ).toBe('Ese token de pago ya se usó. Vuelve a ingresar la tarjeta.');

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect((await getTestPrisma().cart.findUniqueOrThrow({ where: { id: cartId } })).status).toBe('OPEN');

    const attempts = await getTestPrisma().paymentAttempt.findMany({ where: { tokenHash: hashToken(token) } });

    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.status).toBe('FAILED');
  });
});

describe('rechazo y resultado incierto de Mercado Pago (Architecture.md §7)', () => {
  it('un rechazo responde PAYMENT_DECLINED sin tocar el carrito ni el stock', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    const { id: cartId } = await createCart({ items: [{ productId: producto.id, quantity: 2 }] });
    createOrder.mockRejectedValue(
      new MercadoPagoError('REJECTED', 'Mercado Pago rechazó el pago.', 'cc_rejected_insufficient_amount', 402),
    );
    const token = nextToken();

    expect(
      await expectError(await pay({ token, expectedAmountCents: 2 * OFERTA_AUDIFONOS }), 402, 'PAYMENT_DECLINED'),
    ).toBe('El banco rechazó la tarjeta. Prueba con otra tarjeta.');

    expect(await getTestPrisma().sale.count()).toBe(0);
    expect((await getTestPrisma().cart.findUniqueOrThrow({ where: { id: cartId } })).status).toBe('OPEN');
    expect((await getTestPrisma().product.findUniqueOrThrow({ where: { id: producto.id } })).stock).toBe(20);

    const attempt = await getTestPrisma().paymentAttempt.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });

    expect(attempt.status).toBe('FAILED');
    expect(attempt.failureCode).toBe('cc_rejected_insufficient_amount');
  });

  it('una order que no está aprobada queda UNKNOWN y responde PAYMENT_UNCERTAIN', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    const { id: cartId } = await createCart({ items: [{ productId: producto.id, quantity: 1 }] });
    createOrder.mockResolvedValue(processingOrder());
    const token = nextToken();

    await expectError(await pay({ token, expectedAmountCents: OFERTA_AUDIFONOS }), 503, 'PAYMENT_UNCERTAIN');

    expect(await getTestPrisma().sale.count()).toBe(0);
    expect((await getTestPrisma().cart.findUniqueOrThrow({ where: { id: cartId } })).status).toBe('OPEN');

    const attempt = await getTestPrisma().paymentAttempt.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });

    expect(attempt.status).toBe('UNKNOWN');
    expect(attempt.failureCode).toBe('pending_review');
  });

  it('un error de red también queda UNKNOWN', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    await createCart({ items: [{ productId: producto.id, quantity: 1 }] });
    createOrder.mockRejectedValue(new MercadoPagoError('NETWORK', 'No se pudo conectar con Mercado Pago.'));
    const token = nextToken();

    await expectError(await pay({ token, expectedAmountCents: OFERTA_AUDIFONOS }), 503, 'PAYMENT_UNCERTAIN');

    const attempt = await getTestPrisma().paymentAttempt.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });

    expect(attempt.status).toBe('UNKNOWN');
    expect(await getTestPrisma().sale.count()).toBe(0);
  });

  it('sin MP_ACCESS_TOKEN responde PAYMENT_NOT_CONFIGURED', async () => {
    const appSinMp = createApp({ mpAccessToken: '' });
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    await createCart({ items: [{ productId: producto.id, quantity: 1 }] });

    const response = await request(appSinMp)
      .post('/api/payments/online')
      .set(...bearer(cliente.token))
      .send({ token: nextToken(), paymentMethodId: 'visa', docType: 'TICKET', expectedAmountCents: OFERTA_AUDIFONOS });

    expect(await expectError(response, 503, 'PAYMENT_NOT_CONFIGURED')).toBe(
      'El pago en línea no está configurado en este servidor. Revisa MP_ACCESS_TOKEN.',
    );
    expect(await getTestPrisma().paymentAttempt.count()).toBe(0);
  });
});

describe('el monto lo decide el servidor (RN-07, RN-20)', () => {
  it('si el monto esperado no coincide responde AMOUNT_CHANGED con el monto nuevo y no cobra', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    const { id: cartId } = await createCart({ items: [{ productId: producto.id, quantity: 2 }] });

    const response = await pay({ token: nextToken(), expectedAmountCents: 1 });

    expect(await expectError(response, 409, 'AMOUNT_CHANGED')).toBe(
      'El total de la compra cambió. Revisa el carrito y vuelve a intentarlo.',
    );
    expect(response.body.error.amountCents).toBe(7980);

    expect(createOrder).not.toHaveBeenCalled();
    expect(await getTestPrisma().paymentAttempt.count()).toBe(0);
    expect(await getTestPrisma().sale.count()).toBe(0);
    expect((await getTestPrisma().cart.findUniqueOrThrow({ where: { id: cartId } })).status).toBe('OPEN');
    expect((await getTestPrisma().product.findUniqueOrThrow({ where: { id: producto.id } })).stock).toBe(20);
  });

  it('rechaza un cuerpo con campos que no existen, incluidos los precios (RN-07)', async () => {
    const mensaje = await expectError(
      await pay({ token: nextToken(), expectedAmountCents: OFERTA_AUDIFONOS, payerEmail: 'otro@correo.com' } as PayBody),
      400,
      'VALIDATION_ERROR',
    );

    expect(mensaje).toBe('Estos campos no se permiten aquí: payerEmail.');

    expect(
      await expectError(
        await request(app)
          .post('/api/payments/online')
          .set(...bearer(cliente.token))
          .send({ token: nextToken(), paymentMethodId: 'visa', docType: 'TICKET', expectedAmountCents: 1, totalCents: 1 }),
        400,
        'VALIDATION_ERROR',
      ),
    ).toBe('Estos campos no se permiten aquí: totalCents.');
  });

  it('valida el token, el medio de pago, el comprobante y los últimos 4 dígitos', async () => {
    expect(
      await expectError(
        await pay({ token: '', expectedAmountCents: OFERTA_AUDIFONOS }),
        400,
        'VALIDATION_ERROR',
      ),
    ).toBe('El token de la tarjeta no puede estar vacío.');

    expect(
      await expectError(
        await pay({ token: nextToken(), expectedAmountCents: 0 }),
        400,
        'VALIDATION_ERROR',
      ),
    ).toBe('El monto esperado debe ser mayor que cero.');

    expect(
      await expectError(
        await pay({ token: nextToken(), expectedAmountCents: OFERTA_AUDIFONOS, cardLast4: '12' }),
        400,
        'VALIDATION_ERROR',
      ),
    ).toBe('Los últimos 4 dígitos de la tarjeta deben ser exactamente 4 dígitos.');

    expect(
      await expectError(
        await pay({ token: nextToken(), expectedAmountCents: OFERTA_AUDIFONOS, docType: 'NOTA' as SaleResponse['docType'] }),
        400,
        'VALIDATION_ERROR',
      ),
    ).toBe('El comprobante debe ser TICKET, BOLETA o FACTURA.');
  });
});

describe('el carrito debe poder pagarse en línea (Architecture.md §7)', () => {
  it('sin carrito o con el carrito vacío responde que está vacío', async () => {
    expect(
      await expectError(await pay({ token: nextToken(), expectedAmountCents: OFERTA_AUDIFONOS }), 400, 'VALIDATION_ERROR'),
    ).toBe('El carrito está vacío.');

    await createCart({});

    expect(
      await expectError(await pay({ token: nextToken(), expectedAmountCents: OFERTA_AUDIFONOS }), 400, 'VALIDATION_ERROR'),
    ).toBe('El carrito está vacío.');

    expect(createOrder).not.toHaveBeenCalled();
  });

  it('con un QR activo responde CART_LOCKED', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createCart({
      items: [{ productId: producto.id, quantity: 1 }],
      status: 'PENDING',
      qrCode: 'C-8F3K2',
      qrExpiresAt: new Date(Date.now() + 60_000),
    });

    expect(
      await expectError(await pay({ token: nextToken(), expectedAmountCents: OFERTA_AUDIFONOS }), 409, 'CART_LOCKED'),
    ).toBe('Tu carrito tiene un QR activo. Cancela el QR para editarlo.');
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('con un QR vencido libera el carrito y permite pagar (RN-06)', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    const { id: cartId } = await createCart({
      items: [{ productId: producto.id, quantity: 1 }],
      status: 'PENDING',
      qrCode: 'C-HJKMN',
      qrExpiresAt: new Date(Date.now() - 60_000),
    });
    createOrder.mockResolvedValue(approvedOrder());

    expectSale(await pay({ token: nextToken(), expectedAmountCents: OFERTA_AUDIFONOS }));

    expect((await getTestPrisma().cart.findUniqueOrThrow({ where: { id: cartId } })).status).toBe('PAID');
  });

  it('tras un cobro, un token nuevo no vuelve a cobrar el mismo carrito', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    await createCart({ items: [{ productId: producto.id, quantity: 1 }] });
    createOrder.mockResolvedValue(approvedOrder());

    expectSale(await pay({ token: nextToken(), expectedAmountCents: OFERTA_AUDIFONOS }));

    // El carrito quedó PAID, así que ya no es "el carrito actual" (ACTIVE_STATUSES no incluye PAID):
    // un intento nuevo no encuentra nada que cobrar y no crea otro intento.
    expect(
      await expectError(await pay({ token: nextToken(), expectedAmountCents: OFERTA_AUDIFONOS }), 400, 'VALIDATION_ERROR'),
    ).toBe('El carrito está vacío.');

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(await getTestPrisma().sale.count()).toBe(1);
    expect(await getTestPrisma().paymentAttempt.count()).toBe(1);
  });

  it('no cobra si un ítem no tiene stock suficiente', async () => {
    const producto = await insertAudifonos(tecnologia.id, 2);
    await createFixedCampaign(producto.id);
    await createCart({ items: [{ productId: producto.id, quantity: 3 }] });

    const mensaje = await expectError(
      await pay({ token: nextToken(), expectedAmountCents: 3 * OFERTA_AUDIFONOS }),
      409,
      'OUT_OF_STOCK',
    );

    expect(mensaje).toContain(producto.name);
    expect(createOrder).not.toHaveBeenCalled();
    expect(await getTestPrisma().paymentAttempt.count()).toBe(0);
  });

  it('exige el documento del comprobante (RN-11)', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    await createCart({ items: [{ productId: producto.id, quantity: 1 }] });

    expect(
      await expectError(
        await pay({ token: nextToken(), expectedAmountCents: OFERTA_AUDIFONOS, docType: 'BOLETA' }),
        400,
        'INVALID_DOCUMENT',
      ),
    ).toBe('Falta el DNI del comprador.');
    expect(createOrder).not.toHaveBeenCalled();
  });
});

describe('permisos y límite de intentos', () => {
  it('solo el cliente puede pagar en línea', async () => {
    const cajero = await createUser('CASHIER');

    await expectError(
      await pay({ token: nextToken(), expectedAmountCents: OFERTA_AUDIFONOS }, cajero.token),
      403,
      'FORBIDDEN',
    );
  });

  it('responde 429 al cliente que supera el máximo de intentos del login', async () => {
    for (let intento = 1; intento <= LOGIN_RATE_LIMIT_MAX; intento += 1) {
      const response = await pay({ token: nextToken(), expectedAmountCents: OFERTA_AUDIFONOS });

      expect(response.status).toBe(400);
    }

    const ultima = await pay({ token: nextToken(), expectedAmountCents: OFERTA_AUDIFONOS });

    expect(ultima.status).toBe(429);
    expect(ultima.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});
