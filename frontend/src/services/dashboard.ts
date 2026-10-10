import { get } from './api';
import { buildDashboardQuery } from '../lib/dashboard';
import type { DashboardQuery } from '../lib/dashboard';

export type DaySaleAggregate = {
  date: string;
  salesCount: number;
  totalCents: number;
};

export type PaymentMethodBreakdownRow = {
  paymentMethod: string;
  salesCount: number;
  totalCents: number;
};

export type TopScannedRow = {
  productId: number;
  name: string;
  barcode: string;
  scans: number;
};

export type LowStockProduct = {
  id: number;
  name: string;
  barcode: string;
  stock: number;
};

export type DashboardSummary = {
  range: { from: string; to: string };
  totals: {
    salesCount: number;
    totalCollectedCents: number;
    cmrSalesCount: number;
    otherSalesCount: number;
    cmrSalesPercent: number;
  };
  salesByDay: DaySaleAggregate[];
  byPaymentMethod: PaymentMethodBreakdownRow[];
  topScanned: TopScannedRow[];
  lowStock: LowStockProduct[];
};

/** El panel pide el resumen al servidor; nunca calcula totales en el navegador. */
export function getDashboardSummary(query: DashboardQuery): Promise<DashboardSummary> {
  return get<DashboardSummary>(`/dashboard/summary${buildDashboardQuery(query)}`);
}