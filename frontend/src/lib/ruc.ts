/**
 * Validación del RUC peruano en el formulario (la misma regla que backend/src/domain/ruc.ts).
 * El servidor vuelve a validar: esto solo evita un viaje cuando el RUC está mal escrito.
 */

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const PREFIXES = ['10', '15', '16', '17', '20'];

export function normalizeRuc(value: string): string {
  return value.replace(/\s+/g, '');
}

function checkDigit(body: string): number {
  const sum = WEIGHTS.reduce((total, weight, index) => total + weight * Number(body[index]), 0);
  const digit = 11 - (sum % 11);

  return digit === 10 ? 0 : digit === 11 ? 1 : digit;
}

/** Devuelve el mensaje de error o null si el RUC es válido. */
export function rucError(value: string): string | null {
  const ruc = normalizeRuc(value);

  if (!/^\d{11}$/.test(ruc)) {
    return 'El RUC debe tener 11 dígitos.';
  }

  if (!PREFIXES.some((prefix) => ruc.startsWith(prefix))) {
    return 'El RUC debe empezar con 10, 15, 16, 17 o 20.';
  }

  if (checkDigit(ruc.slice(0, 10)) !== Number(ruc[10])) {
    return 'El RUC no es válido: revisa el último dígito.';
  }

  return null;
}
