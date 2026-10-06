import type { Request, Response } from 'express';
import type { ZodError, ZodIssue } from 'zod';
import { ApiError } from '../../middlewares/errorHandler.js';
import {
  purchaseDetailParamsSchema,
  purchasesQuerySchema,
} from './schemas.js';
import {
  getCustomerPurchase,
  getCustomerPurchases,
} from './service.js';

function describeIssue(issue: ZodIssue): string {
  if (issue.code === 'unrecognized_keys') {
    return `Estos campos no se permiten aquí: ${issue.keys.join(', ')}.`;
  }
  return issue.message;
}

function parse<T>(result: { success: true; data: T } | { success: false; error: ZodError }): T {
  if (!result.success) {
    const message = result.error.issues.map(describeIssue).join(' ');
    throw new ApiError(400, 'VALIDATION_ERROR', message);
  }
  return result.data;
}

function customerId(req: Request): number {
  if (!req.user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Se requiere autenticación.');
  }
  return Number(req.user.sub);
}

export async function getPurchasesController(req: Request, res: Response): Promise<void> {
  const query = parse(purchasesQuerySchema.safeParse(req.query));
  const result = await getCustomerPurchases(customerId(req), query);
  res.json({ data: result });
}

export async function getPurchaseDetailController(req: Request, res: Response): Promise<void> {
  const { saleId } = parse(purchaseDetailParamsSchema.safeParse(req.params));
  const result = await getCustomerPurchase(customerId(req), saleId);
  res.json({ data: result });
}
