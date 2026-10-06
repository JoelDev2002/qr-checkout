import { isQrExpired, itemIssue, type ItemIssue } from '../../domain/cart.js';
import { resolvePrices, summarizeCart, type Campaign, type CartSummary } from '../../domain/pricing.js';
import { ApiError } from '../../middlewares/errorHandler.js';
import { findActive as findActiveCampaigns } from '../campaigns/repository.js';
import { findCartByQrCode, releaseCart, type CheckoutCartRecord, type CheckoutItemRecord } from './repository.js';

/** El ítem que ve el cajero: sin stock exacto ni porcentaje CMR (RN-01, RN-04). */
export type CheckoutItemView = {
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
  issue: ItemIssue | null;
};

/** Lo que ve el cajero antes de cobrar: los dos totales de RN-03 y si el carrito se puede cobrar. */
export type CheckoutPreviewView = {
  code: string;
  qrExpiresAt: string;
  customerName: string;
  items: CheckoutItemView[];
  summary: CartSummary;
  canCharge: boolean;
};

export type CheckoutRejectView = {
  code: string;
  customerName: string;
};

/** Un carrito pendiente y vigente: lo único que el cajero puede cobrar o rechazar. */
type ChargeableCart = CheckoutCartRecord & { qrExpiresAt: Date };

const INVALID_CODE_MESSAGE = 'Código no válido o vencido';
const ALREADY_PAID_MESSAGE = 'Este carrito ya fue cobrado.';
const NOT_PENDING_MESSAGE = 'Este carrito ya no está esperando el cobro.';
const QR_EXPIRED_MESSAGE = 'El QR ya venció. Pide al cliente que genere uno nuevo.';

/**
 * Un código que no existe y uno que ya vencieron se responden igual, para no revelar si el código fue
 * real (ARCHITECTURE.md §8). Un QR vencido no libera el carrito aquí: la expiración se resuelve al
 * leer desde el carrito del cliente (RN-06).
 */
async function requireChargeableCart(code: string, now: Date): Promise<ChargeableCart> {
  const cart = await findCartByQrCode(code);

  if (!cart) {
    throw new ApiError(404, 'NOT_FOUND', INVALID_CODE_MESSAGE);
  }

  if (cart.status === 'PAID') {
    throw new ApiError(409, 'ALREADY_PAID', ALREADY_PAID_MESSAGE);
  }

  if (cart.status !== 'PENDING') {
    throw new ApiError(409, 'CART_NOT_PENDING', NOT_PENDING_MESSAGE);
  }

  if (!cart.qrExpiresAt || isQrExpired(cart, now)) {
    throw new ApiError(409, 'QR_EXPIRED', QR_EXPIRED_MESSAGE);
  }

  return { ...cart, qrExpiresAt: cart.qrExpiresAt };
}

function toItemView(item: CheckoutItemRecord, campaigns: readonly Campaign[], now: Date): CheckoutItemView {
  const product = item.product;
  const prices = resolvePrices(product, campaigns, now);

  return {
    productId: product.id,
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    quantity: item.quantity,
    originalPriceCents: prices.originalCents,
    offerPriceCents: prices.normalCents,
    cmrPriceCents: prices.cmrCents,
    hasCmrDiscount: product.hasCmrDiscount,
    campaignName: prices.campaignName,
    issue: itemIssue(product, item.quantity),
  };
}

/** RN-03: el cajero ve los dos totales y elige el medio de pago; RN-07: los precios son los de ahora. */
export async function getCheckoutPreview(code: string, now: Date): Promise<CheckoutPreviewView> {
  const cart = await requireChargeableCart(code, now);
  // Las campañas se consultan una sola vez por petición y se reparten entre todos los ítems (§4).
  const campaigns = await findActiveCampaigns(now);
  const items = cart.items.map((item) => toItemView(item, campaigns, now));

  return {
    code: cart.qrCode ?? code,
    qrExpiresAt: cart.qrExpiresAt.toISOString(),
    customerName: cart.customer.name,
    items,
    summary: summarizeCart(
      items.map((item) => ({
        quantity: item.quantity,
        originalCents: item.originalPriceCents,
        normalCents: item.offerPriceCents,
        cmrCents: item.cmrPriceCents,
      })),
    ),
    canCharge: items.every((item) => item.issue === null),
  };
}

/** RN-06: al rechazar, el carrito vuelve a estar abierto y el cliente puede seguir editándolo. */
export async function rejectCheckout(code: string, now: Date): Promise<CheckoutRejectView> {
  const cart = await requireChargeableCart(code, now);
  const affected = await releaseCart(cart.id);

  // Mientras tanto otro cajero pudo cobrarlo o rechazarlo; en ambos casos ya no espera el cobro.
  if (affected === 0) {
    throw new ApiError(409, 'CART_NOT_PENDING', NOT_PENDING_MESSAGE);
  }

  return { code: cart.qrCode ?? code, customerName: cart.customer.name };
}
