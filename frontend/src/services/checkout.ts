import { get, post } from './api';

/** Medios que el cajero puede elegir en caja (RN-03). */
export type CheckoutPaymentMethod = 'CMR_CARD' | 'OTHER_CARD' | 'CASH';

export type CheckoutDocType = 'TICKET' | 'BOLETA' | 'FACTURA';

export type CheckoutItemIssue = 'INACTIVE' | 'INSUFFICIENT_STOCK' | null;

/** Ítem que ve el cajero: sin stock exacto (backend checkout/service.ts). */
export type CheckoutItem = {
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
  issue: CheckoutItemIssue;
};

export type CheckoutSummary = {
  originalTotalCents: number;
  discountTotalCents: number;
  normalTotalCents: number;
  cmrTotalCents: number;
  cmrSavingCents: number;
};

/** Lo que devuelve GET /checkout/:code: los dos totales de RN-03 y si el carrito se puede cobrar. */
export type CheckoutPreview = {
  code: string;
  qrExpiresAt: string;
  customerName: string;
  items: CheckoutItem[];
  summary: CheckoutSummary;
  canCharge: boolean;
};

/** Cuerpo exacto de POST /checkout/:code/confirm; nunca lleva precios ni totales (RN-07). */
export type ConfirmCheckoutBody = {
  paymentMethod: CheckoutPaymentMethod;
  docType: CheckoutDocType;
  buyerDocNumber?: string;
  buyerName?: string;
};

export type CheckoutSaleItem = {
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

/** La venta ya cobrada que se muestra en el comprobante (backend checkout/service.ts). */
export type CheckoutSale = {
  id: number;
  code: string;
  receiptNumber: string;
  createdAt: string;
  paymentMethod: CheckoutPaymentMethod | 'ONLINE';
  priceApplied: 'NORMAL' | 'CMR';
  docType: CheckoutDocType;
  buyerDocType: string | null;
  buyerDocNumber: string | null;
  buyerName: string | null;
  customerName: string;
  cashierName: string | null;
  originalTotalCents: number;
  offerTotalCents: number;
  cmrTotalCents: number;
  totalCents: number;
  items: CheckoutSaleItem[];
};

export type CheckoutReject = {
  code: string;
  customerName: string;
};

export type SalesTodayItem = {
  code: string;
  receiptNumber: string;
  createdAt: string;
  paymentMethod: CheckoutPaymentMethod | 'ONLINE';
  docType: CheckoutDocType;
  totalCents: number;
};

export type SalesTodaySummary = {
  count: number;
  totalCents: number;
  byPaymentMethod: Record<string, number>;
};

export type SalesTodayList = {
  items: SalesTodayItem[];
  summary: SalesTodaySummary;
};

/** GET /checkout/:code: vista previa del carrito con ambos totales (RN-03, RN-07). */
export function getCheckoutPreview(code: string): Promise<CheckoutPreview> {
  return get<CheckoutPreview>(`/checkout/${encodeURIComponent(code)}`);
}

/** POST /checkout/:code/confirm: el servidor decide el monto y cobra en una transacción (RN-07). */
export function confirmCheckout(code: string, body: ConfirmCheckoutBody): Promise<CheckoutSale> {
  return post<CheckoutSale>(`/checkout/${encodeURIComponent(code)}/confirm`, body);
}

/** POST /checkout/:code/reject: devuelve el carrito a OPEN para que el cliente lo edite (RN-06). */
export function rejectCheckout(code: string): Promise<CheckoutReject> {
  return post<CheckoutReject>(`/checkout/${encodeURIComponent(code)}/reject`, {});
}

/** GET /checkout/sales/today: cobros del día para el cajero que consulta. */
export function getSalesToday(): Promise<SalesTodayList> {
  return get<SalesTodayList>('/checkout/sales/today');
}
