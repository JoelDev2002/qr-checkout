import type { Request, Response } from 'express';
import { ApiError } from '../../middlewares/errorHandler.js';
import { loginSchema } from './schemas.js';
import { getCurrentUser, loginWithPassword } from './service.js';

export async function loginController(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(' ');
    throw new ApiError(400, 'VALIDATION_ERROR', message);
  }

  const result = await loginWithPassword(parsed.data.email, parsed.data.password);

  res.json({ data: result });
}

export async function meController(req: Request, res: Response): Promise<void> {
  const token = req.user;

  if (!token) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Se requiere autenticación.');
  }

  const userId = Number(token.sub);

  if (!Number.isInteger(userId)) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Token inválido o vencido.');
  }

  res.json({ data: await getCurrentUser(userId) });
}