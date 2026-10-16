import { isQrExpired } from '../../domain/cart.js';
import { resolveOnlineCharge, type Charge } from '../../domain/checkout.js';
import { docSeriesOf, resolveBuyer, type Buyer } from '../../domain/document.js';
import { hashToken, idempotencyKeyFor } from '../../domain/mpAmount.js';
import { type CartItemPrices } from '../../domain/pricing.js';
import { MercadoPagoError, type MercadoPagoClient } from '../../infrastructure/mercadopago.js';
import { ApiError } from '../../middlewares/errorHandler.js';
import { findActive as findActiveCampaigns } from '../campaigns/repository.js';
import { withCustomerCart, type CartItemRecord } from '../carts/repository.js';
import { CART_LOCKED_MESSAGE, EMPTY_CART_MESSAGE } from '../carts/service.js';
import {
  requirePurchasable,
  toItemView,
  toSaleItems,
  toSaleView,
  type CheckoutItemView,
  type SaleView,
} from '../checkout/service.js';
import {
  OnlineSaleConflict,
  createAttempt,
  createOnlinePaidSale,
  findAttemptByTokenHash,
  findCustomerEmail,
  generateUniqueExitCode,
  setAttemptApproved,
  setAttemptFailed,
  setAttemptUnknown,
} from './repository.js';
import type { OnlinePaymentInput } from './schemas.js';

/** Sin cuotas (RN-10: las cuotas son solo informativas) y siempre pago con tarjeta. */
const ONLINE_PAYMENT_TYPE = 'credit_card';
const ONLINE_PAYMENT_INSTALLMENTS = 1;

const NOT_CONFIGURED_MESSAGE =
  'El pago en línea no está configurado en este servidor. Revisa MP_ACCESS_TOKEN.';
const TOKEN_INVALID_MESSAGE = 'Ese token de pago ya se usó. Vuelve a ingresar la tarjeta.';
const ALREADY_PAID_MESSAGE = 'Este carrito ya fue cobrado.';
const DECLINED_MESSAGE = 'El banco rechazó la tarjeta. Prueba con otra tarjeta.';
const UNCERTAIN_MESSAGE =
  'No pudimos confirmar el pago con el banco. El intento quedó pendiente de revisión.';
const AMOUNT_CHANGED_MESSAGE = 'El total de la compra cambió. Revisa el carrito y vuelve a intentarlo.';
const INTERNAL_ERROR_MESSAGE = 'Ocurrió un error inesperado.';

function requireBuyer(input: OnlinePaymentInput): Buyer {
  const resolution = resolveBuyer({
    docType: input.docType,
    docNumber: input.buyerDocNumber,
    name: input.buyerName,
  });

  if (!resolution.ok) {
    throw new ApiError(400, 'INVALID_DOCUMENT', resolution.message);
  }

  return resolution.buyer;
}

function toItemPrices(views: readonly CheckoutItemView[]): CartItemPrices[] {
  return views.map((view) => ({
    quantity: view.quantity,
    originalCents: view.originalPriceCents,
    normalCents: view.offerPriceCents,
    cmrCents: view.cmrPriceCents,
  }));
}

/** La compra que el cliente quiere pagar: carrito OPEN y sin QR activo (RN-06, RN-20). */
type ValidatedCart = { cartId: number; items: CartItemRecord[] };

async function requirePayableCart(customerId: number, now: Date): Promise<ValidatedCart> {
  return withCustomerCart(customerId, async (session) => {
    let cart = await session.findCurrentCart();

    if (!cart) {
      throw new ApiError(400, 'VALIDATION_ERROR', EMPTY_CART_MESSAGE);
    }

    if (isQrExpired(cart, now)) {
      await session.releaseExpiredQr(cart.id, now);
      cart = { ...cart, status: 'OPEN', qrCode: null, qrExpiresAt: null };
    }

    if (cart.status === 'PAID') {
      throw new ApiError(409, 'ALREADY_PAID', ALREADY_PAID_MESSAGE);
    }

    if (cart.status !== 'OPEN') {
      throw new ApiError(409, 'CART_LOCKED', CART_LOCKED_MESSAGE);
    }

    const items = await session.listItems(cart.id);

    if (items.length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', EMPTY_CART_MESSAGE);
    }

    return { cartId: cart.id, items };
  });
}

type PreparedPayment = {
  cartId: number;
  items: CheckoutItemView[];
  buyer: Buyer;
  charge: Charge;
  payerEmail: string;
};

