import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createApp } from '../../src/app.js';
import { ean13CheckDigit } from '../../src/domain/barcode.js';
import { hashToken, idempotencyKeyFor } from '../../src/domain/mpAmount.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import {
  MercadoPagoError,
  type MercadoPagoClient,
  type MpOrder,
  type RefundOrderInput,
} from '../../src/infrastructure/mercadopago.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

/**
 * Fallos, reembolso y conciliación del cobro en línea (T3.5d, ARCHITECTURE.md §7 pasos 6 y 7).
 * El cliente de Mercado Pago es un falso inyectado: nunca hay red.
 */

const CAMPANA_INICIO = new Date('2020-01-01T00:00:00.000Z');
const CAMPANA_FIN = new Date('2099-12-31T00:00:00.000Z');
const OFERTA_AUDIFONOS = 3990;

const REFUNDED_MESSAGE = 'No pudimos completar la compra. Te devolvimos el dinero.';
const MANUAL_MESSAGE = 'Hubo un problema con tu pago. Avisa en caja con este código: ';
const UNCERTAIN_MESSAGE =
  'No pudimos confirmar tu pago. No lo repitas: avisa en caja con este código: ';

type PayBody = {
  token: string;
  expectedAmountCents: number;
  paymentMethodId?: string;
  docType?: 'TICKET' | 'BOLETA' | 'FACTURA';
  buyerDocNumber?: string;
  buyerName?: string;
  cardLast4?: string;
};

let emailCounter = 0;
let barcodeCounter = 0;
let tokenCounter = 0;

async function createUser(
  role: AuthRole,
  name = `Usuario ${role}`,
): Promise<{ id: number; email: string; token: string }> {
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
}): Promise<{ id: number }> {
  return getTestPrisma().cart.create({
    data: {
      customerId: cliente.id,
      status: 'OPEN',
      items: data.items ? { create: data.items } : undefined,
    },
    select: { id: true },
  });
}

function approvedOrder(id: string): MpOrder {
  return {
    id,
    status: 'processed',
    statusDetail: 'accredited',
    payments: [{ id: `${id}-PAY`, status: 'processed', statusDetail: 'accredited' }],
  };
}

let app: Express;
let createOrder: Mock;
let refundOrder: Mock;
let cliente: { id: number; email: string; token: string };
let tecnologia: { id: number };

function pay(body: PayBody, token = cliente.token): request.Test {
  const payload = { paymentMethodId: 'visa', docType: 'TICKET', cardLast4: '1234', ...body };

  return request(app).post('/api/payments/online').set(...bearer(token)).send(payload);
}

async function expectError(
  response: request.Response,
  status: number,
  code: string,
): Promise<string> {
  expect(response.status).toBe(status);
  expect(response.body.error.code).toBe(code);

  return String(response.body.error.message);
}

async function attemptOf(token: string) {
  return getTestPrisma().paymentAttempt.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
}

