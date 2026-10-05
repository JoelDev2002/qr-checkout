import { Router } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import {
  createCampaignController,
  getCampaignController,
  listCampaignsController,
  setCampaignActiveController,
  updateCampaignController,
} from './controller.js';

export function createCampaignsRouter(): Router {
  const router = Router();
  const onlyAdmin = requireRole('ADMIN');

  router.get('/', authenticate, onlyAdmin, asyncHandler(listCampaignsController));
  router.post('/', authenticate, onlyAdmin, asyncHandler(createCampaignController));
  router.get('/:id', authenticate, onlyAdmin, asyncHandler(getCampaignController));
  router.put('/:id', authenticate, onlyAdmin, asyncHandler(updateCampaignController));
  router.patch('/:id/active', authenticate, onlyAdmin, asyncHandler(setCampaignActiveController));

  return router;
}
