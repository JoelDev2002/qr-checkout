import { ApiError } from '../../services/api';
import { UNEXPECTED_MESSAGE } from '../cart/messages';
import { RATE_LIMITED_MESSAGE } from './checkout';

/** Textos de la pantalla "Verificar salida" (DESIGN §4, cajero punto 5). */
export const EXIT_ALREADY_DELIVERED_MESSAGE = 'Ya entregado.';
export const EXIT_NOT_FOUND_MESSAGE =
  'No encontramos ninguna compra con ese código de salida. Verifícalo y vuelve a intentarlo.';

/** Sin 0, O, 1, I ni L, igual que domain/cartCode.ts del backend. */
const EXIT_CODE_PATTERN = /^O-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;

/** El cajero teclea el código como lo lea: en minúsculas o con espacios pegados (RN-05). */
export function normalizeExitCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function isValidExitCode(code: string): boolean {
  return EXIT_CODE_PATTERN.test(code);
}

/** Traduce el error de la API a un texto para el cajero que verifica la salida. */
export function exitVerifyErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return UNEXPECTED_MESSAGE;
  }

  switch (error.code) {
    case 'ALREADY_DELIVERED':
      return EXIT_ALREADY_DELIVERED_MESSAGE;
    case 'NOT_FOUND':
      return EXIT_NOT_FOUND_MESSAGE;
    case 'TOO_MANY_REQUESTS':
      return RATE_LIMITED_MESSAGE;
    default:
      // Los códigos ya vienen en español desde la API.
      return error.message;
  }
}
