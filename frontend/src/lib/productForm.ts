import type { CategoryField } from '../types/category';
import type { AdminProduct } from '../types/product';

export type ParseValueResult =
  | { ok: true; value: number }
  | { ok: false; message: string };

export type AttributeValue = string | number | boolean;

/** Texto del formulario antes de enviarse: los números siguen como texto. */
export type ProductFormDraft = {
  barcode: string;
  name: string;
  brand: string;
  color: string;
  categoryId: string;
  originalPrice: string;
  hasCmrDiscount: boolean;
  cmrPercent: string;
  stock: string;
  maxPerPurchase: string;
  attributes: Record<string, string>;
};

export type ProductCreateBody = {
  barcode: string;
  name: string;
  brand: string;
  color?: string;
  categoryId: number;
  originalPriceCents: number;
  hasCmrDiscount: boolean;
  cmrDiscountBps: number;
  stock: number;
  maxPerPurchase: number;
  attributes: Record<string, AttributeValue>;
};

/** Editar no cambia el código ni el stock (RN-12 y RN-13). */
export type ProductUpdateBody = Omit<ProductCreateBody, 'barcode' | 'stock'> & {
  discardAttributes?: boolean;
};

const DECIMAL_PATTERN = /^(\d+)(?:[.,](\d+))?$/;
/** Un porcentaje llega hasta 90: dos dígitos enteros y dos decimales como máximo. */
const MAX_WHOLE_PERCENT_DIGITS = 2;
/** Céntimos dentro del rango seguro de enteros de JavaScript. */
const MAX_WHOLE_SOLES_DIGITS = 10;
const MAX_STOCK_DIGITS = 9;

type DecimalParts = {
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

  return { whole: match[1] ?? '', decimals: match[2] ?? '' };
}

/** Quita los ceros a la izquierda: "007" → "7", "0" → "0". */
function trimLeadingZeros(whole: string): string {
  const trimmed = whole.replace(/^0+(?=\d)/, '');

  return trimmed.length > 0 ? trimmed : '0';
}

/** "5" → 50, "50" → 500, "" → 0: cada decimal son céntimos. */
function decimalsToCents(decimals: string): number {
  if (decimals.length === 0) {
    return 0;
  }

  return Number.parseInt(decimals.padEnd(2, '0'), 10);
}

/** "5" → 50, "50" → 500, "" → 0: cada decimal son puntos básicos. */
function decimalsToBps(decimals: string): number {
  if (decimals.length === 0) {
    return 0;
  }

  return Number.parseInt(decimals.padEnd(2, '0'), 10);
}

/**
 * Precio original en soles a céntimos (89.90 → 8990), sin coma flotante.
 * Acepta punto o coma decimal y hasta 2 decimales; el precio tiene que ser mayor que cero.
 */
export function parseOriginalPrice(text: string): ParseValueResult {
  if (text.trim().length === 0) {
    return fail('Escribe el precio original.');
  }

  const parts = readDecimal(text);

  if (parts === null) {
    return fail('Escribe el precio con números, por ejemplo 89.90.');
  }

  if (parts.decimals.length > 2) {
    return fail('El precio admite como máximo 2 decimales.');
  }

  const whole = trimLeadingZeros(parts.whole);

  if (whole.length > MAX_WHOLE_SOLES_DIGITS) {
    return fail('El precio es demasiado grande.');
  }

  const cents = Number.parseInt(whole, 10) * 100 + decimalsToCents(parts.decimals);

  if (cents <= 0) {
    return fail('El precio original debe ser mayor que cero.');
  }

  return ok(cents);
}

/**
 * Porcentaje CMR a puntos básicos (28.5 → 2850), sin coma flotante (RN-01).
 * El valor va de 1 a 90; sin descuento CMR el formulario ni lo envía.
 */
export function parseCmrPercent(text: string): ParseValueResult {
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

  if (whole.length > MAX_WHOLE_PERCENT_DIGITS) {
    return fail('El porcentaje debe ser mayor que 0 y hasta 90.');
  }

  const bps = Number.parseInt(whole, 10) * 100 + decimalsToBps(parts.decimals);

  if (bps <= 0 || bps > 9000) {
    return fail('El porcentaje debe ser mayor que 0 y hasta 90.');
  }

  return ok(bps);
}

/** Número entero sin signo, por ejemplo el stock inicial o el máximo por compra. */
export function parseInteger(text: string, label: string, min: number): ParseValueResult {
  const clean = text.trim();

  if (clean.length === 0) {
    return fail(`${label} es obligatorio.`);
  }

  if (!/^\d+$/.test(clean) || clean.length > MAX_STOCK_DIGITS) {
    return fail(`${label} debe ser un número entero.`);
  }

  const value = Number.parseInt(clean, 10);

  if (value < min) {
    return fail(min === 0 ? `${label} no puede ser negativo.` : `${label} debe ser al menos ${min}.`);
  }

  return ok(value);
}

/** El campo numérico de una categoría se envía como número, nunca como texto (RN-15). */
function parseCategoryNumber(text: string): ParseValueResult {
  const clean = text.trim();

  if (clean.startsWith('-')) {
    return fail('no puede ser negativo.');
  }

  const parts = readDecimal(clean);

  if (parts === null) {
    return fail('debe ser un número.');
  }

  const value = Number(clean.replace(',', '.'));

  if (!Number.isFinite(value)) {
    return fail('debe ser un número.');
  }

  if (value < 0) {
    return fail('no puede ser negativo.');
  }

  return ok(value);
}

