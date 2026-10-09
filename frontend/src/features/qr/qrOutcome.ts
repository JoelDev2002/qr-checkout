import type { CartStatus } from '../../services/cart';

/**
 * En qué estado quedó el QR que la pantalla mostró, según la última consulta a GET /cart.
 *
 * Un QR vencido libera el MISMO carrito (vuelve a OPEN, se borra el código), así que el id no cambia.
 * Un carrito cobrado ya no está OPEN ni PENDING, y GET /cart crea y devuelve OTRO carrito con id nuevo:
 * para confirmar que se cobró (y no que se rechazó en caja) la compra debe existir en GET /purchases.
 */
export type QrPhase = 'active' | 'expired' | 'paid' | 'inactive';

/** Lo que la pantalla capturó al entrar: el carrito PENDING con su código. */
export type QrExpected = {
  cartId: number;
  code: string;
};

/** Lo que devuelve GET /cart en cada consulta, más los códigos de las compras del cliente. */
export type QrCurrent = {
  cartId: number;
  status: CartStatus;
  qrCode: string | null;
  purchaseCodes: readonly string[];
};

export function resolveQrPhase(expected: QrExpected, current: QrCurrent): QrPhase {
  if (current.cartId !== expected.cartId) {
    return current.purchaseCodes.includes(expected.code) ? 'paid' : 'inactive';
  }

  if (current.status === 'PENDING' && current.qrCode === expected.code) {
    return 'active';
  }

  return 'expired';
}