import type { CartStatus } from '../../services/cart';
import type { MappedPaymentResult } from './errorMapper';

/** Qué pantalla le corresponde a `/pay` con el carrito y el resultado que haya ahora mismo. */
export type PayOnlineView = 'loading' | 'error' | 'approved' | 'nothingToPay' | 'payable';

export type PayOnlineInput = {
  cart: { status: CartStatus; items: readonly unknown[] } | null;
  loading: boolean;
  result: MappedPaymentResult | null;
  sale: { id: number } | null;
};

/**
 * El pago aprobado gana siempre: la pantalla de éxito debe seguir visible aunque el carrito ya se
 * haya vaciado o pagado y `CartProvider` se actualice (T3.5e).
 */
export function payOnlineView({ cart, loading, result, sale }: PayOnlineInput): PayOnlineView {
  if (result?.kind === 'approved' && sale !== null) {
    return 'approved';
  }

  if (cart === null) {
    return loading ? 'loading' : 'error';
  }

  if (cart.status === 'OPEN' && cart.items.length > 0) {
    return 'payable';
  }

  return 'nothingToPay';
}
