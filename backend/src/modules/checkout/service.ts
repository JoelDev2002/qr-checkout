import { isQrExpired, itemIssue, type ItemIssue } from '../../domain/cart.js';
import { resolveCharge, type ChargedItem, type PriceType } from '../../domain/checkout.js';
import { docSeriesOf, resolveBuyer, type Buyer, type DocType } from '../../domain/document.js';
import { resolvePrices, summarizeCart, type Campaign, type CartSummary } from '../../domain/pricing.js';
import { ApiError } from '../../middlewares/errorHandler.js';
import { findActive as findActiveCampaigns } from '../campaigns/repository.js';
import {
  ChargeConflict,
  createPaidSale,
  findCartByQrCode,
  releaseCart,
  type CheckoutCartRecord,
  type CheckoutItemRecord,
  type CreatePaidSaleItem,
  type SaleRecord,
} from './repository.js';
import type { ConfirmCheckoutInput } from './schemas.js';

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

/** La venta como la ve el comprobante: con los precios copiados de cada ítem (RN-09). */
export type SaleItemView = {
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

export type SaleView = {
  id: number;
  code: string;
  receiptNumber: string;
  createdAt: string;
  paymentMethod: SaleRecord['paymentMethod'];
  priceApplied: PriceType;
  docType: DocType;
  buyerDocType: string | null;
  buyerDocNumber: string | null;
  buyerName: string | null;
  customerName: string;
  cashierName: string | null;
  originalTotalCents: number;
  offerTotalCents: number;
  cmrTotalCents: number;
  totalCents: number;
  items: SaleItemView[];
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

function toSaleView(sale: SaleRecord): SaleView {
  return {
    id: sale.id,
    code: sale.code,
    receiptNumber: sale.receiptNumber,
    createdAt: sale.createdAt.toISOString(),
    paymentMethod: sale.paymentMethod,
    priceApplied: sale.priceApplied,
    docType: sale.docType,
    buyerDocType: sale.buyerDocType,
    buyerDocNumber: sale.buyerDocNumber,
    buyerName: sale.buyerName,
    customerName: sale.customerName,
    cashierName: sale.cashierName,
    originalTotalCents: sale.originalTotalCents,
    offerTotalCents: sale.offerTotalCents,
    cmrTotalCents: sale.cmrTotalCents,
    totalCents: sale.totalCents,
    items: sale.items.map((item) => ({
      barcode: item.barcode,
      name: item.name,
      quantity: item.quantity,
      originalPriceCents: item.originalPriceCents,
      offerPriceCents: item.normalPriceCents,
      cmrPriceCents: item.cmrPriceCents,
      paidPriceCents: item.paidPriceCents,
      subtotalCents: item.subtotalCents,
      campaignName: item.campaignName,
    })),
  };
}

/** RN-11: si el comprobante no cuadra con lo que pide, ni se toca la base de datos. */
function requireBuyer(input: ConfirmCheckoutInput): Buyer {
  const resolution = resolveBuyer({ docType: input.docType, docNumber: input.buyerDocNumber, name: input.buyerName });

  if (!resolution.ok) {
    throw new ApiError(400, 'INVALID_DOCUMENT', resolution.message);
  }

  return resolution.buyer;
}

/**
 * Antes de cobrar, ningún ítem puede estar inactivo ni por encima del stock: se dice cuál es y no se
 * escribe nada, ni siquiera un número de comprobante.
 */
function requirePurchasable(items: readonly CheckoutItemView[]): void {
  for (const item of items) {
    if (item.issue === 'INACTIVE') {
      throw new ApiError(409, 'OUT_OF_STOCK', `${item.name} ya no está a la venta.`);
    }

    if (item.issue === 'INSUFFICIENT_STOCK') {
      throw new ApiError(409, 'OUT_OF_STOCK', `No hay stock suficiente de ${item.name}.`);
    }
  }
}

/** El conflicto lo detecta la transacción y lo traduce el servicio; el resto de errores son internos. */
function toApiError(error: unknown): unknown {
  if (!(error instanceof ChargeConflict)) {
    return error;
  }

  if (error.reason === 'ALREADY_PAID') {
    return new ApiError(409, 'ALREADY_PAID', ALREADY_PAID_MESSAGE);
  }

  return new ApiError(409, 'OUT_OF_STOCK', `No hay stock suficiente de ${error.productName ?? 'ese producto'}.`);
}

/**
 * ARCHITECTURE.md §7: se vuelve a leer el carrito, se recalculan los precios con las campañas vigentes
 * (RN-07, RN-17) y todo se cobra en una sola transacción.
 */
export async function confirmCheckout(
  code: string,
  input: ConfirmCheckoutInput,
  cashierId: number,
  now: Date,
): Promise<SaleView> {
  const cart = await requireChargeableCart(code, now);
  // Las campañas se consultan una sola vez por petición y se reparten entre todos los ítems (§4).
  const campaigns = await findActiveCampaigns(now);
  const items = cart.items.map((item) => toItemView(item, campaigns, now));

  requirePurchasable(items);

  const buyer = requireBuyer(input);
  const charge = resolveCharge(
    input.paymentMethod,
    items.map((item) => ({
      quantity: item.quantity,
      originalCents: item.originalPriceCents,
      normalCents: item.offerPriceCents,
      cmrCents: item.cmrPriceCents,
    })),
  );

  try {
    const sale = await createPaidSale({
      code: cart.qrCode ?? code,
      series: docSeriesOf(input.docType),
      cartId: cart.id,
      customerId: cart.customer.id,
      cashierId,
      paymentMethod: input.paymentMethod,
      priceApplied: charge.priceApplied,
      originalTotalCents: charge.summary.originalTotalCents,
      offerTotalCents: charge.summary.normalTotalCents,
      cmrTotalCents: charge.summary.cmrTotalCents,
      totalCents: charge.totalCents,
      docType: input.docType,
      buyerDocType: buyer.docType,
      buyerDocNumber: buyer.docNumber,
      buyerName: buyer.name,
      items: toSaleItems(items, charge.items),
    });

    return toSaleView(sale);
  } catch (error) {
    throw toApiError(error);
  }
}

/** La copia congelada de cada ítem: su identidad, su campaña y los precios ya resueltos (RN-09). */
function toSaleItems(
  views: readonly CheckoutItemView[],
  charged: readonly ChargedItem[],
): CreatePaidSaleItem[] {
  const saleItems: CreatePaidSaleItem[] = [];
  let position = 0;

  for (const view of views) {
    const item = charged[position];
    position += 1;

    if (!item) {
      throw new Error('El cobro no tiene los precios de todos los ítems del carrito.');
    }

    saleItems.push({
      productId: view.productId,
      barcode: view.barcode,
      name: view.name,
      quantity: item.quantity,
      originalPriceCents: item.originalCents,
      normalPriceCents: item.normalCents,
      cmrPriceCents: item.cmrCents,
      paidPriceCents: item.paidPriceCents,
      subtotalCents: item.subtotalCents,
      campaignName: view.campaignName,
    });
  }

  return saleItems;
}
