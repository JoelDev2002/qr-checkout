import type { NextFunction, Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { ApiError } from './errorHandler.js';

function rateLimited(_req: Request, _res: Response, next: NextFunction): void {
  next(
    new ApiError(
      429,
      'TOO_MANY_REQUESTS',
      'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    ),
  );
}

export function createRateLimiter(max: number, windowMs: number) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimited,
  });
}

/**
 * Límite por usuario autenticado y no por IP: en la tienda todos los cajeros salen por la misma
 * dirección, y lo que hay que limitar es la cantidad de códigos que un cajero puede probar (RN-05).
 * La IP solo se usa si la ruta se alcanzara sin sesión.
 */
export function createUserRateLimiter(max: number, windowMs: number) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.sub ?? ipKeyGenerator(req.ip ?? ''),
    handler: rateLimited,
  });
}
