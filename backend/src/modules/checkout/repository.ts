import { Prisma, type CartStatus, type DocType, type PaymentMethod, type PriceType } from '@prisma/client';
import { formatReceiptNumber } from '../../domain/document.js';
import { startOfDayLima } from '../../domain/time.js';
import { prisma } from '../../infrastructure/prisma.js';

/** Lo del producto que el cajero necesita para mostrar el ítem y decidir si se puede cobrar. */
export type CheckoutProductRecord = {
  id: number;
  barcode: string;
  name: string;
  brand: string;
  categoryId: number;
  originalPriceCents: number;
  hasCmrDiscount: boolean;
  cmrDiscountBps: number;
  stock: number;
  maxPerPurchase: number;
  active: boolean;
  categoryActive: boolean;
};

export type CheckoutItemRecord = {
  productId: number;
  quantity: number;
  product: CheckoutProductRecord;
};

/** El carrito que el cajero escaneó: con el nombre del cliente y sus ítems ya cargados. */
export type CheckoutCartRecord = {
  id: number;
  status: CartStatus;
  qrCode: string | null;
  qrExpiresAt: Date | null;
  customer: { id: number; name: string };
  items: CheckoutItemRecord[];
};

const productSelect = {
  id: true,
  barcode: true,
  name: true,
  brand: true,
  categoryId: true,
  originalPriceCents: true,
  hasCmrDiscount: true,
  cmrDiscountBps: true,
  stock: true,
  maxPerPurchase: true,
  active: true,
  category: { select: { active: true } },
} satisfies Prisma.ProductSelect;

