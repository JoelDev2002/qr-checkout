/** Reglas del RUC peruano para proveedores. Sin base de datos ni Express. */

export const RUC_LENGTH = 11;

/** 10: persona natural · 15, 16, 17: otros contribuyentes · 20: persona jurídica. */
export const RUC_PREFIXES = ['10', '15', '16', '17', '20'] as const;

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export type RucCheck = { ok: true } | { ok: false; message: string };

/** Los espacios que se pegan al copiar el RUC no cambian el número. */
export function normalizeRuc(value: string): string {
  return value.replace(/\s+/g, '');
}

/** Dígito verificador (módulo 11) de los 10 primeros dígitos de un RUC. */
export function rucCheckDigit(body: string): number {
  if (!/^\d{10}$/.test(body)) {
    throw new Error('El cuerpo del RUC debe tener 10 dígitos.');
  }

  const sum = WEIGHTS.reduce((total, weight, index) => total + weight * Number(body[index]), 0);
  const digit = 11 - (sum % 11);

  if (digit === 10) {
    return 0;
  }

  if (digit === 11) {
    return 1;
  }

  return digit;
}

/** Revisa largo, prefijo y dígito verificador, y explica en español qué falla. */
export function checkRuc(value: string): RucCheck {
  const ruc = normalizeRuc(value);

  if (!new RegExp(`^\\d{${RUC_LENGTH}}$`).test(ruc)) {
    return { ok: false, message: `El RUC debe tener ${RUC_LENGTH} dígitos.` };
  }

  if (!RUC_PREFIXES.some((prefix) => ruc.startsWith(prefix))) {
    return { ok: false, message: 'El RUC debe empezar con 10, 15, 16, 17 o 20.' };
  }

  if (rucCheckDigit(ruc.slice(0, 10)) !== Number(ruc[10])) {
    return { ok: false, message: 'El RUC no es válido: revisa el último dígito.' };
  }

  return { ok: true };
}
