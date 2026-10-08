/** Campos del producto que usa el admin de campañas (lista, chips y buscador). */
export type ProductListItem = {
  id: number;
  name: string;
  brand: string;
};

/** Precios que calcula el servidor al listar (RN-01); el navegador nunca los deriva. */
export type ProductPrices = {
  originalCents: number;
  /** Precio de oferta. */
  normalCents: number;
  cmrCents: number;
  campaignId: number | null;
  campaignName: string | null;
  discountPercent: number;
  cmrPercent: number;
};

/** Fila del listado del admin, tal como la devuelve GET /products. */
export type AdminProduct = {
  id: number;
  barcode: string;
  name: string;
  brand: string;
  color: string | null;
  categoryId: number;
  categoryName: string;
  originalPriceCents: number;
  hasCmrDiscount: boolean;
  cmrDiscountBps: number;
  attributes: Record<string, unknown>;
  stock: number;
  maxPerPurchase: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  prices: ProductPrices;
};
