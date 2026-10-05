import { Router } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { authenticate } from '../../middlewares/auth.js';
import { createRateLimiter } from '../../middlewares/rateLimit.js';
import { loginController, meController } from './controller.js';

export const LOGIN_RATE_LIMIT_MAX = 10;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export function createAuthRouter(): Router {
  const router = Router();
  const loginLimiter = createRateLimiter(LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS);

  router.post('/login', loginLimiter, asyncHandler(loginController));
  router.get('/me', authenticate, asyncHandler(meController));

  return router;
}