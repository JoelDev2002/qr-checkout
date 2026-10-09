import { ApiError } from '../../services/api';

/** Textos exactos de DESIGN.md §5 para los errores del carrito. */
export const PRODUCT_NOT_FOUND_MESSAGE =
  'No encontramos este producto. Escribe el código a mano o pide ayuda a un vendedor.';

export const CART_LOCKED_MESSAGE = 'Tu carrito tiene un QR activo. Cancela el QR para editarlo.';

export const UNEXPECTED_MESSAGE = 'Ocurrió un error inesperado. Inténtalo de nuevo.';

/**
 * Traduce el error de la API a un texto para el cliente. Los mensajes de stock y máximo ya vienen
 * del servidor con la cantidad exacta ("Máximo 2 unidades…", "Solo quedan 1 unidades…").
 */
export function cartErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PRODUCT_NOT_FOUND') {
      return PRODUCT_NOT_FOUND_MESSAGE;
    }

    if (error.code === 'CART_LOCKED') {
      return CART_LOCKED_MESSAGE;
    }

    return error.message;
  }

  return UNEXPECTED_MESSAGE;
}
