const EAN13_LENGTH = 13;
const EAN13_BODY_LENGTH = 12;

/** Rango que GS1 reserva para uso interno de una empresa (ARCHITECTURE.md §11). */
const INTERNAL_PREFIX_MIN = 200;
const INTERNAL_PREFIX_MAX = 299;

function isDigits(value: string): boolean {
  return /^\d+$/.test(value);
}

/** Dígito verificador de un EAN-13 a partir de sus 12 primeros dígitos. */
export function ean13CheckDigit(first12Digits: string): number {
  if (first12Digits.length !== EAN13_BODY_LENGTH || !isDigits(first12Digits)) {
    throw new Error(`El código debe tener ${EAN13_BODY_LENGTH} dígitos antes del verificador.`);
  }

  let sum = 0;

  for (let index = 0; index < EAN13_BODY_LENGTH; index += 1) {
    const digit = Number(first12Digits.slice(index, index + 1));
    sum += index % 2 === 0 ? digit : digit * 3;
  }

  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  if (code.length !== EAN13_LENGTH || !isDigits(code)) {
    return false;
  }

  const body = code.slice(0, EAN13_BODY_LENGTH);
  return String(ean13CheckDigit(body)) === code.slice(EAN13_BODY_LENGTH);
}

/** EAN-13 interno de la tienda, con prefijo entre 200 y 299 y dígito verificador calculado. */
export function generateInternalBarcode(): string {
  const range = INTERNAL_PREFIX_MAX - INTERNAL_PREFIX_MIN + 1;
  const prefix = INTERNAL_PREFIX_MIN + Math.floor(Math.random() * range);
  let body = String(prefix);

  while (body.length < EAN13_BODY_LENGTH) {
    body += String(Math.floor(Math.random() * 10));
  }

  return body + String(ean13CheckDigit(body));
}
