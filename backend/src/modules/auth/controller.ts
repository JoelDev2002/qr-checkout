import type { Request, Response } from 'express';
import type { GoogleIdTokenVerifier } from '../../infrastructure/googleAuth.js';
import { ApiError } from '../../middlewares/errorHandler.js';
import { devLoginSchema, googleLoginSchema, loginSchema } from './schemas.js';
import { devLogin, getCurrentUser, loginWithGoogle, loginWithPassword } from './service.js';

export async function loginController(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(' ');
    throw new ApiError(400, 'VALIDATION_ERROR', message);
  }

  const result = await loginWithPassword(parsed.data.email, parsed.data.password);

  res.json({ data: result });
}

export function createGoogleLoginController(verifier: GoogleIdTokenVerifier) {
  return async function googleLoginController(req: Request, res: Response): Promise<void> {
    const parsed = googleLoginSchema.safeParse(req.body);

    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join(' ');
      throw new ApiError(400, 'VALIDATION_ERROR', message);
    }

    const result = await loginWithGoogle(parsed.data.credential, { verifier });

    res.json({ data: result });
  };
}

export async function devLoginController(req: Request, res: Response): Promise<void> {
  const parsed = devLoginSchema.safeParse(req.body);

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(' ');
    throw new ApiError(400, 'VALIDATION_ERROR', message);
  }

  res.json({ data: await devLogin() });
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