import { Router } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import {
  createProductController,
  getProductController,
  listProductsController,
  setProductActiveController,
  updateProductController,
} from './controller.js';

export function createProductsRouter(): Router {
  const router = Router();
  const onlyAdmin = requireRole('ADMIN');

  router.get('/', authenticate, onlyAdmin, asyncHandler(listProductsController));
  router.post('/', authenticate, onlyAdmin, asyncHandler(createProductController));
  router.get('/:id', authenticate, onlyAdmin, asyncHandler(getProductController));
  router.put('/:id', authenticate, onlyAdmin, asyncHandler(updateProductController));
  router.patch('/:id/active', authenticate, onlyAdmin, asyncHandler(setProductActiveController));

  return router;
}