import type { Request, Response } from 'express';
import type { ZodError, ZodIssue } from 'zod';
import { ApiError } from '../../middlewares/errorHandler.js';
import { cartCodeParamSchema } from './schemas.js';
import { getCheckoutPreview, rejectCheckout } from './service.js';

/** Los esquemas son estrictos: una clave desconocida se explica en español y no en el idioma de Zod. */
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

export async function getCheckoutController(req: Request, res: Response): Promise<void> {
  const { code } = parse(cartCodeParamSchema.safeParse(req.params));

  res.json({ data: await getCheckoutPreview(code, new Date()) });
}

export async function rejectCheckoutController(req: Request, res: Response): Promise<void> {
  const { code } = parse(cartCodeParamSchema.safeParse(req.params));

  res.json({ data: await rejectCheckout(code, new Date()) });
}
