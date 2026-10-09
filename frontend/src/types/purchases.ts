import type { PaymentMethod, DocType } from '@prisma/client';

export type PriceApplied = 'NORMAL' | 'CMR';

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

export type PurchaseDetailItem = {
  name: string;
  quantity: number;
  originalPriceCents: number;
  normalPriceCents: number;
  cmrPriceCents: number;
  paidPriceCents: number;
  subtotalCents: number;
  campaignName: string | null;
};

export type PurchaseTotals = {
  originalTotalCents: number;
  offerTotalCents: number;
  cmrTotalCents: number;
  totalCents: number;
};

export type PurchaseDetail = {
  id: number;
  code: string;
  receiptNumber: string;
  createdAt: string;
  paymentMethod: PaymentMethod;
  priceApplied: PriceApplied;
  docType: DocType;
  deliveredAt: string | null;
  items: PurchaseDetailItem[];
  totals: PurchaseTotals;
};

export type PurchaseList = {
  items: PurchaseSummary[];
  page: number;
  pageSize: number;
  total: number;
};
