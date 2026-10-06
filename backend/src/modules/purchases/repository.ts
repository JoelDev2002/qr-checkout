import { Prisma, type DocType, type PaymentMethod } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma.js';

export type PurchaseSummary = {
  id: number;
  code: string;
  receiptNumber: string;
  createdAt: Date;
  totalCents: number;
  paymentMethod: PaymentMethod;
  priceApplied: 'NORMAL' | 'CMR';
  docType: DocType;
  deliveredAt: Date | null;
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
  createdAt: Date;
  paymentMethod: PaymentMethod;
  priceApplied: 'NORMAL' | 'CMR';
  docType: DocType;
  deliveredAt: Date | null;
  items: PurchaseDetailItem[];
  totals: PurchaseTotals;
};

export type PurchaseList = {
  items: PurchaseSummary[];
  page: number;
  pageSize: number;
  total: number;
};

const purchaseSummarySelect = {
  id: true,
  code: true,
  receiptNumber: true,
  createdAt: true,
  totalCents: true,
  paymentMethod: true,
  priceApplied: true,
  docType: true,
  deliveredAt: true,
} satisfies Prisma.SaleSelect;

const purchaseDetailSelect = {
  id: true,
  code: true,
  receiptNumber: true,
  createdAt: true,
  totalCents: true,
  paymentMethod: true,
  priceApplied: true,
  docType: true,
  deliveredAt: true,
  originalTotalCents: true,
  offerTotalCents: true,
  cmrTotalCents: true,
  customerId: true,
  items: {
    select: {
      name: true,
      quantity: true,
      originalPriceCents: true,
      normalPriceCents: true,
      cmrPriceCents: true,
      paidPriceCents: true,
      subtotalCents: true,
      campaignName: true,
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.SaleSelect;

export async function findPurchasesByCustomer(
  customerId: number,
  page: number,
  pageSize: number,
): Promise<PurchaseList> {
  const [items, total] = await prisma.$transaction([
    prisma.sale.findMany({
      where: { customerId },
      select: purchaseSummarySelect,
      orderBy: { createdAt: 'desc', id: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sale.count({ where: { customerId } }),
  ]);

  return {
    items,
    page,
    pageSize,
    total,
  };
}

export async function findPurchaseByIdForCustomer(
  customerId: number,
  saleId: number,
): Promise<PurchaseDetail | null> {
  const row = await prisma.sale.findUnique({
    where: { id: saleId },
    select: purchaseDetailSelect,
  });

  if (!row || row.customerId !== customerId) {
    return null;
  }

  const { items, originalTotalCents, offerTotalCents, cmrTotalCents, totalCents, customerId: _ignored, ...rest } = row as any;

  return {
    ...rest,
    items: items.map((item: any) => ({ ...item })),
    totals: {
      originalTotalCents,
      offerTotalCents,
      cmrTotalCents,
      totalCents,
    },
  };
}
