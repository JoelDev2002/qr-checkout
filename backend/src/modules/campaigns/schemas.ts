import { z } from 'zod';
import { parseLimaDate } from '../../domain/campaigns.js';

export const CAMPAIGN_NAME_MAX_LENGTH = 100;
export const CAMPAIGN_TARGETS_MAX = 500;
export const MAX_PERCENT_BPS = 9000;

const campaignName = z
  .string({ required_error: 'El nombre de la campaña es obligatorio.' })
  .trim()
  .min(1, 'El nombre de la campaña no puede estar vacío.')
  .max(
    CAMPAIGN_NAME_MAX_LENGTH,
    `El nombre no puede tener más de ${CAMPAIGN_NAME_MAX_LENGTH} caracteres.`,
  );

const campaignScope = z.enum(['PRODUCTS', 'CATEGORIES', 'STORE'], {
  errorMap: () => ({ message: 'El alcance debe ser PRODUCTS, CATEGORIES o STORE.' }),
});

const discountType = z.enum(['PERCENT', 'FIXED'], {
  errorMap: () => ({ message: 'El tipo de descuento debe ser PERCENT o FIXED.' }),
});

const limaDate = z
  .string({ required_error: 'Indica la fecha en formato AAAA-MM-DD.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD.')
  .refine((value) => parseLimaDate(value) !== null, 'Esa fecha no existe.');

const discountValue = z
  .number({ invalid_type_error: 'El valor del descuento debe ser un número entero.' })
  .int('El valor del descuento debe ser un número entero.');

const priority = z
  .number({ invalid_type_error: 'La prioridad debe ser un número entero.' })
  .int('La prioridad debe ser un número entero.');

/** Los ids repetidos no se guardan dos veces. */
const targetIds = z
  .array(
    z
      .number({ invalid_type_error: 'Cada identificador debe ser un número.' })
      .int('Cada identificador debe ser un número entero.')
      .positive('Cada identificador debe ser mayor que cero.'),
  )
  .max(CAMPAIGN_TARGETS_MAX, `Una campaña puede tener hasta ${CAMPAIGN_TARGETS_MAX} destinos.`)
  .transform((ids) => [...new Set(ids)])
  .optional();

const campaignObjectSchema = z.object({
  name: campaignName,
  scope: campaignScope,
  discountType: discountType,
  discountValue,
  priority: priority.optional(),
  startsAt: limaDate,
  endsAt: limaDate,
  active: z.boolean().optional(),
  productIds: targetIds,
  categoryIds: targetIds,
});

export type CampaignInput = z.infer<typeof campaignObjectSchema>;

function addIssue(ctx: z.RefinementCtx, path: string, message: string): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
}

function checkDiscountValue(data: CampaignInput, ctx: z.RefinementCtx): void {
  if (data.discountType === 'PERCENT') {
    if (data.discountValue <= 0 || data.discountValue > MAX_PERCENT_BPS) {
      addIssue(
        ctx,
        'discountValue',
        `El descuento en porcentaje va de 1 a ${MAX_PERCENT_BPS} puntos básicos (hasta 90 %).`,
      );
    }

    return;
  }

  if (data.discountValue <= 0) {
    addIssue(ctx, 'discountValue', 'El monto fijo debe ser mayor que cero, en céntimos.');
  }
}

function checkDates(data: CampaignInput, ctx: z.RefinementCtx): void {
  if (data.endsAt < data.startsAt) {
    addIssue(ctx, 'endsAt', 'La fecha final no puede ser anterior a la inicial.');
  }
}

function checkScope(data: CampaignInput, ctx: z.RefinementCtx): void {
  const products = data.productIds ?? [];
  const categories = data.categoryIds ?? [];

  if (data.scope === 'PRODUCTS') {
    if (products.length === 0) {
      addIssue(ctx, 'productIds', 'Elige al menos un producto para una campaña de productos.');
    }

    if (categories.length > 0) {
      addIssue(ctx, 'categoryIds', 'Una campaña de productos no lleva categorías.');
    }

    return;
  }

  if (data.scope === 'CATEGORIES') {
    if (categories.length === 0) {
      addIssue(ctx, 'categoryIds', 'Elige al menos una categoría para una campaña de categorías.');
    }

    if (products.length > 0) {
      addIssue(ctx, 'productIds', 'Una campaña de categorías no lleva productos.');
    }

    return;
  }

  if (products.length > 0 || categories.length > 0) {
    addIssue(ctx, 'scope', 'Una campaña de toda la tienda no lleva productos ni categorías.');
  }
}

export const createCampaignSchema = campaignObjectSchema.superRefine((data, ctx) => {
  checkDiscountValue(data, ctx);
  checkDates(data, ctx);
  checkScope(data, ctx);
});

export const updateCampaignSchema = createCampaignSchema;

export const setCampaignActiveSchema = z.object({
  active: z.boolean({ invalid_type_error: 'Indica si la campaña queda activa.' }),
});

export const campaignIdParamSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: 'El identificador debe ser un número.' })
    .int('El identificador debe ser un número entero.')
    .positive('El identificador debe ser mayor que cero.'),
});
