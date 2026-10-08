import { formatMoney } from './money';

/** Con 3 unidades o menos el producto se marca como «Poco stock» (DESIGN §2, color warn). */
export const LOW_STOCK_THRESHOLD = 3;

type ProductPricing = {
  originalPriceCents: number;
  hasCmrDiscount: boolean;
  prices: {
    normalCents: number;
    cmrCents: number;
    campaignName: string | null;
  };
};

export type ProductPriceCells = {
  original: string;
  offer: string;
  campaignName: string | null;
  /** Un guion cuando el producto no tiene descuento CMR. */
  cmr: string;
};

/** RN-01: el admin ve el precio original, el de oferta con la campaña que ganó y el CMR. */
export function formatProductPrices(product: ProductPricing): ProductPriceCells {
  return {
    original: formatMoney(product.originalPriceCents),
    offer: formatMoney(product.prices.normalCents),
    campaignName: product.prices.campaignName,
    cmr: product.hasCmrDiscount ? formatMoney(product.prices.cmrCents) : '—',
  };
}

export function isLowStock(stock: number): boolean {
  return stock <= LOW_STOCK_THRESHOLD;
}

/** El código se lee en grupos separados por espacio (DESIGN §2). Solo el EAN-13 se agrupa. */
export function formatBarcode(barcode: string): string {
  if (!/^\d{13}$/.test(barcode)) {
    return barcode;
  }

  return `${barcode.slice(0, 1)} ${barcode.slice(1, 7)} ${barcode.slice(7)}`;
}
