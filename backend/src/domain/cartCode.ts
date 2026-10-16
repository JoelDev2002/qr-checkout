import { customAlphabet } from 'nanoid';

/** Sin 0, O, 1, I ni L para que el cajero no lo lea mal (ARCHITECTURE.md §7). */
export const CART_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const CART_CODE_LENGTH = 5;

export const CART_CODE_PATTERN = new RegExp(`^C-[${CART_CODE_ALPHABET}]{${CART_CODE_LENGTH}}$`);

/** Prefijo del código de salida de una compra pagada en línea (RN-23). */
export const EXIT_CODE_PREFIX = 'O-';

export const EXIT_CODE_PATTERN = new RegExp(
  `^${EXIT_CODE_PREFIX}[${CART_CODE_ALPHABET}]{${CART_CODE_LENGTH}}$`,
);

const randomCode = customAlphabet(CART_CODE_ALPHABET, CART_CODE_LENGTH);

/** Código corto del carrito que viaja en el QR: `C-8F3K2`. */
export function generateCartCode(): string {
  return `C-${randomCode()}`;
}

export function isValidCartCode(code: string): boolean {
  return CART_CODE_PATTERN.test(code);
}

/** Código de salida de una compra en línea (`O-XXXXX`), con el mismo alfabeto que el del carrito. */
export function generateExitCode(): string {
  return `${EXIT_CODE_PREFIX}${randomCode()}`;
}

export function isValidExitCode(code: string): boolean {
  return EXIT_CODE_PATTERN.test(code);
}
