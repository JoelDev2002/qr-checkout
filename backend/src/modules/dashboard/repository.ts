import { prisma } from '../../infrastructure/prisma.js';

/** Lo mínimo de cada venta del rango para armar el resumen del panel. */
export type SaleForDashboard = {
  paymentMethod: 'CMR_CARD' | 'OTHER_CARD' | 'CASH' | 'ONLINE';
  priceApplied: 'NORMAL' | 'CMR';
  totalCents: number;
  createdAt: Date;
};

export async function findSalesInRange(startsAt: Date, endsAt: Date): Promise<SaleForDashboard[]> {
  return prisma.sale.findMany({
    where: {
      createdAt: { gte: startsAt, lte: endsAt },
    },
    select: {
      paymentMethod: true,
      priceApplied: true,
      totalCents: true,
      createdAt: true,
    },
  });
}

export type ScannedCountPerProduct = {
  productId: number;
  scans: number;
};

/** Lecturas por producto, sin límite: las 10 primeras y los empates los decide el servicio. */
export async function countScansPerProduct(): Promise<ScannedCountPerProduct[]> {
  const rows = await prisma.productScan.groupBy({
    by: ['productId'],
    _count: { _all: true },
  });

  return rows.map((row) => ({ productId: row.productId, scans: row._count._all }));
}

export type ProductNameRecord = {
  id: number;
  name: string;
  barcode: string;
};

export async function findProductsByIds(ids: readonly number[]): Promise<ProductNameRecord[]> {
  if (ids.length === 0) {
    return [];
  }

  return prisma.product.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, barcode: true },
  });
}

export type LowStockProduct = {
  id: number;
  name: string;
  barcode: string;
  stock: number;
};

/** Productos activos con stock igual o menor al umbral, de menor a mayor stock (RN-12: no se eliminan). */
export async function findLowStockProducts(threshold: number, limit: number): Promise<LowStockProduct[]> {
  return prisma.product.findMany({
    where: { active: true, stock: { lte: threshold } },
    select: { id: true, name: true, barcode: true, stock: true },
    orderBy: [{ stock: 'asc' }, { name: 'asc' }],
    take: limit,
  });
}