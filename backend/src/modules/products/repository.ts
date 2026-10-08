import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma.js';
import type { AttributeValues } from '../../domain/attributes.js';

export const INITIAL_STOCK_REASON = 'Stock inicial';

export type ProductRecord = {
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
  createdAt: Date;
  updatedAt: Date;
};

export type ListProductsFilters = {
  search: string | undefined;
  categoryId: number | undefined;
  active: boolean | undefined;
  page: number;
  pageSize: number;
};

export type ProductPage = {
  rows: ProductRecord[];
  total: number;
};

export type CreateProductData = {
  barcode: string;
  name: string;
  brand: string;
  color: string | null;
  categoryId: number;
  originalPriceCents: number;
  hasCmrDiscount: boolean;
  cmrDiscountBps: number;
  attributes: AttributeValues;
  stock: number;
  maxPerPurchase: number;
  /** Admin que crea el producto: queda como autor del ajuste de stock inicial (RN-13). */
  userId: number;
};

export type UpdateProductData = {
  name: string;
  brand: string;
  color: string | null;
  categoryId: number;
  originalPriceCents: number;
  hasCmrDiscount: boolean;
  cmrDiscountBps: number;
  attributes: AttributeValues;
  maxPerPurchase: number;
};

export type StockAdjustmentRecord = {
  id: number;
  productId: number;
  userId: number;
  userName: string;
  delta: number;
  reason: string;
  createdAt: Date;
};

export type StockAdjustmentsPage = {
  rows: StockAdjustmentRecord[];
  total: number;
};

export type ApplyStockAdjustmentData = {
  productId: number;
  userId: number;
  delta: number;
  reason: string;
};

/** El ajuste se escribe solo si el cambio de stock fue posible: nunca queda un ajuste sin efecto. */
export type ApplyStockAdjustmentResult =
  | { status: 'APPLIED'; stock: number; adjustment: StockAdjustmentRecord }
  | { status: 'OUT_OF_STOCK'; stock: number }
  | { status: 'NOT_FOUND' };


const productSelect = {
  id: true,
  barcode: true,
  name: true,
  brand: true,
  color: true,
  categoryId: true,
  category: { select: { name: true } },
  originalPriceCents: true,
  hasCmrDiscount: true,
  cmrDiscountBps: true,
  attributes: true,
  stock: true,
  maxPerPurchase: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

const productOrderBy = [{ name: 'asc' }, { id: 'asc' }] satisfies Prisma.ProductOrderByWithRelationInput[];

type ProductRow = {
  id: number;
  barcode: string;
  name: string;
  brand: string;
  color: string | null;
  categoryId: number;
  category: { name: string };
  originalPriceCents: number;
  hasCmrDiscount: boolean;
  cmrDiscountBps: number;
  attributes: Prisma.JsonValue;
  stock: number;
  maxPerPurchase: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** La columna attributes es Json: acá se convierte al objeto de valores que usa domain/. */
function toAttributeValues(json: Prisma.JsonValue): Record<string, unknown> {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return {};
  }

  return json;
}

function toRecord(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    color: row.color,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    originalPriceCents: row.originalPriceCents,
    hasCmrDiscount: row.hasCmrDiscount,
    cmrDiscountBps: row.cmrDiscountBps,
    attributes: toAttributeValues(row.attributes),
    stock: row.stock,
    maxPerPurchase: row.maxPerPurchase,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function buildWhere(filters: ListProductsFilters): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};

  if (filters.search !== undefined) {
    where.OR = [
      { name: { contains: filters.search } },
      { brand: { contains: filters.search } },
      { barcode: { contains: filters.search } },
    ];
  }

  if (filters.categoryId !== undefined) {
    where.categoryId = filters.categoryId;
  }

  if (filters.active !== undefined) {
    where.active = filters.active;
  }

  return where;
}

export async function listProducts(filters: ListProductsFilters): Promise<ProductPage> {
  const where = buildWhere(filters);

  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      select: productSelect,
      orderBy: productOrderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
  ]);

  return { rows: rows.map(toRecord), total };
}

export async function findProductById(id: number): Promise<ProductRecord | null> {
  const row = await prisma.product.findUnique({ where: { id }, select: productSelect });

  return row ? toRecord(row) : null;
}

export async function findProductByBarcode(barcode: string): Promise<ProductRecord | null> {
  const row = await prisma.product.findUnique({ where: { barcode }, select: productSelect });

  return row ? toRecord(row) : null;
}

