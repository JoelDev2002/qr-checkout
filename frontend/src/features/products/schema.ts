import { z } from 'zod';
import { isValidEan13 } from '../../lib/barcode';
import { parseCmrPercent, parseInteger, parseOriginalPrice } from '../../lib/productForm';
import type { CategoryField } from '../../types/category';

export const PRODUCT_NAME_MAX_LENGTH = 120;
export const PRODUCT_BRAND_MAX_LENGTH = 60;
export const PRODUCT_COLOR_MAX_LENGTH = 40;
export const ATTRIBUTE_TEXT_MAX_LENGTH = 200;

export type ProductFormValues = {
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

export type ProductFormMode = 'create' | 'edit';

function addIssue(ctx: z.RefinementCtx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

/** Los campos que se muestran son los activos de la categoría elegida (RN-15). */
function validateAttributes(
  values: Readonly<Record<string, string>>,
  fields: readonly CategoryField[],
  ctx: z.RefinementCtx,
): void {
  for (const field of fields) {
    if (!field.active) {
      continue;
    }

    const text = (values[field.key] ?? '').trim();

    if (text.length === 0) {
      if (field.required) {
        addIssue(ctx, ['attributes', field.key], `${field.label} es obligatorio.`);
      }

      continue;
    }

    if (field.type === 'TEXT') {
      if (text.length > ATTRIBUTE_TEXT_MAX_LENGTH) {
        addIssue(
          ctx,
          ['attributes', field.key],
          `${field.label} no puede tener más de ${ATTRIBUTE_TEXT_MAX_LENGTH} caracteres.`,
        );
      }

      continue;
    }

    if (field.type === 'NUMBER') {
      if (text.startsWith('-')) {
        addIssue(ctx, ['attributes', field.key], `${field.label} no puede ser negativo.`);
      } else if (!/^\d+(?:[.,]\d+)?$/.test(text)) {
        addIssue(ctx, ['attributes', field.key], `${field.label} debe ser un número.`);
      }

      continue;
    }

    if (field.type === 'SELECT') {
      const options = field.options ?? [];

      if (!options.includes(text)) {
        addIssue(
          ctx,
          ['attributes', field.key],
          `${field.label} debe ser una de las opciones: ${options.join(', ')}.`,
        );
      }

      continue;
    }

    if (text !== 'true' && text !== 'false') {
      addIssue(ctx, ['attributes', field.key], `${field.label} debe ser sí o no.`);
    }
  }
}

/**
 * Formulario del producto: los campos adicionales se validan contra los campos activos de la
 * categoría elegida, así que el esquema se arma con ellos (RN-15).
 */
export function createProductFormSchema(
  fields: readonly CategoryField[],
  mode: ProductFormMode,
): z.ZodType<ProductFormValues> {
  return z
    .object({
      barcode: z
        .string({ required_error: 'El código de barras es obligatorio.' })
        .trim()
        .regex(/^\d{13}$/, 'El código de barras debe tener 13 dígitos.')
        .refine(isValidEan13, 'El código de barras no es un EAN-13 válido.'),
      name: z
        .string({ required_error: 'El nombre del producto es obligatorio.' })
        .trim()
        .min(1, 'El nombre del producto no puede estar vacío.')
        .max(
          PRODUCT_NAME_MAX_LENGTH,
          `El nombre no puede tener más de ${PRODUCT_NAME_MAX_LENGTH} caracteres.`,
        ),
      brand: z
        .string({ required_error: 'La marca es obligatoria.' })
        .trim()
        .min(1, 'La marca no puede estar vacía.')
        .max(
          PRODUCT_BRAND_MAX_LENGTH,
          `La marca no puede tener más de ${PRODUCT_BRAND_MAX_LENGTH} caracteres.`,
        ),
      color: z
        .string()
        .trim()
        .max(PRODUCT_COLOR_MAX_LENGTH, `El color no puede tener más de ${PRODUCT_COLOR_MAX_LENGTH} caracteres.`),
      categoryId: z.string({ required_error: 'La categoría es obligatoria.' }),
      originalPrice: z.string({ required_error: 'El precio original es obligatorio.' }),
      hasCmrDiscount: z.boolean({
        required_error: 'Indica si el producto tiene descuento CMR.',
        invalid_type_error: 'Indica si el producto tiene descuento CMR.',
      }),
      cmrPercent: z.string(),
      stock: z.string(),
      maxPerPurchase: z.string({ required_error: 'El máximo por compra es obligatorio.' }),
      attributes: z.record(z.string(), z.string()),
    })
    .superRefine((values, ctx) => {
      if (!/^[1-9]\d*$/.test(values.categoryId.trim())) {
        addIssue(ctx, ['categoryId'], 'Elige una categoría.');
      }

      const price = parseOriginalPrice(values.originalPrice);

      if (!price.ok) {
        addIssue(ctx, ['originalPrice'], price.message);
      }

      if (values.hasCmrDiscount) {
        const percent = parseCmrPercent(values.cmrPercent);

        if (!percent.ok) {
          addIssue(ctx, ['cmrPercent'], percent.message);
        }
      }

      const maxPerPurchase = parseInteger(values.maxPerPurchase, 'El máximo por compra', 1);

      if (!maxPerPurchase.ok) {
        addIssue(ctx, ['maxPerPurchase'], maxPerPurchase.message);
      }

      // El stock inicial solo existe al crear: al editar cambia con ajustes (RN-13).
      if (mode === 'create') {
        const stock = parseInteger(values.stock, 'El stock inicial', 0);

        if (!stock.ok) {
          addIssue(ctx, ['stock'], stock.message);
        }
      }

      validateAttributes(values.attributes, fields, ctx);
    });
}
