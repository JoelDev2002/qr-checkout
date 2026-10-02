export type CartItemPrices = {
  quantity: number;
  originalCents: number;
  normalCents: number;
  cmrCents: number;
};

export type CartSummary = {
  originalTotalCents: number;
  discountTotalCents: number;
  normalTotalCents: number;
  cmrTotalCents: number;
  cmrSavingCents: number;
};

function totalOf(items: readonly CartItemPrices[], key: 'originalCents' | 'normalCents' | 'cmrCents'): number {
  return items.reduce((total, item) => total + item[key] * item.quantity, 0);
}

export function summarizeCart(items: readonly CartItemPrices[]): CartSummary {
  const originalTotalCents = totalOf(items, 'originalCents');
  const normalTotalCents = totalOf(items, 'normalCents');
  const cmrTotalCents = totalOf(items, 'cmrCents');

  return {
    originalTotalCents,
    discountTotalCents: originalTotalCents - normalTotalCents,
    normalTotalCents,
    cmrTotalCents,
    cmrSavingCents: normalTotalCents - cmrTotalCents,
  };
}