const cartSelect = {
  id: true,
  status: true,
  qrCode: true,
  qrExpiresAt: true,
  customer: { select: { id: true, name: true } },
  items: {
    select: { productId: true, quantity: true, product: { select: productSelect } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.CartSelect;

type ProductRow = {
  id: number;
  barcode: string;
  name: string;
  brand: string;
  categoryId: number;
  originalPriceCents: number;
  hasCmrDiscount: boolean;
  cmrDiscountBps: number;
  stock: number;
  maxPerPurchase: number;
  active: boolean;
  category: { active: boolean };
};

type CartRow = {
  id: number;
  status: CartStatus;
  qrCode: string | null;
  qrExpiresAt: Date | null;
  customer: { id: number; name: string };
  items: Array<{ productId: number; quantity: number; product: ProductRow }>;
};
function toCartRecord(row: CartRow): CheckoutCartRecord {
  return {
    id: row.id,
    status: row.status,
    qrCode: row.qrCode,
    qrExpiresAt: row.qrExpiresAt,
    customer: row.customer,
    items: row.items.map((item): CheckoutItemRecord => ({
      productId: item.productId,
      quantity: item.quantity,
      product: { ...item.product, categoryActive: item.product.category.active },
    })),
  };
}

/** El único lugar donde se busca un carrito por el código del QR (RN-05). */
export async function findCartByQrCode(code: string): Promise<CheckoutCartRecord | null> {
  const row = await prisma.cart.findUnique({ where: { qrCode: code }, select: cartSelect });

  return row ? toCartRecord(row) : null;
}

/**
 * Rechazar devuelve el carrito a OPEN y borra el código y su expiración, para que el cliente pueda
 * volver a editarlo (RN-06). La condición evita tocar un carrito que entre tanto se cobró.
 */
export async function releaseCart(cartId: number): Promise<number> {
  const result = await prisma.cart.updateMany({
    where: { id: cartId, status: 'PENDING' },
    data: { status: 'OPEN', qrCode: null, qrExpiresAt: null },
  });

  return result.count;
}
/** Un ítem de la venta con los tres precios y el cobrado, para que el historial no cambie (RN-09). */
export type SaleItemRecord = {
  productId: number;
  barcode: string;
  name: string;
  quantity: number;
  originalPriceCents: number;
  normalPriceCents: number;
  cmrPriceCents: number;
  paidPriceCents: number;
  subtotalCents: number;
  campaignName: string | null;
};

export type SaleRecord = {
  id: number;
  code: string;
  receiptNumber: string;
  createdAt: Date;
  paymentMethod: PaymentMethod;
  priceApplied: PriceType;
  docType: DocType;
  buyerDocType: string | null;
  buyerDocNumber: string | null;
  buyerName: string | null;
  originalTotalCents: number;
  offerTotalCents: number;
  cmrTotalCents: number;
  totalCents: number;
  customerName: string;
  cashierName: string | null;
  items: SaleItemRecord[];
};

export type CreatePaidSaleItem = SaleItemRecord;

export type CreatePaidSaleInput = {
  /** El código del carrito, que en caja es también el código de la venta (RN-23). */
  code: string;
  /** T001, B001 o F001, según el comprobante (RN-23). */
  series: string;
  cartId: number;
  customerId: number;
  cashierId: number;
  paymentMethod: PaymentMethod;
  priceApplied: PriceType;
  originalTotalCents: number;
  offerTotalCents: number;
  cmrTotalCents: number;
  totalCents: number;
  docType: DocType;
  buyerDocType: string | null;
  buyerDocNumber: string | null;
  buyerName: string | null;
  items: CreatePaidSaleItem[];
};
/**
 * Falla prevista dentro de la transacción del cobro. Se lanza para que Prisma revierta todo lo escrito
 * hasta ese punto; el servicio la traduce al error que ve el cajero.
 */
export class ChargeConflict extends Error {
  constructor(
    readonly reason: 'ALREADY_PAID' | 'OUT_OF_STOCK',
    /** Solo en OUT_OF_STOCK: qué producto no pudo descontarse. */
    readonly productName: string | null = null,
  ) {
    super(reason);
    this.name = 'ChargeConflict';
  }
}

const saleItemSelect = {
  productId: true,
  barcode: true,
  name: true,
  quantity: true,
  originalPriceCents: true,
  normalPriceCents: true,
  cmrPriceCents: true,
  paidPriceCents: true,
  subtotalCents: true,
  campaignName: true,
} satisfies Prisma.SaleItemSelect;

const saleSelect = {
  id: true,
  code: true,
  receiptNumber: true,
  createdAt: true,
  paymentMethod: true,
  priceApplied: true,
  docType: true,
  buyerDocType: true,
  buyerDocNumber: true,
  buyerName: true,
  originalTotalCents: true,
  offerTotalCents: true,
  cmrTotalCents: true,
  totalCents: true,
  customer: { select: { name: true } },
  cashier: { select: { name: true } },
  items: { select: saleItemSelect, orderBy: { id: 'asc' } },
} satisfies Prisma.SaleSelect;

type SaleRow = Prisma.SaleGetPayload<{ select: typeof saleSelect }>;

function toSaleRecord(row: SaleRow): SaleRecord {
  return {
    id: row.id,
    code: row.code,
    receiptNumber: row.receiptNumber,
    createdAt: row.createdAt,
    paymentMethod: row.paymentMethod,
    priceApplied: row.priceApplied,
    docType: row.docType,
    buyerDocType: row.buyerDocType,
    buyerDocNumber: row.buyerDocNumber,
    buyerName: row.buyerName,
    originalTotalCents: row.originalTotalCents,
    offerTotalCents: row.offerTotalCents,
    cmrTotalCents: row.cmrTotalCents,
    totalCents: row.totalCents,
    customerName: row.customer.name,
    cashierName: row.cashier ? row.cashier.name : null,
    items: row.items.map((item) => ({ ...item })),
  };
}
export type SaleTodaySummaryItem = {
  code: string;
  receiptNumber: string;
  createdAt: Date;
  paymentMethod: PaymentMethod;
  docType: DocType;
  totalCents: number;
};

export type PaymentMethodBreakdown = Record<string, number>;

export type SalesTodaySummary = {
  count: number;
  totalCents: number;
  byPaymentMethod: PaymentMethodBreakdown;
};

export type SalesTodayList = {
  items: SaleTodaySummaryItem[];
  summary: SalesTodaySummary;
};

export async function findSalesTodayForCashier(
  cashierId: number,
  now: Date,
): Promise<SalesTodayList> {
  const start = startOfDayLima(now);

  const sales = await prisma.sale.findMany({
    where: {
      cashierId,
      createdAt: {
        gte: start,
        lte: now,
      },
    },
    select: {
      code: true,
      receiptNumber: true,
      createdAt: true,
      paymentMethod: true,
      docType: true,
      totalCents: true,
    },
    orderBy: { createdAt: 'desc', id: 'desc' },
  });

  const count = sales.length;
  let totalCents = 0;
  const byPaymentMethod: PaymentMethodBreakdown = {};
  for (const sale of sales) {
    totalCents += sale.totalCents;
    byPaymentMethod[sale.paymentMethod] = (byPaymentMethod[sale.paymentMethod] ?? 0) + sale.totalCents;
  }

  return {
    items: sales,
    summary: {
      count,
      totalCents,
      byPaymentMethod,
    },
  };
}
