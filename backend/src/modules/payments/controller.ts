import type { Request, Response } from 'express';
import type { ZodError, ZodIssue } from 'zod';
import type { MercadoPagoClient } from '../../infrastructure/mercadopago.js';
import { ApiError } from '../../middlewares/errorHandler.js';
import { onlinePaymentSchema } from './schemas.js';
import { processOnlinePayment } from './service.js';

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

/** El cliente que paga: el intento y la venta se guardan a su nombre (ARCHITECTURE.md §7). */
function actorUserId(req: Request): number {
  if (!req.user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Se requiere autenticación.');
  }

  return Number(req.user.sub);
}

export function createOnlinePaymentController(client: MercadoPagoClient | null) {
  return async function postOnlinePayment(req: Request, res: Response): Promise<void> {
    const input = parse(onlinePaymentSchema.safeParse(req.body));

    res.json({ data: await processOnlinePayment(input, actorUserId(req), client, new Date()) });
  };
}
