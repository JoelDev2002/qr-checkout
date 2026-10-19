import type { Request, Response } from 'express';
import type { ZodError, ZodIssue } from 'zod';
import { ApiError } from '../../middlewares/errorHandler.js';
import { cartCodeParamSchema, confirmCheckoutSchema, exitCodeParamSchema } from './schemas.js';
import {
  confirmCheckout,
  getCheckoutPreview,
  rejectCheckout,
  getSalesToday,
  verifyExit,
} from './service.js';

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

/** El cajero que cobra: el pago se guarda a su nombre (ARCHITECTURE.md §7). */
function actorUserId(req: Request): number {
  if (!req.user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Se requiere autenticación.');
  }

  return Number(req.user.sub);
}

export async function getCheckoutController(req: Request, res: Response): Promise<void> {
  const { code } = parse(cartCodeParamSchema.safeParse(req.params));

  res.json({ data: await getCheckoutPreview(code, new Date()) });
}

export async function confirmCheckoutController(req: Request, res: Response): Promise<void> {
  const { code } = parse(cartCodeParamSchema.safeParse(req.params));
  const input = parse(confirmCheckoutSchema.safeParse(req.body));

  res.json({ data: await confirmCheckout(code, input, actorUserId(req), new Date()) });
}

export async function rejectCheckoutController(req: Request, res: Response): Promise<void> {
  const { code } = parse(cartCodeParamSchema.safeParse(req.params));

  res.json({ data: await rejectCheckout(code, new Date()) });
}

export async function getSalesTodayController(req: Request, res: Response): Promise<void> {
  const result = await getSalesToday(actorUserId(req), new Date());
  res.json({ data: result });
}

export async function verifyExitController(req: Request, res: Response): Promise<void> {
  const { code } = parse(exitCodeParamSchema.safeParse(req.params));

  res.json({ data: await verifyExit(code, new Date()) });
}
