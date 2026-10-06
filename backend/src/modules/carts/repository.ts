import { Prisma, type CartStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma.js';

export type CartRecord = {
  id: number;
  customerId: number;
  status: CartStatus;
  qrCode: string | null;
  qrExpiresAt: Date | null;
};

/** Lo del producto que el carrito necesita: sus precios calculables, el límite de RN-04 y su estado. */
export type CartProductRecord = {
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

export type CartItemRecord = {
  productId: number;
  quantity: number;
  product: CartProductRecord;
};

const cartSelect = {
  id: true,
  customerId: true,
  status: true,
  qrCode: true,
  qrExpiresAt: true,
} satisfies Prisma.CartSelect;

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

const itemSelect = {
  productId: true,
  quantity: true,
  product: { select: productSelect },
} satisfies Prisma.CartItemSelect;

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

const ACTIVE_STATUSES: CartStatus[] = ['OPEN', 'PENDING'];

function toProductRecord(row: ProductRow): CartProductRecord {
  return { ...row, categoryActive: row.category.active };
}

/**
 * Operaciones del carrito de un cliente dentro de una sola transacción. Todas comparten el mismo
 * contexto: el servicio no puede leer el carrito por un lado y escribirlo por otro.
 */
export type CartSession = {
  customerId: number;
  findCurrentCart(): Promise<CartRecord | null>;
  createOpenCart(): Promise<CartRecord>;
  /** Vuelve a OPEN un carrito cuyo QR venció y borra su código y su expiración. */
  releaseExpiredQr(cartId: number, now: Date): Promise<void>;
  findProductByBarcode(barcode: string): Promise<CartProductRecord | null>;
  findItemQuantity(cartId: number, productId: number): Promise<number>;
  addUnits(cartId: number, productId: number, units: number): Promise<void>;
  setItemQuantity(cartId: number, productId: number, quantity: number): Promise<void>;
  removeItem(cartId: number, productId: number): Promise<void>;
  clearItems(cartId: number): Promise<void>;
  listItems(cartId: number): Promise<CartItemRecord[]>;
};

function createCartSession(tx: Prisma.TransactionClient, customerId: number): CartSession {
  return {
    customerId,

    async findCurrentCart() {
      const row = await tx.cart.findFirst({
        where: { customerId, status: { in: ACTIVE_STATUSES } },
        orderBy: { id: 'desc' },
        select: cartSelect,
      });

      return row;
    },

    async createOpenCart() {
      return tx.cart.create({ data: { customerId, status: 'OPEN' }, select: cartSelect });
    },

    async releaseExpiredQr(cartId, now) {
      // La condición de la actualización no borra el QR de un carrito que ya se liberó.
      await tx.cart.updateMany({
        where: { id: cartId, status: 'PENDING', qrExpiresAt: { lte: now } },
        data: { status: 'OPEN', qrCode: null, qrExpiresAt: null },
      });
    },

    async findProductByBarcode(barcode) {
      const row = await tx.product.findUnique({ where: { barcode }, select: productSelect });

      return row ? toProductRecord(row) : null;
    },

    async findItemQuantity(cartId, productId) {
      const row = await tx.cartItem.findUnique({
        where: { cartId_productId: { cartId, productId } },
        select: { quantity: true },
      });

      return row?.quantity ?? 0;
    },

    async addUnits(cartId, productId, units) {
      await tx.cartItem.upsert({
        where: { cartId_productId: { cartId, productId } },
        create: { cartId, productId, quantity: units },
        update: { quantity: { increment: units } },
      });
    },

    async setItemQuantity(cartId, productId, quantity) {
      await tx.cartItem.update({ where: { cartId_productId: { cartId, productId } }, data: { quantity } });
    },

    async removeItem(cartId, productId) {
      await tx.cartItem.delete({ where: { cartId_productId: { cartId, productId } } });
    },

    async clearItems(cartId) {
      await tx.cartItem.deleteMany({ where: { cartId } });
    },

    async listItems(cartId) {
      const rows = await tx.cartItem.findMany({
        where: { cartId },
        select: itemSelect,
        orderBy: { id: 'asc' },
      });

      return rows.map((row): CartItemRecord => ({
        productId: row.productId,
        quantity: row.quantity,
        product: toProductRecord(row.product),
      }));
    },
  };
}

/**
 * Un cliente no puede quedar con dos carritos OPEN o PENDING, aunque lleguen dos peticiones a la vez.
 * Para lograrlo se bloquea la fila del usuario con SELECT ... FOR UPDATE al abrir la transacción:
 * la segunda petición espera a que la primera termine y entonces ve el carrito que ya existe. El mismo
 * bloqueo serializa el leer-cantidad-actualizar de un ítem, así que dos escaneos del mismo producto
 * no se pisan entre sí.
 */
export async function withCustomerCart<T>(
  customerId: number,
  action: (session: CartSession) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM \`User\` WHERE id = ${customerId} FOR UPDATE`);

      return action(createCartSession(tx, customerId));
    },
    { timeout: 10_000 },
  );
}
