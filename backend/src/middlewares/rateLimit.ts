import rateLimit from 'express-rate-limit';
import { ApiError } from './errorHandler.js';

export function createRateLimiter(max: number, windowMs: number) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(
        new ApiError(
          429,
          'TOO_MANY_REQUESTS',
          'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
        ),
      );
    },
  });
}