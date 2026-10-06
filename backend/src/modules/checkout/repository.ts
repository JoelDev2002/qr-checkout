import { Prisma, type CartStatus } from '@prisma/client';
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