/** RN-20: el servidor recalcula el total de oferta y comprueba el comprobante antes de cobrar. */
async function preparePayment(
  input: OnlinePaymentInput,
  customerId: number,
  now: Date,
): Promise<PreparedPayment> {
  const cart = await requirePayableCart(customerId, now);
  const campaigns = await findActiveCampaigns(now);
  const items = cart.items.map((item) => toItemView(item, campaigns, now));

  requirePurchasable(items);

  const buyer = requireBuyer(input);
  const charge = resolveOnlineCharge(toItemPrices(items));

  if (charge.totalCents !== input.expectedAmountCents) {
    throw new ApiError(409, 'AMOUNT_CHANGED', AMOUNT_CHANGED_MESSAGE, {
      amountCents: charge.totalCents,
    });
  }

  const payerEmail = await findCustomerEmail(customerId);

  if (payerEmail === null) {
    throw new ApiError(500, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE);
  }

  return { cartId: cart.cartId, items, buyer, charge, payerEmail };
}

function failureCodeOf(error: unknown): string | null {
  return error instanceof MercadoPagoError ? error.failureCode : null;
}

/**
 * ARCHITECTURE.md §7: cobra el total de oferta con Mercado Pago y, si aprueba, crea la venta. El
 * intento (con el hash del token) queda registrado antes de llamar a la pasarela, así un token ya
 * usado nunca se vuelve a cobrar y cualquier fallo posterior queda revisable (RN-20, RN-28).
 */
export async function processOnlinePayment(
  input: OnlinePaymentInput,
  customerId: number,
  client: MercadoPagoClient | null,
  now: Date,
): Promise<SaleView> {
  if (client === null) {
    throw new ApiError(503, 'PAYMENT_NOT_CONFIGURED', NOT_CONFIGURED_MESSAGE);
  }

  const tokenHash = hashToken(input.token);

  if (await findAttemptByTokenHash(tokenHash)) {
    throw new ApiError(409, 'PAYMENT_TOKEN_INVALID', TOKEN_INVALID_MESSAGE);
  }

  const prepared = await preparePayment(input, customerId, now);
  const attempt = await createAttempt({
    tokenHash,
    cartId: prepared.cartId,
    customerId,
    amountCents: prepared.charge.totalCents,
  });

  let orderId: string;

  try {
    const order = await client.createOrder({
      cardToken: input.token,
      paymentMethodId: input.paymentMethodId,
      paymentType: ONLINE_PAYMENT_TYPE,
      installments: ONLINE_PAYMENT_INSTALLMENTS,
      payerEmail: prepared.payerEmail,
      amountCents: prepared.charge.totalCents,
      externalReference: attempt.externalReference,
      idempotencyKey: idempotencyKeyFor(attempt.id, 'CREATE'),
    });

    if (order.status !== 'processed') {
      await setAttemptUnknown(attempt.id, order.statusDetail);
      throw new ApiError(503, 'PAYMENT_UNCERTAIN', UNCERTAIN_MESSAGE);
    }

    orderId = order.id;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof MercadoPagoError && error.kind === 'REJECTED') {
      await setAttemptFailed(attempt.id, error.failureCode);
      throw new ApiError(402, 'PAYMENT_DECLINED', DECLINED_MESSAGE);
    }

    await setAttemptUnknown(attempt.id, failureCodeOf(error));
    throw new ApiError(503, 'PAYMENT_UNCERTAIN', UNCERTAIN_MESSAGE);
  }

  await setAttemptApproved(attempt.id, orderId);

  try {
    const sale = await createOnlinePaidSale({
      attemptId: attempt.id,
      code: await generateUniqueExitCode(),
      series: docSeriesOf(input.docType),
      cartId: prepared.cartId,
      customerId,
      originalTotalCents: prepared.charge.summary.originalTotalCents,
      offerTotalCents: prepared.charge.summary.normalTotalCents,
      cmrTotalCents: prepared.charge.summary.cmrTotalCents,
      totalCents: prepared.charge.totalCents,
      docType: input.docType,
      buyerDocType: prepared.buyer.docType,
      buyerDocNumber: prepared.buyer.docNumber,
      buyerName: prepared.buyer.name,
      buyerEmail: prepared.payerEmail,
      cardBrand: input.paymentMethodId,
      cardLast4: input.cardLast4 ?? null,
      items: toSaleItems(prepared.items, prepared.charge.items),
    });

    return toSaleView(sale);
  } catch (error) {
    // El cobro ya ocurrió pero la venta no se pudo escribir: la conciliación de T3.5d lo reembolsa.
    if (error instanceof OnlineSaleConflict) {
      throw new ApiError(500, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE);
    }

    throw error;
  }
}
