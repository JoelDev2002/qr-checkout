import { Router } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import {
  createSupplierController,
  getSupplierController,
  listSuppliersController,
  setSupplierActiveController,
  updateSupplierController,
} from './controller.js';

/** Por ahora solo el admin. Cuando exista el rol de compras (T4.2) se agrega aquí. */
export function createSuppliersRouter(): Router {
  const router = Router();
  const allowed = requireRole('ADMIN');

  router.get('/', authenticate, allowed, asyncHandler(listSuppliersController));
  router.get('/:id', authenticate, allowed, asyncHandler(getSupplierController));
  router.post('/', authenticate, allowed, asyncHandler(createSupplierController));
  router.put('/:id', authenticate, allowed, asyncHandler(updateSupplierController));
  router.patch('/:id/active', authenticate, allowed, asyncHandler(setSupplierActiveController));

  return router;
}