/** Una venta que falla DESPUÉS de cobrar: la order se aprueba pero el stock desaparece antes de la venta. */
function exhaustStockOnCharge(productId: number, orderId: string): void {
  createOrder.mockImplementation(async () => {
    await getTestPrisma().product.update({ where: { id: productId }, data: { stock: 0 } });

    return approvedOrder(orderId);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(async () => {
  await cleanDatabase();

  createOrder = vi.fn();
  refundOrder = vi.fn();
  const client = {
    createOrder,
    getOrder: vi.fn(),
    cancelOrder: vi.fn(),
    refundOrder,
  } as unknown as MercadoPagoClient;

  app = createApp({ mercadoPagoClient: client });
  cliente = await createUser('CUSTOMER', 'María Cliente');
  tecnologia = await getTestPrisma().category.create({ data: { name: 'Tecnología' } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('la venta falla después de cobrar y se reembolsa (ARCHITECTURE.md §7, paso 6)', () => {
  it('stock agotado tras cobrar: reembolsa el total, deja el intento en REFUNDED y responde 409', async () => {
    const producto = await insertAudifonos(tecnologia.id, 5);
    await createFixedCampaign(producto.id);
    await createCart({ items: [{ productId: producto.id, quantity: 1 }] });
    exhaustStockOnCharge(producto.id, 'MP-ORDER-STOCK');
    const token = nextToken();

    const response = await pay({ token, expectedAmountCents: OFERTA_AUDIFONOS });

    expect(await expectError(response, 409, 'OUT_OF_STOCK')).toBe(REFUNDED_MESSAGE);
    expect(refundOrder).toHaveBeenCalledTimes(1);

    const refund = refundOrder.mock.calls[0]?.[0] as RefundOrderInput;

    expect(refund.orderId).toBe('MP-ORDER-STOCK');
    expect(refund.amountCents).toBeUndefined();
    expect(refund.idempotencyKey).toBe(idempotencyKeyFor((await attemptOf(token)).id, 'REEMBOLSO'));

    const attempt = await attemptOf(token);

    expect(attempt.status).toBe('REFUNDED');
    expect(attempt.mpOrderId).toBe('MP-ORDER-STOCK');
    expect(await getTestPrisma().sale.count()).toBe(0);
    expect((await getTestPrisma().cart.findFirstOrThrow()).status).toBe('OPEN');
  });

  it('si el reembolso también falla: intento REFUND_FAILED, registra en consola y responde 500', async () => {
    const producto = await insertAudifonos(tecnologia.id, 5);
    await createFixedCampaign(producto.id);
    await createCart({ items: [{ productId: producto.id, quantity: 1 }] });
    exhaustStockOnCharge(producto.id, 'MP-ORDER-REFUND-FAIL');
    refundOrder.mockRejectedValue(new MercadoPagoError('NETWORK', 'No se pudo conectar con Mercado Pago.'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const token = nextToken();

    const response = await pay({ token, expectedAmountCents: OFERTA_AUDIFONOS });
    const attempt = await attemptOf(token);
    const message = await expectError(response, 500, 'INTERNAL_ERROR');

    expect(message).toBe(`${MANUAL_MESSAGE}${attempt.id}`);
    expect(attempt.status).toBe('REFUND_FAILED');
    expect(await getTestPrisma().sale.count()).toBe(0);

    // Solo el intento y la order: nunca datos de tarjeta.
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(`attemptId=${attempt.id}`));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('mpOrderId=MP-ORDER-REFUND-FAIL'));

    errorSpy.mockRestore();
  });

  it('la clave de idempotencia del reembolso es la misma al reintentar', async () => {
    const producto = await insertAudifonos(tecnologia.id, 5);
    await createFixedCampaign(producto.id);
    await createCart({ items: [{ productId: producto.id, quantity: 1 }] });
    exhaustStockOnCharge(producto.id, 'MP-ORDER-IDEMPOTENT');
    refundOrder.mockRejectedValue(new MercadoPagoError('NETWORK', 'No se pudo conectar con Mercado Pago.'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const token = nextToken();

    await pay({ token, expectedAmountCents: OFERTA_AUDIFONOS });
    const attempt = await attemptOf(token);
    const firstKey = (refundOrder.mock.calls[0]?.[0] as RefundOrderInput).idempotencyKey;

    // El reintento del reembolso del mismo intento reusa exactamente la misma clave.
    expect(firstKey).toBe(idempotencyKeyFor(attempt.id, 'REEMBOLSO'));
    expect(idempotencyKeyFor(attempt.id, 'REEMBOLSO')).toBe(firstKey);

    errorSpy.mockRestore();
  });
});

describe('un cobro incierto no se reembolsa ni se reintenta (ARCHITECTURE.md §7, paso 7)', () => {
  it('tiempo agotado o error de red al crear la order: intento UNKNOWN y 503 PAYMENT_UNCERTAIN', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    await createCart({ items: [{ productId: producto.id, quantity: 1 }] });
    createOrder.mockRejectedValue(new MercadoPagoError('NETWORK', 'La petición agotó el tiempo.'));
    const token = nextToken();

    const response = await pay({ token, expectedAmountCents: OFERTA_AUDIFONOS });
    const attempt = await attemptOf(token);

    expect(await expectError(response, 503, 'PAYMENT_UNCERTAIN')).toBe(
      `${UNCERTAIN_MESSAGE}${attempt.id}`,
    );
    expect(attempt.status).toBe('UNKNOWN');
    expect(refundOrder).not.toHaveBeenCalled();
    expect(await getTestPrisma().sale.count()).toBe(0);
    expect((await getTestPrisma().cart.findFirstOrThrow()).status).toBe('OPEN');
  });

  it('estado no documentado al crear la order: intento UNKNOWN y 503 PAYMENT_UNCERTAIN', async () => {
    const producto = await insertAudifonos(tecnologia.id, 20);
    await createFixedCampaign(producto.id);
    await createCart({ items: [{ productId: producto.id, quantity: 1 }] });
    createOrder.mockResolvedValue({
      id: 'MP-ORDER-PROCESSING',
      status: 'processing',
      statusDetail: 'pending_review',
      payments: [],
    } satisfies MpOrder);
    const token = nextToken();

    const response = await pay({ token, expectedAmountCents: OFERTA_AUDIFONOS });
    const attempt = await attemptOf(token);

    expect(await expectError(response, 503, 'PAYMENT_UNCERTAIN')).toBe(
      `${UNCERTAIN_MESSAGE}${attempt.id}`,
    );
    expect(attempt.status).toBe('UNKNOWN');
    expect(attempt.failureCode).toBe('pending_review');
    expect(refundOrder).not.toHaveBeenCalled();
    expect(await getTestPrisma().sale.count()).toBe(0);
  });
});

describe('dos pagos simultáneos del mismo carrito', () => {
  it('solo uno crea la venta y el otro se reembolsa (CART_LOCKED)', async () => {
    const producto = await insertAudifonos(tecnologia.id, 5);
    await createFixedCampaign(producto.id);
    const { id: cartId } = await createCart({ items: [{ productId: producto.id, quantity: 1 }] });

    let calls = 0;
    createOrder.mockImplementation(async () => {
      calls += 1;
      const orderId = `MP-ORDER-${calls}`;

      // Se demora un poco para que las dos peticiones lleguen a cobrar antes de escribir la venta.
      await delay(50);

      return approvedOrder(orderId);
    });
    const tokenA = nextToken();
    const tokenB = nextToken();

    const [first, second] = await Promise.all([
      pay({ token: tokenA, expectedAmountCents: OFERTA_AUDIFONOS }),
      pay({ token: tokenB, expectedAmountCents: OFERTA_AUDIFONOS }),
    ]);

    // Uno crea la venta; el otro choca con el carrito ya tomado y se reembolsa.
    const statuses = [first.status, second.status].sort((a, b) => a - b);

    expect(statuses).toEqual([200, 409]);
    expect(createOrder).toHaveBeenCalledTimes(2);

    const loser = first.status === 409 ? first : second;

    expect(await expectError(loser, 409, 'CART_LOCKED')).toBe(REFUNDED_MESSAGE);
    expect(refundOrder).toHaveBeenCalledTimes(1);
    expect(await getTestPrisma().sale.count()).toBe(1);
    expect((await getTestPrisma().cart.findUniqueOrThrow({ where: { id: cartId } })).status).toBe(
      'PAID',
    );

    const attempts = await getTestPrisma().paymentAttempt.findMany({ where: { cartId } });

    expect(attempts).toHaveLength(2);
    const refunded = attempts.find((attempt) => attempt.status === 'REFUNDED');
    const created = attempts.find((attempt) => attempt.status === 'SALE_CREATED');

    expect(refunded).toBeDefined();
    expect(created).toBeDefined();

    const refund = refundOrder.mock.calls[0]?.[0] as RefundOrderInput;

    expect(refund.orderId).toBe(refunded?.mpOrderId);
    expect(refund.orderId).not.toBe(created?.mpOrderId);
  });
});

describe('los datos de tarjeta nunca se guardan en los intentos de reembolso', () => {
  it('el intento no contiene el token en claro al reembolsar', async () => {
    const producto = await insertAudifonos(tecnologia.id, 5);
    await createFixedCampaign(producto.id);
    await createCart({ items: [{ productId: producto.id, quantity: 1 }] });
    exhaustStockOnCharge(producto.id, 'MP-ORDER-PRIVATE');
    const token = nextToken();

    await pay({ token, expectedAmountCents: OFERTA_AUDIFONOS });
    const attempt = await attemptOf(token);

    expect(JSON.stringify(attempt)).not.toContain(token);
  });
});
