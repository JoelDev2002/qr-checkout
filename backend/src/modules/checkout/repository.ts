import { Prisma, type CartStatus, type DocType, type PaymentMethod, type PriceType } from '@prisma/client';
import { formatReceiptNumber } from '../../domain/document.js';
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

/**
 * RN-23: el contador de la serie sube de forma atómica y en la misma transacción del cobro, así que
 * dos cobros simultáneos de la misma serie nunca reciben el mismo número. La fila de la serie nace con
 * el primer cobro de esa serie.
 */
async function nextSeriesNumber(tx: Prisma.TransactionClient, series: string): Promise<number> {
  await tx.$executeRaw(
    Prisma.sql`INSERT INTO \`DocumentSeries\` (\`series\`, \`lastNumber\`) VALUES (${series}, 1)
      ON DUPLICATE KEY UPDATE \`lastNumber\` = \`lastNumber\` + 1`,
  );

  const row = await tx.documentSeries.findUniqueOrThrow({
    where: { series },
    select: { lastNumber: true },
  });

  return row.lastNumber;
}

/**
 * ARCHITECTURE.md §7: una sola transacción para el cobro entero. El carrito pasa de PENDING a PAID con
 * una actualización condicionada, cada ítem baja su stock con el stock condicionado a la cantidad, y
 * solo entonces se numeran el comprobante y se escriben la venta y su detalle. Si algo falla, la
 * excepción revierte el carrito, el stock y la numeración.
 */
export async function createPaidSale(input: CreatePaidSaleInput): Promise<SaleRecord> {
  return prisma.$transaction(
    async (tx) => {
      // Primero el carrito: si otro cajero lo cobró, la actualización no afecta ninguna fila y todo
      // lo que se escriba después se revierte.
      const paid = await tx.cart.updateMany({
        where: { id: input.cartId, status: 'PENDING' },
        data: { status: 'PAID' },
      });

      if (paid.count === 0) {
        throw new ChargeConflict('ALREADY_PAID');
      }

      for (const item of input.items) {
        const updated = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });

        if (updated.count === 0) {
          throw new ChargeConflict('OUT_OF_STOCK', item.name);
        }
      }

      const receiptNumber = formatReceiptNumber(input.series, await nextSeriesNumber(tx, input.series));

      const row = await tx.sale.create({
        data: {
          code: input.code,
          receiptNumber,
          cartId: input.cartId,
          customerId: input.customerId,
          cashierId: input.cashierId,
          paymentMethod: input.paymentMethod,
          priceApplied: input.priceApplied,
          originalTotalCents: input.originalTotalCents,
          offerTotalCents: input.offerTotalCents,
          cmrTotalCents: input.cmrTotalCents,
          totalCents: input.totalCents,
          docType: input.docType,
          buyerDocType: input.buyerDocType,
          buyerDocNumber: input.buyerDocNumber,
          buyerName: input.buyerName,
          items: {
            create: input.items.map((item) => ({
              productId: item.productId,
              barcode: item.barcode,
              name: item.name,
              quantity: item.quantity,
              originalPriceCents: item.originalPriceCents,
              normalPriceCents: item.normalPriceCents,
              cmrPriceCents: item.cmrPriceCents,
              paidPriceCents: item.paidPriceCents,
              subtotalCents: item.subtotalCents,
              campaignName: item.campaignName,
            })),
          },
        },
        select: saleSelect,
      });

      return toSaleRecord(row);
    },
    { timeout: 10_000 },
  );
}
