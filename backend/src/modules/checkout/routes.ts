import { Router } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { createUserRateLimiter } from '../../middlewares/rateLimit.js';
import {
  confirmCheckoutController,
  getCheckoutController,
  rejectCheckoutController,
  getSalesTodayController,
  verifyExitController,
} from './controller.js';

export const CHECKOUT_RATE_LIMIT_MAX = 60;
export const CHECKOUT_RATE_LIMIT_WINDOW_MS = 60 * 1000;

/** Solo el cajero cobra; el cliente y el admin no ven la caja (RN-14). */
export function createCheckoutRouter(): Router {
  const router = Router();
  const onlyCashier = requireRole('CASHIER');
  // El límite va después del rol para que solo los cajeros gasten su cuota (ARCHITECTURE.md §7).
  const attemptLimiter = createUserRateLimiter(CHECKOUT_RATE_LIMIT_MAX, CHECKOUT_RATE_LIMIT_WINDOW_MS);

  router.get('/sales/today', authenticate, onlyCashier, asyncHandler(getSalesTodayController));
  router.post('/exit/:code/verify', authenticate, onlyCashier, attemptLimiter, asyncHandler(verifyExitController));
  router.get('/:code', authenticate, onlyCashier, attemptLimiter, asyncHandler(getCheckoutController));
  router.post('/:code/confirm', authenticate, onlyCashier, attemptLimiter, asyncHandler(confirmCheckoutController));
  router.post('/:code/reject', authenticate, onlyCashier, attemptLimiter, asyncHandler(rejectCheckoutController));

  return router;
}
