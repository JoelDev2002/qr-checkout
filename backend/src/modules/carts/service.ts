import { env, installmentsConfig } from '../../config/env.js';
import {
  checkQuantity,
  isQrExpired,
  itemIssue,
  quantityLimit,
  type ItemIssue,
  type QuantityLimitFailure,
} from '../../domain/cart.js';
import { generateCartCode } from '../../domain/cartCode.js';
import { getInstallments, type InstallmentOption } from '../../domain/installments.js';
import { resolvePrices, summarizeCart, type Campaign, type CartSummary } from '../../domain/pricing.js';
import { ApiError } from '../../middlewares/errorHandler.js';
import { prisma } from '../../infrastructure/prisma.js';
import { findActive as findActiveCampaigns } from '../campaigns/repository.js';
import {
  withCustomerCart,
  type CartItemRecord,
  type CartProductRecord,
  type CartRecord,
  type CartSession,
} from './repository.js';

export type CartItemView = {
  productId: number;
  barcode: string;
  name: string;
  brand: string;
  quantity: number;
  /** Menor entre el máximo por compra y el stock (RN-04). Nunca se envía el stock exacto. */
  maxQuantity: number;
  originalPriceCents: number;
  offerPriceCents: number;
  cmrPriceCents: number;
  hasCmrDiscount: boolean;
  campaignName: string | null;
  /** INACTIVE si el producto o su categoría se desactivaron; INSUFFICIENT_STOCK si el stock bajó. */
  issue: ItemIssue | null;
};

export type CartView = {
  id: number;
  status: CartRecord['status'];
  qrCode: string | null;
  qrExpiresAt: string | null;
  items: CartItemView[];
  summary: CartSummary;
  installments: InstallmentOption[];
};

const CART_LOCKED_MESSAGE = 'Tu carrito tiene un QR activo. Cancela el QR para editarlo.';
const PRODUCT_NOT_FOUND_MESSAGE = 'No encontramos este producto.';
const ITEM_NOT_FOUND_MESSAGE = 'Ese producto no está en tu carrito.';
const EMPTY_CART_MESSAGE = 'El carrito está vacío.';

type CartSnapshot = {
  cart: CartRecord;
  items: CartItemRecord[];
};

function isPurchasable(product: CartProductRecord): boolean {
  return product.active && product.categoryActive;
}

function failForLimit(failure: QuantityLimitFailure): never {
  if (failure.reason === 'MAX_PER_PURCHASE') {
    throw new ApiError(409, 'MAX_PER_PURCHASE', `Máximo ${failure.limit} unidades de este producto por compra.`);
  }

  throw new ApiError(
    409,
    'OUT_OF_STOCK',
    failure.stock > 0
      ? `Solo quedan ${failure.stock} unidades de este producto.`
      : 'No quedan unidades de este producto.',
  );
}

function toItemView(item: CartItemRecord, campaigns: readonly Campaign[], now: Date): CartItemView {
  const product = item.product;
  const prices = resolvePrices(product, campaigns, now);

  return {
    productId: product.id,
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    quantity: item.quantity,
    maxQuantity: quantityLimit(product),
    originalPriceCents: prices.originalCents,
    offerPriceCents: prices.normalCents,
    cmrPriceCents: prices.cmrCents,
    hasCmrDiscount: product.hasCmrDiscount,
    campaignName: prices.campaignName,
    issue: itemIssue(product, item.quantity),
  };
}

/** Los tres precios de cada ítem se calculan al leer (RN-17) y en el carrito no se guardan. */
function toView(cart: CartRecord, items: readonly CartItemRecord[], campaigns: readonly Campaign[], now: Date): CartView {
  const itemViews = items.map((item) => toItemView(item, campaigns, now));
  const summary = summarizeCart(
    itemViews.map((item) => ({
      quantity: item.quantity,
      originalCents: item.originalPriceCents,
      normalCents: item.offerPriceCents,
      cmrCents: item.cmrPriceCents,
    })),
  );

  return {
    id: cart.id,
    status: cart.status,
    // El código del QR solo tiene sentido mientras el carrito está bloqueado (RN-05, RN-06).
    qrCode: cart.status === 'PENDING' ? cart.qrCode : null,
    qrExpiresAt: cart.status === 'PENDING' && cart.qrExpiresAt ? cart.qrExpiresAt.toISOString() : null,
    items: itemViews,
    summary,
    installments: getInstallments(summary.cmrTotalCents, installmentsConfig),
  };
}

