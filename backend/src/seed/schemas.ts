import { z } from 'zod';
import {
  CATEGORY_NAME_MAX_LENGTH,
  FIELD_KEY_MAX_LENGTH,
  FIELD_LABEL_MAX_LENGTH,
  FIELD_OPTION_MAX_LENGTH,
  FIELD_OPTIONS_MAX,
  FIELD_UNIT_MAX_LENGTH,
} from '../modules/categories/schemas.js';
import { CAMPAIGN_NAME_MAX_LENGTH, MAX_PERCENT_BPS } from '../modules/campaigns/schemas.js';

/** ARCHITECTURE.md §4: los porcentajes llegan hasta 90. */
const MAX_PERCENT = MAX_PERCENT_BPS / 100;

export type SeedCatalogInput = {
  categories: unknown;
  campaigns: unknown;
  products: unknown;
};

/**
 * Un número escrito en el JSON es un float binario: 89.90 puede guardarse como 89.899999999999999.
 * Redondeando se recupera el céntimo o el punto básico que el archivo quiso escribir.
 */
export function solesToCents(soles: number): number {
  return Math.round(soles * 100);
}

export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

/** Convierte un porcentaje del archivo en puntos básicos, o null si el descuento es fijo. */
export function discountValueOf(
  discountType: 'PERCENT' | 'FIXED',
  percent: number | undefined,
  amount: number | undefined,
): number {
  return discountType === 'PERCENT' ? percentToBps(percent ?? 0) : solesToCents(amount ?? 0);
}

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

const soles = z
  .number({ invalid_type_error: 'El monto debe ser un número en soles.' })
  .positive('El monto debe ser mayor que cero.')
  .refine(hasAtMostTwoDecimals, 'El monto no puede tener más de dos decimales.');

const percent = z
  .number({ invalid_type_error: 'El porcentaje debe ser un número.' })
  .positive('El porcentaje debe ser mayor que cero.')
  .max(MAX_PERCENT, `El porcentaje llega hasta ${MAX_PERCENT}.`)
  .refine(hasAtMostTwoDecimals, 'El porcentaje no puede tener más de dos decimales.');

const fieldType = z.enum(['TEXT', 'NUMBER', 'SELECT', 'BOOLEAN'], {
  errorMap: () => ({ message: 'El tipo del campo debe ser TEXT, NUMBER, SELECT o BOOLEAN.' }),
});

const campaignScope = z.enum(['PRODUCTS', 'CATEGORIES', 'STORE'], {
  errorMap: () => ({ message: 'El alcance debe ser PRODUCTS, CATEGORIES o STORE.' }),
});

const discountType = z.enum(['PERCENT', 'FIXED'], {
  errorMap: () => ({ message: 'El tipo de descuento debe ser PERCENT o FIXED.' }),
});

const limaDate = z
  .string({ required_error: 'Indica la fecha en formato AAAA-MM-DD.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD.');

const fieldFileSchema = z
  .object({
    key: z.string().trim().min(1).max(FIELD_KEY_MAX_LENGTH),
    label: z.string().trim().min(1).max(FIELD_LABEL_MAX_LENGTH),
    type: fieldType,
    required: z.boolean().optional(),
    options: z
      .array(z.string().trim().min(1).max(FIELD_OPTION_MAX_LENGTH))
      .max(FIELD_OPTIONS_MAX)
      .optional(),
    unit: z.string().trim().max(FIELD_UNIT_MAX_LENGTH).optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict();

export const categoryFileSchema = z
  .object({
    name: z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH),
    fields: z.array(fieldFileSchema),
  })
  .strict();

const campaignFileSchema = z
  .object({
    name: z.string().trim().min(1).max(CAMPAIGN_NAME_MAX_LENGTH),
    scope: campaignScope,
    /** Con alcance CATEGORIES: el nombre de la categoría, que es única. */
    targetCategory: z.string().trim().min(1).optional(),
    /** Con alcance PRODUCTS: los códigos de barras, que son únicos. */
    targetBarcodes: z.array(z.string().trim().regex(/^\d{13}$/, 'El código debe tener 13 dígitos.')).optional(),
    discountType,
    /** Solo con discountType PERCENT. */
    discountPercent: percent.optional(),
    /** Solo con discountType FIXED, en soles por unidad. */
    discountAmount: soles.optional(),
    priority: z.number().int().optional(),
    startsAt: limaDate,
    endsAt: limaDate,
    active: z.boolean().optional(),
  })
  .strict();

/** El descuento se escribe en el formato que corresponde a su tipo, no en los dos. */
function checkCampaignDiscount(
  data: z.infer<typeof campaignFileSchema>,
  ctx: z.RefinementCtx,
): void {
  if (data.discountType === 'PERCENT') {
    if (data.discountPercent === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountPercent'],
        message: 'Una campaña en porcentaje necesita discountPercent.',
      });
    }

    if (data.discountAmount !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountAmount'],
        message: 'Una campaña en porcentaje no lleva discountAmount.',
      });
    }

    return;
  }

  if (data.discountAmount === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['discountAmount'],
      message: 'Una campaña de monto fijo necesita discountAmount en soles.',
    });
  }

  if (data.discountPercent !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['discountPercent'],
      message: 'Una campaña de monto fijo no lleva discountPercent.',
    });
  }
}

/** Producto de products.json con los precios en soles y los porcentajes normales (ARCHITECTURE.md §12). */
export const seedProductFileSchema = z
  .object({
    barcode: z.string({ invalid_type_error: 'El código de barras debe ser un texto de 13 dígitos.' }),
    name: z.string().trim().min(1),
    brand: z.string().trim().min(1),
    color: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1),
    originalPrice: soles,
    hasCmrDiscount: z.boolean().optional(),
    cmrDiscountPercent: percent.optional(),
    stock: z.number({ invalid_type_error: 'El stock debe ser un número entero.' }).int().min(0),
    maxPerPurchase: z.number().int().min(1).optional(),
    attributes: z.record(z.unknown()).optional(),
  })
  .strict();

export const categoriesFileSchema = z.array(categoryFileSchema);
export const campaignsFileSchema = z.array(campaignFileSchema.superRefine(checkCampaignDiscount));
export const productsFileSchema = z.array(seedProductFileSchema);

export type SeedCategoryFile = z.infer<typeof categoryFileSchema>;
export type SeedCampaignFile = z.infer<typeof campaignFileSchema>;
export type SeedProductFile = z.infer<typeof seedProductFileSchema>;
