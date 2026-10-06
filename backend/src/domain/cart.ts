/** Reglas del carrito que no dependen de la base de datos (RN-04, RN-06, RN-12, RN-15). */

export type PurchaseLimits = {
  /** Regla del producto: cuántas unidades permite una compra. */
  maxPerPurchase: number;
  stock: number;
};

export type QuantityLimitFailure =
  | { reason: 'MAX_PER_PURCHASE'; limit: number }
  | { reason: 'OUT_OF_STOCK'; stock: number };

/** RN-04: la cantidad no puede superar el menor entre el máximo por compra y el stock. */
export function quantityLimit(product: PurchaseLimits): number {
  return Math.min(product.maxPerPurchase, product.stock);
}

/** null si la cantidad cabe en el límite de RN-04; si no cabe, por qué no cabe. */
export function checkQuantity(product: PurchaseLimits, quantity: number): QuantityLimitFailure | null {
  if (quantity > product.maxPerPurchase) {
    return { reason: 'MAX_PER_PURCHASE', limit: product.maxPerPurchase };
  }

  if (quantity > product.stock) {
    return { reason: 'OUT_OF_STOCK', stock: product.stock };
  }

  return null;
}

/** Por qué un ítem que ya está en el carrito ya no se puede comprar tal como está. */
export type ItemIssue = 'INACTIVE' | 'INSUFFICIENT_STOCK';

export type ItemAvailability = PurchaseLimits & {
  active: boolean;
  categoryActive: boolean;
};

/**
 * Los productos y las categorías se desactivan, no se eliminan (RN-12, RN-15): un ítem puede quedar
 * en el carrito aunque su producto ya no se venda. Si además el stock bajó de la cantidad pedida, el
 * aviso es el del stock.
 */
export function itemIssue(product: ItemAvailability, quantity: number): ItemIssue | null {
  if (!product.active || !product.categoryActive) {
    return 'INACTIVE';
  }

  if (quantity > product.stock) {
    return 'INSUFFICIENT_STOCK';
  }

  return null;
}

export type CartLock = {
  status: 'OPEN' | 'PENDING' | 'PAID' | 'CANCELLED';
  qrExpiresAt: Date | null;
};

/**
 * RN-06: con el QR vencido el carrito vuelve a estar abierto. La expiración se resuelve al leer, sin
 * tareas programadas, y la hora actual llega como parámetro para poder probarla.
 */
export function isQrExpired(cart: CartLock, now: Date): boolean {
  return (
    cart.status === 'PENDING' && cart.qrExpiresAt !== null && cart.qrExpiresAt.getTime() <= now.getTime()
  );
}
