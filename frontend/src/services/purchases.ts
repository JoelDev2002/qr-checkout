import { get } from './api';

export type PaymentMethod = 'CMR_CARD' | 'OTHER_CARD' | 'CASH' | 'ONLINE';
export type PriceApplied = 'NORMAL' | 'CMR';
export type DocType = 'TICKET' | 'BOLETA' | 'FACTURA';

/** Lo que devuelve el backend en la lista de compras del cliente (purchases/repository.ts). */
export type PurchaseSummary = {
  id: number;
  code: string;
  receiptNumber: string;
  createdAt: string;
  totalCents: number;
  paymentMethod: PaymentMethod;
  priceApplied: PriceApplied;
  docType: DocType;
  deliveredAt: string | null;
};

export type PurchaseList = {
  items: PurchaseSummary[];
  page: number;
  pageSize: number;
  total: number;
};

/** GET /purchases: el historial del cliente. En el QR sirve para confirmar que se cobró. */
export function getPurchases(): Promise<PurchaseList> {
  return get<PurchaseList>('/purchases');
}