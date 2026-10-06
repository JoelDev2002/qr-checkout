import { Router } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import {
  getPurchaseDetailController,
  getPurchasesController,
} from './controller.js';

export function createPurchasesRouter(): Router {
  const router = Router();
  const onlyCustomer = requireRole('CUSTOMER');

  router.get('/', authenticate, onlyCustomer, asyncHandler(getPurchasesController));
  router.get('/:saleId', authenticate, onlyCustomer, asyncHandler(getPurchaseDetailController));

  return router;
}
