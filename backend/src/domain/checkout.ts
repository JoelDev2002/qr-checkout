import { summarizeCart, type CartItemPrices, type CartSummary } from './pricing.js';

/** Los medios de pago que elige el cajero; el pago en línea es otro camino (RN-03). */
export type CashPaymentMethod = 'CMR_CARD' | 'OTHER_CARD' | 'CASH';

export type PriceType = 'NORMAL' | 'CMR';

/** La copia de un ítem que se guarda en la venta: los tres precios y el realmente cobrado (RN-09). */
export type ChargedItem = CartItemPrices & {
  paidPriceCents: number;
  subtotalCents: number;
};

export type Charge = {
  priceApplied: PriceType;
  summary: CartSummary;
  /** Lo que se cobra de verdad, siempre en céntimos enteros. */
  totalCents: number;
  items: ChargedItem[];
};

/** RN-03: en caja el cajero elige el medio, y con tarjeta CMR se cobra el total CMR. */
export function priceAppliedFor(paymentMethod: CashPaymentMethod): PriceType {
  return paymentMethod === 'CMR_CARD' ? 'CMR' : 'NORMAL';
}

/**
 * RN-07: el monto lo decide el servidor con los precios recalculados, nunca el navegador. Los ítems
 * llegan con los tres precios ya resueltos y con la cantidad que se cobra.
 */
export function resolveCharge(
  paymentMethod: CashPaymentMethod,
  items: readonly CartItemPrices[],
): Charge {
  const priceApplied = priceAppliedFor(paymentMethod);
  const summary = summarizeCart(items);
  const chargedItems = items.map((item): ChargedItem => {
    const paidPriceCents = priceApplied === 'CMR' ? item.cmrCents : item.normalCents;

    return { ...item, paidPriceCents, subtotalCents: paidPriceCents * item.quantity };
  });

  return {
    priceApplied,
    summary,
    totalCents: priceApplied === 'CMR' ? summary.cmrTotalCents : summary.normalTotalCents,
    items: chargedItems,
  };
}

/**
 * RN-20: el pago en línea cobra SIEMPRE el total de oferta, nunca el precio CMR (el servidor no puede
 * comprobar que la tarjeta sea CMR). El monto lo decide el servidor con los precios ya resueltos.
 */
export function resolveOnlineCharge(items: readonly CartItemPrices[]): Charge {
  return resolveCharge('OTHER_CARD', items);
}