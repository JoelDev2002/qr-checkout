import { z } from 'zod';
import { isValidEan13 } from '../../domain/barcode.js';

export const PRODUCT_NAME_MAX_LENGTH = 120;
export const PRODUCT_BRAND_MAX_LENGTH = 60;
export const PRODUCT_COLOR_MAX_LENGTH = 40;
export const PRODUCT_ATTRIBUTES_MAX_KEYS = 50;
/** RN-01: los porcentajes son mayores que 0 y llegan hasta 90. */
export const MAX_CMR_DISCOUNT_BPS = 9000;
export const DEFAULT_MAX_PER_PURCHASE = 10;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const LIST_SEARCH_MAX_LENGTH = 120;

const ean13 = z
  .string({ required_error: 'El código de barras es obligatorio.' })
  .trim()
  .regex(/^\d{13}$/, 'El código de barras debe tener 13 dígitos.')
  .refine(isValidEan13, 'El código de barras no es un EAN-13 válido.');

const productName = z
  .string({ required_error: 'El nombre del producto es obligatorio.' })
  .trim()
  .min(1, 'El nombre del producto no puede estar vacío.')
  .max(PRODUCT_NAME_MAX_LENGTH, `El nombre no puede tener más de ${PRODUCT_NAME_MAX_LENGTH} caracteres.`);

const brand = z
  .string({ required_error: 'La marca es obligatoria.' })
  .trim()
  .min(1, 'La marca no puede estar vacía.')
  .max(PRODUCT_BRAND_MAX_LENGTH, `La marca no puede tener más de ${PRODUCT_BRAND_MAX_LENGTH} caracteres.`);

const color = z
  .string({ invalid_type_error: 'El color debe ser un texto.' })
  .trim()
  .max(PRODUCT_COLOR_MAX_LENGTH, `El color no puede tener más de ${PRODUCT_COLOR_MAX_LENGTH} caracteres.`)
  .optional();

const categoryId = z
  .number({ required_error: 'La categoría es obligatoria.', invalid_type_error: 'La categoría debe ser un número.' })
  .int('La categoría debe ser un número entero.')
  .positive('La categoría debe ser mayor que cero.');

const originalPriceCents = z
  .number({
    required_error: 'El precio original es obligatorio.',
    invalid_type_error: 'El precio original debe ser un número entero de céntimos.',
  })
  .int('El precio original debe ser un número entero de céntimos.')
  .positive('El precio original debe ser mayor que cero.');

const hasCmrDiscount = z.boolean({
  required_error: 'Indica si el producto tiene descuento CMR.',
  invalid_type_error: 'Indica si el producto tiene descuento CMR.',
});

const cmrDiscountBps = z
  .number({ invalid_type_error: 'El porcentaje CMR debe ser un número entero de puntos básicos.' })
  .int('El porcentaje CMR debe ser un número entero de puntos básicos.')
  .min(0, 'El porcentaje CMR no puede ser negativo.')
  .max(MAX_CMR_DISCOUNT_BPS, `El porcentaje CMR llega hasta ${MAX_CMR_DISCOUNT_BPS} puntos básicos (90 %).`)
  .default(0);

const stock = z
  .number({
    required_error: 'El stock inicial es obligatorio.',
    invalid_type_error: 'El stock inicial debe ser un número entero.',
  })
  .int('El stock inicial debe ser un número entero.')
  .min(0, 'El stock inicial no puede ser negativo.');

const maxPerPurchase = z
  .number({ invalid_type_error: 'El máximo por compra debe ser un número entero.' })
  .int('El máximo por compra debe ser un número entero.')
  .min(1, 'El máximo por compra debe ser al menos 1.')
  .default(DEFAULT_MAX_PER_PURCHASE);

/** Los valores se validan contra los campos de la categoría con validateAttributes (RN-15). */
const attributes = z
  .record(z.unknown(), {
    invalid_type_error: 'Los campos adicionales deben ir en un objeto con la clave de cada campo.',
  })
  .refine((values) => Object.keys(values).length <= PRODUCT_ATTRIBUTES_MAX_KEYS, {
    message: `Un producto puede tener hasta ${PRODUCT_ATTRIBUTES_MAX_KEYS} campos adicionales.`,
  })
  .optional();

const productBodySchema = z.object({
  barcode: ean13,
  name: productName,
  brand,
  color,
  categoryId,
  originalPriceCents,
  hasCmrDiscount,
  cmrDiscountBps,
  stock,
  maxPerPurchase,
  attributes,
});

function addIssue(ctx: z.RefinementCtx, path: string, message: string): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
}

/** El porcentaje CMR solo existe si el producto tiene descuento CMR (RN-01). */
function checkCmrDiscount(data: { hasCmrDiscount: boolean; cmrDiscountBps: number }, ctx: z.RefinementCtx): void {
  if (data.hasCmrDiscount) {
    if (data.cmrDiscountBps <= 0) {
      addIssue(
        ctx,
        'cmrDiscountBps',
        `El descuento CMR va de 1 a ${MAX_CMR_DISCOUNT_BPS} puntos básicos (hasta 90 %).`,
      );
    }

    return;
  }

  if (data.cmrDiscountBps !== 0) {
    addIssue(ctx, 'cmrDiscountBps', 'Un producto sin descuento CMR debe tener el porcentaje en 0.');
  }
}

export const createProductSchema = productBodySchema.strict().superRefine(checkCmrDiscount);

/**
 * Editar no cambia el código de barras (es único e inmutable) ni el stock: el stock solo baja con
 * ventas y sube con ajustes, siempre con motivo (RN-13).
 */
export const updateProductSchema = productBodySchema
  .omit({ barcode: true, stock: true })
  .extend({ discardAttributes: z.boolean().optional() })
  .strict()
  .superRefine(checkCmrDiscount);

export const setProductActiveSchema = z
  .object({
    active: z.boolean({ invalid_type_error: 'Indica si el producto queda activo.' }),
  })
  .strict();

export const productIdParamSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: 'El identificador debe ser un número.' })
    .int('El identificador debe ser un número entero.')
    .positive('El identificador debe ser mayor que cero.'),
});

const activeFilter = z
  .enum(['true', 'false', '1', '0'], { errorMap: () => ({ message: 'El filtro de estado debe ser true o false.' }) })
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true' || value === '1'));

export const listProductsQuerySchema = z.object({
  q: z
    .string({ invalid_type_error: 'La búsqueda debe ser un texto.' })
    .trim()
    .max(LIST_SEARCH_MAX_LENGTH, `La búsqueda no puede tener más de ${LIST_SEARCH_MAX_LENGTH} caracteres.`)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  categoryId: z.coerce
    .number({ invalid_type_error: 'La categoría del filtro debe ser un número.' })
    .int('La categoría del filtro debe ser un número entero.')
    .positive('La categoría del filtro debe ser mayor que cero.')
    .optional(),
  active: activeFilter,
  page: z.coerce
    .number({ invalid_type_error: 'La página debe ser un número.' })
    .int('La página debe ser un número entero.')
    .min(1, 'La página empieza en 1.')
    .default(1),
  pageSize: z.coerce
    .number({ invalid_type_error: 'El tamaño de página debe ser un número.' })
    .int('El tamaño de página debe ser un número entero.')
    .min(1, 'El tamaño de página debe ser al menos 1.')
    .max(MAX_PAGE_SIZE, `El tamaño de página llega hasta ${MAX_PAGE_SIZE}.`)
    .default(DEFAULT_PAGE_SIZE),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;