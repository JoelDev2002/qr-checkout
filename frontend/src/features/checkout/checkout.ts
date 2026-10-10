import { ApiError } from '../../services/api';
import { UNEXPECTED_MESSAGE } from '../cart/messages';
import type {
  CheckoutDocType,
  CheckoutPaymentMethod,
  ConfirmCheckoutBody,
} from '../../services/checkout';

export const DNI_DIGITS = 8;
export const RUC_DIGITS = 11;

/** Sin 0, O, 1, I ni L, igual que domain/cartCode.ts del backend. */
const CART_CODE_PATTERN = /^C-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;

/** Textos exactos de DESIGN.md §5 y de la API de caja. */
export const QR_EXPIRED_MESSAGE = 'Este QR venció. Pide al cliente que genere uno nuevo.';
export const ALREADY_PAID_MESSAGE = 'Este carrito ya fue cobrado.';
export const CODE_NOT_FOUND_MESSAGE =
  'No encontramos ningún carrito con ese código. Verifica el código y vuelve a intentarlo.';
export const RATE_LIMITED_MESSAGE =
  'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
export const CART_NOT_PENDING_MESSAGE = 'Este carrito ya no está esperando el cobro.';

/** El cajero teclea el código como lo lea: en minúsculas o con espacios pegados (RN-05). */
export function normalizeCartCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function isValidCartCode(code: string): boolean {
  return CART_CODE_PATTERN.test(code);
}

/** El cajero que pega espacios al teclear el documento no cambia el número. */
export function normalizeDocNumber(raw: string): string {
  return raw.replace(/\s+/g, '');
}

export function normalizeBuyerName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function hasOnlyDigits(value: string, digits: number): boolean {
  return new RegExp(`^\\d{${digits}}$`).test(value);
}

export function isValidDni(value: string): boolean {
  return hasOnlyDigits(value, DNI_DIGITS);
}

export function isValidRuc(value: string): boolean {
  return hasOnlyDigits(value, RUC_DIGITS);
}

/**
 * RN-11: el ticket no pide documento, la boleta exige DNI de 8 dígitos y la factura RUC de 11 y
 * razón social. Devuelve el aviso en línea, o null si el comprobante está completo y válido.
 */
export function documentIssue(
  docType: CheckoutDocType,
  docNumber: string,
  buyerName: string,
): string | null {
  if (docType === 'TICKET') {
    return null;
  }

  if (docType === 'BOLETA') {
    const dni = normalizeDocNumber(docNumber);

    if (dni === '') {
      return 'Falta el DNI del comprador.';
    }

    return isValidDni(dni) ? null : `El DNI debe tener ${DNI_DIGITS} dígitos.`;
  }

  const ruc = normalizeDocNumber(docNumber);

  if (ruc === '') {
    return 'Falta el RUC del comprador.';
  }

  if (!isValidRuc(ruc)) {
    return `El RUC debe tener ${RUC_DIGITS} dígitos.`;
  }

  return normalizeBuyerName(buyerName) === '' ? 'Falta la razón social para la factura.' : null;
}

/** Cuerpo exacto de POST /checkout/:code/confirm: solo el medio y el comprobante (RN-07, RN-11). */
export function buildConfirmBody(input: {
  paymentMethod: CheckoutPaymentMethod;
  docType: CheckoutDocType;
  docNumber: string;
  buyerName: string;
}): ConfirmCheckoutBody {
  const body: ConfirmCheckoutBody = {
    paymentMethod: input.paymentMethod,
    docType: input.docType,
  };

  if (input.docType !== 'TICKET') {
    body.buyerDocNumber = normalizeDocNumber(input.docNumber);
  }

  if (input.docType === 'FACTURA') {
    body.buyerName = normalizeBuyerName(input.buyerName);
  }

  return body;
}

/**
 * El Receipt reconoce el medio por su nombre corto (lib/payment.ts) y la API de caja usa el enum
 * completo. Esta traducción solo afecta a cómo se muestra, no al cobro.
 */
export function receiptPaymentMethod(paymentMethod: string): 'CMR' | 'CARD' | 'CASH' | 'ONLINE' {
  switch (paymentMethod) {
    case 'CMR_CARD':
      return 'CMR';
    case 'OTHER_CARD':
      return 'CARD';
    case 'CASH':
      return 'CASH';
    case 'ONLINE':
      return 'ONLINE';
    default:
      return 'CARD';
  }
}

/** Traduce el error de la API a un texto para el cajero. */
export function checkoutErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return UNEXPECTED_MESSAGE;
  }

  switch (error.code) {
    case 'QR_EXPIRED':
      return QR_EXPIRED_MESSAGE;
    case 'ALREADY_PAID':
      return ALREADY_PAID_MESSAGE;
    case 'NOT_FOUND':
      return CODE_NOT_FOUND_MESSAGE;
    case 'TOO_MANY_REQUESTS':
      return RATE_LIMITED_MESSAGE;
    case 'CART_NOT_PENDING':
      return CART_NOT_PENDING_MESSAGE;
    default:
      // OUT_OF_STOCK, INVALID_DOCUMENT y VALIDATION_ERROR ya vienen en español y con el producto.
      return error.message;
  }
}

/** Errores tras los que ese carrito ya no sirve: el cajero debe escanear otro QR. */
export function shouldRestartScan(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }

  return (
    error.code === 'QR_EXPIRED' ||
    error.code === 'ALREADY_PAID' ||
    error.code === 'CART_NOT_PENDING' ||
    error.code === 'NOT_FOUND'
  );
}
