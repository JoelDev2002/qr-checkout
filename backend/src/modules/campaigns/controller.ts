import type { Request, Response } from 'express';
import type { ZodError } from 'zod';
import { ApiError } from '../../middlewares/errorHandler.js';
import {
  campaignIdParamSchema,
  createCampaignSchema,
  setCampaignActiveSchema,
  updateCampaignSchema,
} from './schemas.js';
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  setCampaignActive,
  updateCampaign,
} from './service.js';

function parse<T>(result: { success: true; data: T } | { success: false; error: ZodError }): T {
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(' ');
    throw new ApiError(400, 'VALIDATION_ERROR', message);
  }

  return result.data;
}

export async function listCampaignsController(_req: Request, res: Response): Promise<void> {
  res.json({ data: await listCampaigns(new Date()) });
}

export async function getCampaignController(req: Request, res: Response): Promise<void> {
  const { id } = parse(campaignIdParamSchema.safeParse(req.params));

  res.json({ data: await getCampaign(id, new Date()) });
}

export async function createCampaignController(req: Request, res: Response): Promise<void> {
  const input = parse(createCampaignSchema.safeParse(req.body));

  res.json({ data: await createCampaign(input, new Date()) });
}

export async function updateCampaignController(req: Request, res: Response): Promise<void> {
  const { id } = parse(campaignIdParamSchema.safeParse(req.params));
  const input = parse(updateCampaignSchema.safeParse(req.body));

  res.json({ data: await updateCampaign(id, input, new Date()) });
}

export async function setCampaignActiveController(req: Request, res: Response): Promise<void> {
  const { id } = parse(campaignIdParamSchema.safeParse(req.params));
  const { active } = parse(setCampaignActiveSchema.safeParse(req.body));

  res.json({ data: await setCampaignActive(id, active, new Date()) });
}
