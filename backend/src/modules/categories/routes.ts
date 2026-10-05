import { Router } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import {
  createCategoryController,
  createFieldController,
  listCategoriesController,
  setCategoryActiveController,
  setFieldActiveController,
  updateCategoryController,
  updateFieldController,
} from './controller.js';

export function createCategoriesRouter(): Router {
  const router = Router();
  const onlyAdmin = requireRole('ADMIN');

  router.get('/', authenticate, asyncHandler(listCategoriesController));

  router.post('/', authenticate, onlyAdmin, asyncHandler(createCategoryController));
  router.put('/:id', authenticate, onlyAdmin, asyncHandler(updateCategoryController));
  router.patch('/:id/active', authenticate, onlyAdmin, asyncHandler(setCategoryActiveController));

  router.post('/:id/fields', authenticate, onlyAdmin, asyncHandler(createFieldController));
  router.put('/:id/fields/:fieldId', authenticate, onlyAdmin, asyncHandler(updateFieldController));
  router.patch(
    '/:id/fields/:fieldId/active',
    authenticate,
    onlyAdmin,
    asyncHandler(setFieldActiveController),
  );

  return router;
}