import { post } from './api';
import type { DocType } from '../types/purchases';

export type { DocType };

/** Campos que el Brick entrega y que enviamos a POST /payments/online (RN-20). Nunca el BIN. */
export type OnlinePaymentRequest = {
  token: string;
  paymentMethodId: string;
  docType: DocType;
  buyerDocNumber?: string;
  buyerName?: string;
  /** El total de oferta que el cliente vio; el servidor solo lo usa para detectar un cambio. */
  expectedAmountCents: number;
  /** Informativo: solo si el formulario lo entrega (RN-20). */
  cardLast4?: string;
};

export type OnlineSaleItem = {
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

/** Respuesta de POST /payments/online: el SaleView del cobro (backend checkout/service.ts). */
export type OnlineSaleView = {
  id: number;
  code: string;
  receiptNumber: string;
  createdAt: string;
  paymentMethod: string;
  priceApplied: string;
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
  items: OnlineSaleItem[];
};

export function postOnlinePayment(data: OnlinePaymentRequest): Promise<OnlineSaleView> {
  return post<OnlineSaleView>('/payments/online', data);
}
