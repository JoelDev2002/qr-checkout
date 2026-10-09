import type { DisplayAttribute } from './category';

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

/** Lo que ve el cliente al escanear (GET /products/barcode/:barcode). */
export type ScannedProduct = {
  id: number;
  barcode: string;
  name: string;
  brand: string;
  color: string | null;
  originalPriceCents: number;
  offerPriceCents: number;
  cmrPriceCents: number;
  hasCmrDiscount: boolean;
  campaignName: string | null;
  /** Porcentaje de ahorro ya redondeado que calcula el servidor (RN-18). */
  discountPercent: number;
  details: DisplayAttribute[];
  /** Menor entre el máximo por compra y el stock (RN-04). */
  maxQuantity: number;
};

/** Un ajuste del historial: qué cambió, por qué, cuándo y quién lo hizo (RN-13). */
export type StockAdjustment = {
  id: number;
  productId: number;
  delta: number;
  reason: string;
  createdAt: string;
  userId: number;
  userName: string;
};

/** Página del historial de ajustes, tal como la devuelve GET /products/:id/stock-adjustments. */
export type StockAdjustmentPage = {
  items: StockAdjustment[];
  total: number;
  page: number;
  pageSize: number;
};
