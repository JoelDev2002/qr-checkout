import { Router } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import {
  createProductController,
  getProductByBarcodeController,
  getProductController,
  listProductsController,
  previewPriceController,
  setProductActiveController,
  updateProductController,
} from './controller.js';

export function createProductsRouter(): Router {
  const router = Router();
  const onlyAdmin = requireRole('ADMIN');

  // El escaneo del cliente va antes de /:id para que el código nunca se interprete como un id.
  router.get('/barcode/:barcode', authenticate, asyncHandler(getProductByBarcodeController));
  router.post('/price-preview', authenticate, onlyAdmin, asyncHandler(previewPriceController));

  router.get('/', authenticate, onlyAdmin, asyncHandler(listProductsController));
  router.post('/', authenticate, onlyAdmin, asyncHandler(createProductController));
  router.get('/:id', authenticate, onlyAdmin, asyncHandler(getProductController));
  router.put('/:id', authenticate, onlyAdmin, asyncHandler(updateProductController));
  router.patch('/:id/active', authenticate, onlyAdmin, asyncHandler(setProductActiveController));

  return router;
}