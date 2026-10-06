import { Router } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import {
  addItemController,
  clearCartController,
  getCartController,
  removeItemController,
  setItemQuantityController,
} from './controller.js';

/** El carrito pertenece al cliente del token; cajero y admin no lo ven ni lo editan (RN-14). */
export function createCartsRouter(): Router {
  const router = Router();
  const onlyCustomer = requireRole('CUSTOMER');

  router.get('/', authenticate, onlyCustomer, asyncHandler(getCartController));
  router.post('/items', authenticate, onlyCustomer, asyncHandler(addItemController));
  router.delete('/items', authenticate, onlyCustomer, asyncHandler(clearCartController));
  router.patch('/items/:productId', authenticate, onlyCustomer, asyncHandler(setItemQuantityController));
  router.delete('/items/:productId', authenticate, onlyCustomer, asyncHandler(removeItemController));

  return router;
}
