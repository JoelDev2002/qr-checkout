import type { CampaignInput, CampaignScope, DiscountType } from '../types/campaign';

export type ParseValueResult =
  | { ok: true; value: number }
  | { ok: false; message: string };

/** Texto del formulario antes de enviarse: los números siguen como texto. */
export type CampaignFormDraft = {
  name: string;
  scope: CampaignScope;
  discountType: DiscountType;
  discountValue: string;
  priority: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  productIds: number[];
  categoryIds: number[];
};

const PERCENT_RANGE_MESSAGE = 'El porcentaje debe ser mayor que 0 y hasta 90.';
const FIXED_POSITIVE_MESSAGE = 'El monto fijo debe ser mayor que cero.';
const TOO_LARGE_MESSAGE = 'El monto es demasiado grande.';
/** Un porcentaje llega hasta 90: dos dígitos enteros y dos decimales como máximo. */
const MAX_WHOLE_PERCENT_DIGITS = 2;
/** Céntimos dentro del rango seguro de enteros de JavaScript. */
const MAX_WHOLE_SOLES_DIGITS = 10;

const DECIMAL_PATTERN = /^(-?)(\d+)(?:[.,](\d+))?$/;

type DecimalParts = {
  negative: boolean;
  whole: string;
  decimals: string;
};

function fail(message: string): ParseValueResult {
  return { ok: false, message };
}

function ok(value: number): ParseValueResult {
  return { ok: true, value };
}

/** Separa la parte entera de la decimal aceptando punto o coma; sin aritmética de coma flotante. */
function readDecimal(text: string): DecimalParts | null {
  const match = DECIMAL_PATTERN.exec(text.trim());

  if (match === null) {
    return null;
  }

  return {
    negative: match[1] === '-',
    whole: match[2] ?? '',
    decimals: match[3] ?? '',
  };
}

/** Quita los ceros a la izquierda: "007" → "7", "0" → "0". */
function trimLeadingZeros(whole: string): string {
  const trimmed = whole.replace(/^0+(?=\d)/, '');

  return trimmed.length > 0 ? trimmed : '0';
}

/** "5" → 50, "50" → 500, "" → 0: cada decimal son puntos básicos. */
function decimalsToBps(decimals: string): number {
  if (decimals.length === 0) {
    return 0;
  }

  return Number.parseInt(decimals.padEnd(2, '0'), 10);
}

/**
 * Convierte el porcentaje que escribe el admin a puntos básicos (28.5 → 2850).
 * Acepta punto o coma decimal y hasta 2 decimales; el valor va de 1 a 9000.
 */
export function parsePercentToBps(text: string): ParseValueResult {
  if (text.trim().length === 0) {
    return fail('Escribe el porcentaje del descuento.');
  }

  const parts = readDecimal(text);

  if (parts === null) {
    return fail('Escribe el porcentaje con números, por ejemplo 28.5.');
  }

  if (parts.decimals.length > 2) {
    return fail('El porcentaje admite como máximo 2 decimales.');
  }

  const whole = trimLeadingZeros(parts.whole);

  if (parts.negative || whole.length > MAX_WHOLE_PERCENT_DIGITS) {
    return fail(PERCENT_RANGE_MESSAGE);
  }

  const bps = Number.parseInt(whole, 10) * 100 + decimalsToBps(parts.decimals);

  if (bps <= 0 || bps > 9000) {
    return fail(PERCENT_RANGE_MESSAGE);
  }

  return ok(bps);
}

/**
 * Convierte el monto fijo en soles a céntimos (50 y 50.00 → 5000).
 * Acepta punto o coma decimal y hasta 2 decimales; el monto tiene que ser mayor que cero.
 */
export function parseSolesToCents(text: string): ParseValueResult {
  if (text.trim().length === 0) {
    return fail('Escribe el monto fijo del descuento.');
  }

  const parts = readDecimal(text);

  if (parts === null) {
    return fail('Escribe el monto con números, por ejemplo 50.00.');
  }

  if (parts.decimals.length > 2) {
    return fail('El monto admite como máximo 2 decimales.');
  }

  const whole = trimLeadingZeros(parts.whole);

  if (whole.length > MAX_WHOLE_SOLES_DIGITS) {
    return fail(TOO_LARGE_MESSAGE);
  }

  const cents = Number.parseInt(whole, 10) * 100 + decimalsToBps(parts.decimals);

  if (parts.negative || cents <= 0) {
    return fail(FIXED_POSITIVE_MESSAGE);
  }

  return ok(cents);
}

/** Muestra una regla guardada en puntos básicos como porcentaje (2850 → "28.5 %"). */
export function formatBps(bps: number): string {
  // Los puntos básicos son enteros: se leen como dígitos, sin dividir.
  const digits = Math.abs(Math.trunc(bps)).toString().padStart(3, '0');
  const whole = digits.slice(0, -2);
  const decimals = digits.slice(-2).replace(/0+$/, '');

  return decimals.length > 0 ? `${whole}.${decimals} %` : `${whole} %`;
}

function parsePriority(text: string): number {
  const clean = text.trim();

  if (!/^-?\d{1,9}$/.test(clean)) {
    throw new Error('La prioridad debe ser un número entero.');
  }

  return Number.parseInt(clean, 10);
}

function parseDiscountValue(draft: CampaignFormDraft): number {
  const result =
    draft.discountType === 'PERCENT'
      ? parsePercentToBps(draft.discountValue)
      : parseSolesToCents(draft.discountValue);

  if (!result.ok) {
    throw new Error(result.message);
  }

  return result.value;
}

/**
 * Arma el cuerpo que se envía al servidor: el descuento como regla (puntos básicos o céntimos)
 * y los destinos según el alcance (solo productos, solo categorías o ninguno).
 */
export function buildCampaignBody(draft: CampaignFormDraft): CampaignInput {
  const body: CampaignInput = {
    name: draft.name.trim(),
    scope: draft.scope,
    discountType: draft.discountType,
    discountValue: parseDiscountValue(draft),
    priority: parsePriority(draft.priority),
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    active: draft.active,
  };

  if (draft.scope === 'PRODUCTS') {
    body.productIds = [...draft.productIds];
  }

  if (draft.scope === 'CATEGORIES') {
    body.categoryIds = [...draft.categoryIds];
  }

  return body;
}
