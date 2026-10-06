import type { Request, Response } from 'express';
import type { ZodError, ZodIssue } from 'zod';
import { ApiError } from '../../middlewares/errorHandler.js';
import {
  createCashierSchema,
  listCashiersQuerySchema,
  setCashierActiveSchema,
  userIdParamSchema,
} from './schemas.js';
import { createCashier, listCashiers, setCashierActive } from './service.js';

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

export async function listCashiersController(req: Request, res: Response): Promise<void> {
  const query = parse(listCashiersQuerySchema.safeParse(req.query));

  res.json({ data: await listCashiers(query) });
}

export async function createCashierController(req: Request, res: Response): Promise<void> {
  const input = parse(createCashierSchema.safeParse(req.body));

  res.json({ data: await createCashier(input) });
}

export async function setCashierActiveController(req: Request, res: Response): Promise<void> {
  const { id } = parse(userIdParamSchema.safeParse(req.params));
  const { active } = parse(setCashierActiveSchema.safeParse(req.body));

  res.json({ data: await setCashierActive(id, active) });
}