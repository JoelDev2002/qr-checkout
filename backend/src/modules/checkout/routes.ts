import { Router } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { getSalesTodayController } from './controller.js';

export const CHECKOUT_RATE_LIMIT_MAX = 60;
export const CHECKOUT_RATE_LIMIT_WINDOW_MS = 60 * 1000;

export function createCheckoutRouter(): Router {
  const router = Router();
  const onlyCashier = requireRole('CASHIER');

  router.get('/sales/today', authenticate, onlyCashier, asyncHandler(getSalesTodayController));
  return router;
}
