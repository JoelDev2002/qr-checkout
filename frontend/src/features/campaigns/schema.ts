import { z } from 'zod';
import { parsePercentToBps, parseSolesToCents } from '../../lib/campaignValues';

export const CAMPAIGN_NAME_MAX_LENGTH = 100;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Rechaza días que el calendario no tiene, como el 30 de febrero. */
function isRealLimaDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);

  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const campaignName = z
  .string({ required_error: 'El nombre de la campaña es obligatorio.' })
  .trim()
  .min(1, 'El nombre de la campaña no puede estar vacío.')
  .max(
    CAMPAIGN_NAME_MAX_LENGTH,
    `El nombre no puede tener más de ${CAMPAIGN_NAME_MAX_LENGTH} caracteres.`,
  );

const limaDate = z
  .string({ required_error: 'Indica la fecha en formato AAAA-MM-DD.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD.')
  .refine(isRealLimaDate, 'Esa fecha no existe.');

export const campaignFormSchema = z
  .object({
    name: campaignName,
    scope: z.enum(['PRODUCTS', 'CATEGORIES', 'STORE'], {
      errorMap: () => ({ message: 'El alcance debe ser Productos concretos, Categorías o Toda la tienda.' }),
    }),
    discountType: z.enum(['PERCENT', 'FIXED'], {
      errorMap: () => ({ message: 'El tipo de descuento debe ser Porcentaje o Monto fijo.' }),
    }),
    /** Texto que escribe el admin: lo convierte buildCampaignBody según el tipo. */
    discountValue: z.string({ required_error: 'Escribe el valor del descuento.' }),
    priority: z.string({ required_error: 'Escribe la prioridad de la campaña.' }),
    startsAt: limaDate,
    endsAt: limaDate,
    active: z.boolean({ invalid_type_error: 'Indica si la campaña queda activa.' }),
    productIds: z.array(z.number().int().positive()),
    categoryIds: z.array(z.number().int().positive()),
  })
  .superRefine((form, ctx) => {
    function addIssue(path: 'discountValue' | 'priority' | 'productIds' | 'categoryIds' | 'endsAt', message: string): void {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    }

    if (typeof form.discountValue === 'string') {
      const result =
        form.discountType === 'PERCENT'
          ? parsePercentToBps(form.discountValue)
          : parseSolesToCents(form.discountValue);

      if (!result.ok) {
        addIssue('discountValue', result.message);
      }
    }

    if (typeof form.priority === 'string' && !/^-?\d{1,9}$/.test(form.priority.trim())) {
      addIssue('priority', 'La prioridad debe ser un número entero.');
    }

    if (form.scope === 'PRODUCTS' && (form.productIds ?? []).length === 0) {
      addIssue('productIds', 'Elige al menos un producto para una campaña de productos.');
    }

    if (form.scope === 'CATEGORIES' && (form.categoryIds ?? []).length === 0) {
      addIssue('categoryIds', 'Elige al menos una categoría para una campaña de categorías.');
    }

    if (
      typeof form.startsAt === 'string' &&
      typeof form.endsAt === 'string' &&
      isRealLimaDate(form.startsAt) &&
      isRealLimaDate(form.endsAt) &&
      form.endsAt < form.startsAt
    ) {
      addIssue('endsAt', 'La fecha final no puede ser anterior a la inicial.');
    }
  });

export type CampaignFormValues = z.infer<typeof campaignFormSchema>;
