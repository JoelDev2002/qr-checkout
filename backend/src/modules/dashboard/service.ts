import { formatLimaDate } from '../../domain/campaigns.js';
import {
  cmrSalesPercent,
  dashboardPeriod,
  defaultDashboardRange,
  fillDaySeries,
  type DaySaleAggregate,
} from '../../domain/dashboard.js';
import { ApiError } from '../../middlewares/errorHandler.js';
import {
  countScansPerProduct,
  findLowStockProducts,
  findProductsByIds,
  findSalesInRange,
  type LowStockProduct,
  type SaleForDashboard,
} from './repository.js';
import type { DashboardSummaryQuery } from './schemas.js';

export const TOP_SCANNED_LIMIT = 10;
export const LOW_STOCK_MAX_RESULTS = 50;

const RANGE_INCOMPLETE_MESSAGE = 'El rango se envía completo: from y to juntos.';

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

export type DashboardSummaryView = {
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

function resolveRange(query: DashboardSummaryQuery, now: Date): { from: string; to: string } {
  if (query.from !== undefined && query.to !== undefined) {
    return { from: query.from, to: query.to };
  }

  if (query.from === undefined && query.to === undefined) {
    return defaultDashboardRange(now);
  }

  throw new ApiError(400, 'VALIDATION_ERROR', RANGE_INCOMPLETE_MESSAGE);
}

function computeTotals(sales: readonly SaleForDashboard[]): DashboardSummaryView['totals'] {
  let totalCollectedCents = 0;
  let cmrSalesCount = 0;

  for (const sale of sales) {
    totalCollectedCents += sale.totalCents;
    if (sale.priceApplied === 'CMR') {
      cmrSalesCount += 1;
    }
  }

  const salesCount = sales.length;

  return {
    salesCount,
    totalCollectedCents,
    cmrSalesCount,
    otherSalesCount: salesCount - cmrSalesCount,
    cmrSalesPercent: cmrSalesPercent(cmrSalesCount, salesCount),
  };
}

function aggregateByDay(sales: readonly SaleForDashboard[]): DaySaleAggregate[] {
  const byDate = new Map<string, DaySaleAggregate>();

  for (const sale of sales) {
    const date = formatLimaDate(sale.createdAt);
    const current = byDate.get(date);

    if (current) {
      current.salesCount += 1;
      current.totalCents += sale.totalCents;
    } else {
      byDate.set(date, { date, salesCount: 1, totalCents: sale.totalCents });
    }
  }

  return [...byDate.values()];
}

function breakdownByPaymentMethod(sales: readonly SaleForDashboard[]): PaymentMethodBreakdownRow[] {
  const byMethod = new Map<string, PaymentMethodBreakdownRow>();

  for (const sale of sales) {
    const current = byMethod.get(sale.paymentMethod);

    if (current) {
      current.salesCount += 1;
      current.totalCents += sale.totalCents;
    } else {
      byMethod.set(sale.paymentMethod, {
        paymentMethod: sale.paymentMethod,
        salesCount: 1,
        totalCents: sale.totalCents,
      });
    }
  }

  return [...byMethod.values()].sort((a, b) => a.paymentMethod.localeCompare(b.paymentMethod));
}

async function resolveTopScanned(): Promise<TopScannedRow[]> {
  const counts = await countScansPerProduct();

  if (counts.length === 0) {
    return [];
  }

  const products = await findProductsByIds(counts.map((count) => count.productId));
  const nameByProduct = new Map(products.map((product) => [product.id, product]));

  return counts
    .map((count) => {
      const product = nameByProduct.get(count.productId);

      return {
        productId: count.productId,
        name: product?.name ?? 'Producto',
        barcode: product?.barcode ?? '',
        scans: count.scans,
      };
    })
    .sort((a, b) => b.scans - a.scans || a.name.localeCompare(b.name))
    .slice(0, TOP_SCANNED_LIMIT);
}

export async function getDashboardSummary(
  query: DashboardSummaryQuery,
  now: Date,
): Promise<DashboardSummaryView> {
  const { from, to } = resolveRange(query, now);
  const period = dashboardPeriod(from, to);

  const [sales, topScanned, lowStock] = await Promise.all([
    findSalesInRange(period.startsAt, period.endsAt),
    resolveTopScanned(),
    findLowStockProducts(query.lowStockThreshold, LOW_STOCK_MAX_RESULTS),
  ]);

  return {
    range: { from, to },
    totals: computeTotals(sales),
    salesByDay: fillDaySeries(from, to, aggregateByDay(sales)),
    byPaymentMethod: breakdownByPaymentMethod(sales),
    topScanned,
    lowStock,
  };
}