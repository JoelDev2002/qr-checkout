import { Router } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { getDashboardSummaryController } from './controller.js';

export function createDashboardRouter(): Router {
  const router = Router();
  const onlyAdmin = requireRole('ADMIN');

  router.get('/summary', authenticate, onlyAdmin, asyncHandler(getDashboardSummaryController));

  return router;
}