function unwrap(result: ParseValueResult): number {
  if (!result.ok) {
    throw new Error(result.message);
  }

  return result.value;
}

function activeFields(fields: readonly CategoryField[]): CategoryField[] {
  return fields
    .filter((field) => field.active)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
}

/**
 * Convierte lo que escribió el admin en los valores de los campos de la categoría:
 * texto tal cual, número como número, lista como opción y sí/no como booleano.
 * Los opcionales vacíos no se envían; un obligatorio vacío lanza su aviso.
 */
export function buildAttributeValues(
  fields: readonly CategoryField[],
  raw: Readonly<Record<string, string>>,
): Record<string, AttributeValue> {
  const values: Record<string, AttributeValue> = {};

  for (const field of activeFields(fields)) {
    const text = (raw[field.key] ?? '').trim();

    if (text.length === 0) {
      if (field.required) {
        throw new Error(`${field.label} es obligatorio.`);
      }

      continue;
    }

    if (field.type === 'TEXT') {
      values[field.key] = text;
      continue;
    }

    if (field.type === 'NUMBER') {
      const parsed = parseCategoryNumber(text);

      if (!parsed.ok) {
        throw new Error(`${field.label} ${parsed.message}`);
      }

      values[field.key] = parsed.value;
      continue;
    }

    if (field.type === 'SELECT') {
      const options = field.options ?? [];

      if (!options.includes(text)) {
        throw new Error(`${field.label}: debe ser una de las opciones: ${options.join(', ')}.`);
      }

      values[field.key] = text;
      continue;
    }

    if (text === 'true') {
      values[field.key] = true;
      continue;
    }

    if (text === 'false') {
      values[field.key] = false;
      continue;
    }

    throw new Error(`${field.label}: debe ser sí o no.`);
  }

  return values;
}

function baseBody(draft: ProductFormDraft, fields: readonly CategoryField[]): Omit<
  ProductCreateBody,
  'barcode' | 'stock'
> {
  const body: Omit<ProductCreateBody, 'barcode' | 'stock'> = {
    name: draft.name.trim(),
    brand: draft.brand.trim(),
    categoryId: Number(draft.categoryId),
    originalPriceCents: unwrap(parseOriginalPrice(draft.originalPrice)),
    hasCmrDiscount: draft.hasCmrDiscount,
    cmrDiscountBps: draft.hasCmrDiscount ? unwrap(parseCmrPercent(draft.cmrPercent)) : 0,
    maxPerPurchase: unwrap(parseInteger(draft.maxPerPurchase, 'El máximo por compra', 1)),
    attributes: buildAttributeValues(fields, draft.attributes),
  };

  const color = draft.color.trim();

  if (color.length > 0) {
    body.color = color;
  }

  return body;
}

/** Cuerpo de POST /products: el precio en céntimos, el CMR en puntos básicos y el stock inicial. */
export function buildCreateBody(
  draft: ProductFormDraft,
  fields: readonly CategoryField[],
): ProductCreateBody {
  return {
    ...baseBody(draft, fields),
    barcode: draft.barcode.trim(),
    stock: unwrap(parseInteger(draft.stock, 'El stock inicial', 0)),
  };
}

/**
 * Cuerpo de PUT /products/:id: sin código ni stock. Si la categoría nueva no tiene campos que el
 * producto ya tenía, el servidor responde 409 hasta que el admin confirma con discardAttributes.
 */
export function buildUpdateBody(
  draft: ProductFormDraft,
  fields: readonly CategoryField[],
  options?: { discardAttributes?: boolean },
): ProductUpdateBody {
  const body: ProductUpdateBody = baseBody(draft, fields);

  if (options?.discardAttributes === true) {
    body.discardAttributes = true;
  }

  return body;
}

/** Céntimos a texto de soles para el campo del formulario (8990 → "89.90"), solo con enteros. */
export function formatCentsToSoles(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const decimals = Math.abs(cents % 100).toString().padStart(2, '0');

  return `${whole}.${decimals}`;
}

/** Puntos básicos a texto de porcentaje para el campo del formulario (2850 → "28.5"). */
export function formatBpsToPercent(bps: number): string {
  const digits = Math.abs(Math.trunc(bps)).toString().padStart(3, '0');
  const whole = digits.slice(0, -2);
  const decimals = digits.slice(-2).replace(/0+$/, '');

  return decimals.length > 0 ? `${whole}.${decimals}` : whole;
}

/**
 * Lo que ya guardó el servidor, como texto de formulario. Los valores de campos que ya no están
 * activos no se muestran ni se reenvían: el servidor los conserva (RN-15).
 */
export function productToDraft(
  product: AdminProduct,
  fields: readonly CategoryField[],
): ProductFormDraft {
  const attributes: Record<string, string> = {};

  for (const field of activeFields(fields)) {
    const value = product.attributes[field.key];

    if (value === undefined || value === null) {
      attributes[field.key] = '';
    } else if (typeof value === 'boolean') {
      attributes[field.key] = value ? 'true' : 'false';
    } else {
      attributes[field.key] = String(value);
    }
  }

  return {
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    color: product.color ?? '',
    categoryId: String(product.categoryId),
    originalPrice: formatCentsToSoles(product.originalPriceCents),
    hasCmrDiscount: product.hasCmrDiscount,
    cmrPercent: formatBpsToPercent(product.cmrDiscountBps),
    stock: String(product.stock),
    maxPerPurchase: String(product.maxPerPurchase),
    attributes,
  };
}
