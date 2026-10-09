import { get, patch, post, request } from './api';

export type CartStatus = 'OPEN' | 'PENDING' | 'PAID' | 'CANCELLED';

export type CartItemIssue = 'INACTIVE' | 'INSUFFICIENT_STOCK' | null;

/** Ítem del carrito tal como lo devuelve la API (backend carts/service.ts). */
export type CartItem = {
  productId: number;
  barcode: string;
  name: string;
  brand: string;
  quantity: number;
  /** Menor entre el máximo por compra y el stock (RN-04). */
  maxQuantity: number;
  originalPriceCents: number;
  offerPriceCents: number;
  cmrPriceCents: number;
  hasCmrDiscount: boolean;
  campaignName: string | null;
  issue: CartItemIssue;
};

export type CartSummary = {
  originalTotalCents: number;
  discountTotalCents: number;
  normalTotalCents: number;
  cmrTotalCents: number;
  cmrSavingCents: number;
};

export type InstallmentOption = {
  count: number;
  installmentCents: number;
  firstInstallmentCents: number;
};

export type CartView = {
  id: number;
  status: CartStatus;
  qrCode: string | null;
  qrExpiresAt: string | null;
  items: CartItem[];
  summary: CartSummary;
  installments: InstallmentOption[];
};

/** GET /cart: el carrito abierto del cliente, lo crea si no existe. */
export function getCart(): Promise<CartView> {
  return get<CartView>('/cart');
}

/** POST /cart/items: agrega por código de barras; si ya estaba, suma 1 (RN-19). */
export function addCartItem(barcode: string): Promise<CartView> {
  return post<CartView>('/cart/items', { barcode });
}

/** PATCH /cart/items/:productId: fija la cantidad exacta respetando RN-04. */
export function setCartItemQuantity(productId: number, quantity: number): Promise<CartView> {
  return patch<CartView>(`/cart/items/${productId}`, { quantity });
}

/** DELETE /cart/items/:productId: quita el producto del carrito. */
export function removeCartItem(productId: number): Promise<CartView> {
  return request<CartView>(`/cart/items/${productId}`, { method: 'DELETE' });
}

/** DELETE /cart/items: vacía el carrito; responde CART_LOCKED si hay un QR activo (RN-22). */
export function clearCart(): Promise<CartView> {
  return request<CartView>('/cart/items', { method: 'DELETE' });
}

/** POST /cart/qr: genera (o reutiliza) el QR del carrito y lo bloquea (RN-05, RN-06). */
export function generateCartQr(): Promise<CartView> {
  return post<CartView>('/cart/qr', {});
}

/** DELETE /cart/qr: cancela el QR y libera el carrito para poder editarlo de nuevo (RN-06). */
export function cancelCartQr(): Promise<CartView> {
  return request<CartView>('/cart/qr', { method: 'DELETE' });
}
