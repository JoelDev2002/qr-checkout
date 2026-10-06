import { z } from 'zod';

export const PURCHASES_DEFAULT_PAGE = 1;
export const PURCHASES_DEFAULT_PAGE_SIZE = 20;
export const PURCHASES_MAX_PAGE_SIZE = 100;

export const purchasesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(PURCHASES_MAX_PAGE_SIZE).optional(),
  })
  .strict();

export const purchaseDetailParamsSchema = z
  .object({
    saleId: z.coerce.number().int().positive(),
  })
  .strict();

export type PurchasesQuery = z.infer<typeof purchasesQuerySchema>;
export type PurchaseDetailParams = z.infer<typeof purchaseDetailParamsSchema>;