/** Cada lectura exitosa del escáner del cliente deja una fila (T3.1: "más escaneados"). */
export async function createProductScan(productId: number, customerId: number): Promise<void> {
  await prisma.productScan.create({ data: { productId, customerId } });
}

/** El producto y su ajuste de stock inicial nacen juntos: o se guardan los dos o ninguno (RN-13). */
export async function createProduct(data: CreateProductData): Promise<ProductRecord> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.product.create({
      data: {
        barcode: data.barcode,
        name: data.name,
        brand: data.brand,
        color: data.color,
        categoryId: data.categoryId,
        originalPriceCents: data.originalPriceCents,
        hasCmrDiscount: data.hasCmrDiscount,
        cmrDiscountBps: data.cmrDiscountBps,
        attributes: data.attributes,
        stock: data.stock,
        maxPerPurchase: data.maxPerPurchase,
      },
      select: productSelect,
    });

    if (data.stock > 0) {
      await tx.stockAdjustment.create({
        data: {
          productId: row.id,
          userId: data.userId,
          delta: data.stock,
          reason: INITIAL_STOCK_REASON,
        },
      });
    }

    return toRecord(row);
  });
}

export async function updateProduct(id: number, data: UpdateProductData): Promise<ProductRecord> {
  const row = await prisma.product.update({
    where: { id },
    data: {
      name: data.name,
      brand: data.brand,
      color: data.color,
      categoryId: data.categoryId,
      originalPriceCents: data.originalPriceCents,
      hasCmrDiscount: data.hasCmrDiscount,
      cmrDiscountBps: data.cmrDiscountBps,
      attributes: data.attributes,
      maxPerPurchase: data.maxPerPurchase,
    },
    select: productSelect,
  });

  return toRecord(row);
}

export async function setProductActive(id: number, active: boolean): Promise<ProductRecord> {
  const row = await prisma.product.update({ where: { id }, data: { active }, select: productSelect });

  return toRecord(row);
}

/** Traduce el error de unicidad de Prisma (P2002) para que el servicio responda DUPLICATE_BARCODE. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const adjustmentSelect = {
  id: true,
  productId: true,
  delta: true,
  reason: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
} satisfies Prisma.StockAdjustmentSelect;

type AdjustmentRow = {
  id: number;
  productId: number;
  delta: number;
  reason: string;
  createdAt: Date;
  user: { id: number; name: string };
};

function toAdjustmentRecord(row: AdjustmentRow): StockAdjustmentRecord {
  return {
    id: row.id,
    productId: row.productId,
    userId: row.user.id,
    userName: row.user.name,
    delta: row.delta,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

/**
 * RN-13: el ajuste y el cambio de stock ocurren en una sola transacción. La actualización del stock va
 * condicionada a que no quede negativo; si no afecta ninguna fila, no se escribe el ajuste.
 */
export async function applyStockAdjustment(
  data: ApplyStockAdjustmentData,
): Promise<ApplyStockAdjustmentResult> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.product.findUnique({ where: { id: data.productId }, select: { stock: true } });

    if (!current) {
      return { status: 'NOT_FOUND' };
    }

    const updated = await tx.product.updateMany({
      where: { id: data.productId, stock: { gte: Math.max(0, -data.delta) } },
      data: { stock: { increment: data.delta } },
    });

    if (updated.count === 0) {
      return { status: 'OUT_OF_STOCK', stock: current.stock };
    }

    const row = await tx.stockAdjustment.create({
      data: {
        productId: data.productId,
        userId: data.userId,
        delta: data.delta,
        reason: data.reason,
      },
      select: adjustmentSelect,
    });

    return { status: 'APPLIED', stock: current.stock + data.delta, adjustment: toAdjustmentRecord(row) };
  });
}

/** Historial del producto, del ajuste más reciente al más antiguo. */
export async function listStockAdjustments(
  productId: number,
  page: number,
  pageSize: number,
): Promise<StockAdjustmentsPage> {
  const where: Prisma.StockAdjustmentWhereInput = { productId };

  const [total, rows] = await prisma.$transaction([
    prisma.stockAdjustment.count({ where }),
    prisma.stockAdjustment.findMany({
      where,
      select: adjustmentSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { rows: rows.map(toAdjustmentRecord), total };
}
