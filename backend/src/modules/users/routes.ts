import { Router } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import {
  createCashierController,
  listCashiersController,
  setCashierActiveController,
} from './controller.js';

export function createUsersRouter(): Router {
  const router = Router();
  const onlyAdmin = requireRole('ADMIN');

  router.get('/', authenticate, onlyAdmin, asyncHandler(listCashiersController));
  router.post('/', authenticate, onlyAdmin, asyncHandler(createCashierController));
  router.patch('/:id/active', authenticate, onlyAdmin, asyncHandler(setCashierActiveController));

  return router;
}