/** El carrito del cliente con el QR vencido ya liberado (RN-06). */
function unlockedCart(cart: CartRecord): CartRecord {
  return { ...cart, status: 'OPEN', qrCode: null, qrExpiresAt: null };
}

/**
 * El carrito vigente tiene que estar OPEN: con un QR vigente no se edita (RN-06). La expiración se
 * resuelve al leer, así que un QR vencido devuelve el carrito a OPEN y lo deja editable.
 */
async function requireEditableCart(session: CartSession, now: Date): Promise<CartRecord> {
  const found = await session.findCurrentCart();

  if (!found) {
    return session.createOpenCart();
  }

  if (isQrExpired(found, now)) {
    await session.releaseExpiredQr(found.id, now);

    return unlockedCart(found);
  }

  if (found.status === 'PENDING') {
    throw new ApiError(409, 'CART_LOCKED', CART_LOCKED_MESSAGE);
  }

  return found;
}

/** Igual que requireEditableCart, pero sin crear un carrito: editar o quitar algo que no está en él. */
async function requireExistingCart(session: CartSession, now: Date): Promise<CartRecord> {
  const found = await session.findCurrentCart();

  if (!found) {
    throw new ApiError(404, 'NOT_FOUND', ITEM_NOT_FOUND_MESSAGE);
  }

  if (isQrExpired(found, now)) {
    await session.releaseExpiredQr(found.id, now);

    return unlockedCart(found);
  }

  if (found.status === 'PENDING') {
    throw new ApiError(409, 'CART_LOCKED', CART_LOCKED_MESSAGE);
  }

  return found;
}

/** El carrito vigente del cliente; si no tiene ninguno se le crea abierto (RN-06). */
async function loadSnapshot(customerId: number, now: Date): Promise<CartSnapshot> {
  return withCustomerCart(customerId, async (session) => {
    const found = await session.findCurrentCart();
    const cart = found ?? (await session.createOpenCart());

    if (isQrExpired(cart, now)) {
      await session.releaseExpiredQr(cart.id, now);
    }

    return {
      cart: isQrExpired(cart, now) ? unlockedCart(cart) : cart,
      items: await session.listItems(cart.id),
    };
  });
}

export async function getCart(customerId: number, now: Date): Promise<CartView> {
  // Las campañas se consultan una sola vez por petición y se reparten entre todos los ítems.
  const campaigns = await findActiveCampaigns(now);
  const { cart, items } = await loadSnapshot(customerId, now);

  return toView(cart, items, campaigns, now);
}

/** RN-19: escanear suma 1 unidad. RN-04: nunca por encima del límite del producto. */
export async function addItemByBarcode(customerId: number, barcode: string, now: Date): Promise<CartView> {
  const { cart, items } = await withCustomerCart(customerId, async (session) => {
    const cart = await requireEditableCart(session, now);
    const product = await session.findProductByBarcode(barcode);

    if (!product || !isPurchasable(product)) {
      throw new ApiError(404, 'PRODUCT_NOT_FOUND', PRODUCT_NOT_FOUND_MESSAGE);
    }

    const current = await session.findItemQuantity(cart.id, product.id);
    const failure = checkQuantity(product, current + 1);

    if (failure) {
      failForLimit(failure);
    }

    await session.addUnits(cart.id, product.id, 1);

    return { cart, items: await session.listItems(cart.id) };
  });

  const campaigns = await findActiveCampaigns(now);

  return toView(cart, items, campaigns, now);
}

/** Fija la cantidad exacta de un producto que ya está en el carrito (RN-19, RN-04). */
export async function setItemQuantity(
  customerId: number,
  productId: number,
  quantity: number,
  now: Date,
): Promise<CartView> {
  const { cart, items } = await withCustomerCart(customerId, async (session) => {
    const cart = await requireExistingCart(session, now);
    const item = (await session.listItems(cart.id)).find((row) => row.productId === productId);

    if (!item) {
      throw new ApiError(404, 'NOT_FOUND', ITEM_NOT_FOUND_MESSAGE);
    }

    const failure = checkQuantity(item.product, quantity);

    if (failure) {
      failForLimit(failure);
    }

    await session.setItemQuantity(cart.id, productId, quantity);

    return { cart, items: await session.listItems(cart.id) };
  });

  const campaigns = await findActiveCampaigns(now);

  return toView(cart, items, campaigns, now);
}

