const BPS_SCALE = 10000;

export type DiscountType = 'PERCENT' | 'FIXED';
export type CampaignScope = 'PRODUCTS' | 'CATEGORIES' | 'STORE';

/** Campaña tal como la devuelve el repositorio: su regla, nunca sus resultados. */
export type Campaign = {
  id: number;
  name: string;
  scope: CampaignScope;
  discountType: DiscountType;
  /** PERCENT: puntos básicos · FIXED: céntimos por unidad */
  discountValue: number;
  priority: number;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  productIds: readonly number[];
  categoryIds: readonly number[];
};

export type PricedProduct = {
  id: number;
  categoryId: number;
  originalPriceCents: number;
  hasCmrDiscount: boolean;
  cmrDiscountBps: number;
};

export type ResolvedPrices = {
  originalCents: number;
  /** Precio de oferta. */
  normalCents: number;
  cmrCents: number;
  campaignId: number | null;
  campaignName: string | null;
  /** Porcentaje de ahorro de la oferta contra el original, redondeado a entero. */
  discountPercent: number;
  /** Porcentaje de ahorro del precio CMR contra el original, redondeado a entero. */
  cmrPercent: number;
};

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

/** División de enteros redondeada al entero, con mitad hacia arriba. */
function divideHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

function applyBps(cents: number, discountBps: number): number {
  return divideHalfUp(cents * (BPS_SCALE - discountBps), BPS_SCALE);
}

function savingPercent(originalCents: number, priceCents: number): number {
  if (originalCents <= 0) {
    return 0;
  }

  return divideHalfUp((originalCents - priceCents) * 100, originalCents);
}

function reachesProduct(campaign: Campaign, product: PricedProduct): boolean {
  switch (campaign.scope) {
    case 'STORE':
      return true;
    case 'CATEGORIES':
      return campaign.categoryIds.includes(product.categoryId);
    case 'PRODUCTS':
      return campaign.productIds.includes(product.id);
  }
}

/** Precio de oferta de una campaña, o null si la campaña no aplica a este producto. */
function offerCents(product: PricedProduct, campaign: Campaign, now: Date): number | null {
  const nowMs = now.getTime();

  if (!campaign.active || campaign.startsAt.getTime() > nowMs || campaign.endsAt.getTime() < nowMs) {
    return null;
  }

  if (!reachesProduct(campaign, product)) {
    return null;
  }

  if (campaign.discountType === 'PERCENT') {
    return applyBps(product.originalPriceCents, campaign.discountValue);
  }

  // Un monto fijo que iguala o supera el precio original no se aplica (RN-16).
  if (campaign.discountValue >= product.originalPriceCents) {
    return null;
  }

  return product.originalPriceCents - campaign.discountValue;
}

function winsOver(
  candidate: Campaign,
  candidateNormalCents: number,
  product: PricedProduct,
  best: { campaign: Campaign; normalCents: number },
): boolean {
  if (candidate.priority !== best.campaign.priority) {
    return candidate.priority > best.campaign.priority;
  }

  const candidateSaving = product.originalPriceCents - candidateNormalCents;
  const bestSaving = product.originalPriceCents - best.normalCents;

  if (candidateSaving !== bestSaving) {
    return candidateSaving > bestSaving;
  }

  return candidate.id > best.campaign.id;
}

export function resolvePrices(
  product: PricedProduct,
  campaigns: readonly Campaign[],
  now: Date,
): ResolvedPrices {
  let best: { campaign: Campaign; normalCents: number } | null = null;

  for (const campaign of campaigns) {
    const normalCents = offerCents(product, campaign, now);

    if (normalCents === null) {
      continue;
    }

    if (best === null || winsOver(campaign, normalCents, product, best)) {
      best = { campaign, normalCents };
    }
  }

  const normalCents = best?.normalCents ?? product.originalPriceCents;
  const cmrCents = product.hasCmrDiscount ? applyBps(normalCents, product.cmrDiscountBps) : normalCents;

  return {
    originalCents: product.originalPriceCents,
    normalCents,
    cmrCents,
    campaignId: best?.campaign.id ?? null,
    campaignName: best?.campaign.name ?? null,
    discountPercent: savingPercent(product.originalPriceCents, normalCents),
    cmrPercent: savingPercent(product.originalPriceCents, cmrCents),
  };
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