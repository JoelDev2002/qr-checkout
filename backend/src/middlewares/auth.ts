import type { NextFunction, Request, Response } from 'express';
import { verifyAuthToken, type AuthTokenPayload } from '../infrastructure/jwt.js';
import { ApiError } from './errorHandler.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthTokenPayload;
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Se requiere autenticación.');
  }

  const token = header.slice('Bearer '.length).trim();

  if (!token) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Se requiere autenticación.');
  }

  try {
    const decoded = verifyAuthToken(token);
    req.user = decoded;
    next();
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Token inválido o vencido.');
  }
}

export function requireRole(...roles: Array<AuthTokenPayload['role']>): (
  req: Request,
  _res: Response,
  next: NextFunction,
) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Se requiere autenticación.');
    }

    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, 'FORBIDDEN', 'No tienes permisos para esta acción.');
    }

    next();
  };
}