export async function removeItem(customerId: number, productId: number, now: Date): Promise<CartView> {
  const { cart, items } = await withCustomerCart(customerId, async (session) => {
    const cart = await requireExistingCart(session, now);
    const current = await session.findItemQuantity(cart.id, productId);

    if (current === 0) {
      throw new ApiError(404, 'NOT_FOUND', ITEM_NOT_FOUND_MESSAGE);
    }

    await session.removeItem(cart.id, productId);

    return { cart, items: await session.listItems(cart.id) };
  });

  const campaigns = await findActiveCampaigns(now);

  return toView(cart, items, campaigns, now);
}

/** RN-22: vaciar el carrito completo, que no se puede hacer con un QR vigente. */
export async function clearCart(customerId: number, now: Date): Promise<CartView> {
  const { cart, items } = await withCustomerCart(customerId, async (session) => {
    const cart = await requireEditableCart(session, now);
    await session.clearItems(cart.id);

    return { cart, items: [] as CartItemRecord[] };
  });

  const campaigns = await findActiveCampaigns(now);

  return toView(cart, items, campaigns, now);
}

async function generateUniqueCartCode(): Promise<string> {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const code = generateCartCode();
    const existing = await prisma.cart.findUnique({ where: { qrCode: code } });

    if (!existing) {
      return code;
    }
  }

  throw new ApiError(409, 'CONFLICT', 'No se pudo generar el c�digo del QR. Int�ntalo de nuevo.');
}

export async function generateCartQr(customerId: number, now: Date): Promise<CartView> {
  const campaigns = await findActiveCampaigns(now);
  const MAX_RETRIES = 3;

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    try {
      const result = await withCustomerCart(customerId, async (session) => {
        let cart = await session.findCurrentCart();

        if (!cart) {
          cart = await session.createOpenCart();
        }

        if (isQrExpired(cart, now)) {
          await session.releaseExpiredQr(cart.id, now);
          cart = { ...cart, status: 'OPEN', qrCode: null, qrExpiresAt: null };
        }

        const items = await session.listItems(cart.id);

        if (items.length === 0) {
          throw new ApiError(400, 'VALIDATION_ERROR', EMPTY_CART_MESSAGE);
        }

        const hasIssue = items.some((item) => itemIssue(item.product, item.quantity));
        if (hasIssue) {
          throw new ApiError(409, 'OUT_OF_STOCK', 'Hay productos sin stock suficiente o inactivos.');
        }

        if (cart.status === 'PENDING' && cart.qrCode && cart.qrExpiresAt) {
          if (cart.qrExpiresAt.getTime() <= now.getTime()) {
            await session.cancelQr(cart.id);
          } else {
            return { cart, items, reuse: true as const };
          }
        }

        const qrCode = await generateUniqueCartCode();
        const qrExpiresAt = new Date(now.getTime() + env.CART_QR_TTL_MINUTES * 60_000);
        const affected = await session.generateQrIfOpen(cart.id, qrCode, qrExpiresAt);

        if (affected === 0) {
          throw new ApiError(409, 'CART_LOCKED', CART_LOCKED_MESSAGE);
        }

        const updatedCart = await session.findCurrentCart();
        return { cart: updatedCart ?? { ...cart, qrCode, qrExpiresAt, status: 'PENDING' as const }, items, reuse: false as const };
      });

      return toView(result.cart, result.items, campaigns, now);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'CONFLICT' && retry < MAX_RETRIES - 1) {
          continue;
        }
        throw error;
      }
      if (retry < MAX_RETRIES - 1) {
        continue;
      }
      throw error;
    }
  }

  throw new ApiError(409, 'CONFLICT', 'No se pudo generar el c�digo del QR. Int�ntalo de nuevo.');
}

export async function cancelCartQr(customerId: number, now: Date): Promise<CartView> {
  const campaigns = await findActiveCampaigns(now);

  const { cart, items } = await withCustomerCart(customerId, async (session) => {
    let cart = await session.findCurrentCart();

    if (!cart) {
      cart = await session.createOpenCart();
      return { cart, items: [] as CartItemRecord[] };
    }

    if (isQrExpired(cart, now)) {
      await session.releaseExpiredQr(cart.id, now);
      return { cart: unlockedCart(cart), items: await session.listItems(cart.id) };
    }

    if (cart.status === 'PENDING') {
      await session.cancelQrIfPending(cart.id);
      return { cart: { ...cart, status: 'OPEN' as const, qrCode: null, qrExpiresAt: null }, items: await session.listItems(cart.id) };
    }

    return { cart, items: await session.listItems(cart.id) };
  });

  return toView(cart, items, campaigns, now);
}
