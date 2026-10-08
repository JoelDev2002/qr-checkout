import { z } from 'zod';
import { parseLimaDate } from '../../domain/campaigns.js';
import { DASHBOARD_MAX_DAYS, daysInRange } from '../../domain/dashboard.js';

const limaDay = z
  .string({ invalid_type_error: 'La fecha debe ser un texto AAAA-MM-DD.' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD.')
  .refine((value) => parseLimaDate(value) !== null, 'La fecha no es un día válido.');

function addIssue(ctx: z.RefinementCtx, path: string, message: string): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
}

/** El rango se envía completo (from y to) o ninguno; to no antes de from; máximo DASHBOARD_MAX_DAYS. */
function checkRange(data: { from?: string; to?: string }, ctx: z.RefinementCtx): void {
  const hasFrom = data.from !== undefined;
  const hasTo = data.to !== undefined;

  if (hasFrom !== hasTo) {
    addIssue(ctx, 'from', 'El rango se envía completo: from y to juntos.');
    return;
  }

  if (data.from === undefined || data.to === undefined) {
    return;
  }

  if (data.to < data.from) {
    addIssue(ctx, 'to', 'La fecha final ("to") no puede ser anterior a la inicial ("from").');
    return;
  }

  // El campo puede retener el texto aunque ya lleve un issue (por ejemplo "15-06-2026"): no calcular
  // días sobre fechas inválidas, que lanzaría en vez de sumar el error a la validación.
  if (!parseLimaDate(data.from) || !parseLimaDate(data.to)) {
    return;
  }

  if (daysInRange(data.from, data.to) > DASHBOARD_MAX_DAYS) {
    addIssue(ctx, 'from', `El rango no puede exceder ${DASHBOARD_MAX_DAYS} días.`);
  }
}

export const dashboardSummaryQuerySchema = z
  .object({
    from: limaDay.optional(),
    to: limaDay.optional(),
    lowStockThreshold: z.coerce
      .number({ invalid_type_error: 'El umbral de stock debe ser un número.' })
      .int('El umbral de stock debe ser un número entero.')
      .min(0, 'El umbral de stock no puede ser negativo.')
      .default(3),
  })
  .strict()
  .superRefine(checkRange);

export type DashboardSummaryQuery = z.infer<typeof dashboardSummaryQuerySchema>;