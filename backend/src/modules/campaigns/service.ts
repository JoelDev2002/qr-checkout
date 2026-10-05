import type { CampaignScope, DiscountType } from '@prisma/client';
import { campaignStatus, formatLimaDate, limaDayToPeriod, type CampaignStatus } from '../../domain/campaigns.js';
import { ApiError } from '../../middlewares/errorHandler.js';
import {
  countAffectedProducts,
  createCampaign as createCampaignRecord,
  findCampaignById,
  findExistingCategoryIds,
  findExistingProductIds,
  listCampaigns as listCampaignRecords,
  setCampaignActive as setCampaignActiveRecord,
  updateCampaign as updateCampaignRecord,
  type CampaignRecord,
} from './repository.js';
import type { CampaignInput } from './schemas.js';

export type CampaignView = {
  id: number;
  name: string;
  scope: CampaignScope;
  discountType: DiscountType;
  discountValue: number;
  priority: number;
  /** Instantes guardados, en UTC. */
  startsAt: string;
  endsAt: string;
  /** Días de Lima que escribe el admin, listos para el formulario. */
  startDate: string;
  endDate: string;
  active: boolean;
  status: CampaignStatus;
  affectedProducts: number;
  productIds: number[];
  categoryIds: number[];
};

type PreparedCampaign = {
  name: string;
  scope: CampaignScope;
  discountType: DiscountType;
  discountValue: number;
  priority: number;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  productIds: number[];
  categoryIds: number[];
};

const CAMPAIGN_NOT_FOUND_MESSAGE = 'La campaña no existe.';
const MISSING_PRODUCTS_MESSAGE = 'Uno o más productos no existen.';
const MISSING_CATEGORIES_MESSAGE = 'Una o más categorías no existen.';

/** Los espacios sobrantes no se guardan: ni al principio ni al final ni entre palabras. */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

async function toView(campaign: CampaignRecord, now: Date): Promise<CampaignView> {
  return {
    id: campaign.id,
    name: campaign.name,
    scope: campaign.scope,
    discountType: campaign.discountType,
    discountValue: campaign.discountValue,
    priority: campaign.priority,
    startsAt: campaign.startsAt.toISOString(),
    endsAt: campaign.endsAt.toISOString(),
    startDate: formatLimaDate(campaign.startsAt),
    endDate: formatLimaDate(campaign.endsAt),
    active: campaign.active,
    status: campaignStatus(campaign, now),
    affectedProducts: await countAffectedProducts(campaign),
    productIds: campaign.productIds,
    categoryIds: campaign.categoryIds,
  };
}

async function requireCampaign(id: number): Promise<CampaignRecord> {
  const campaign = await findCampaignById(id);

  if (!campaign) {
    throw new ApiError(404, 'NOT_FOUND', CAMPAIGN_NOT_FOUND_MESSAGE);
  }

  return campaign;
}

async function assertTargetsExist(input: CampaignInput): Promise<void> {
  const productIds = input.productIds ?? [];
  const categoryIds = input.categoryIds ?? [];

  if (productIds.length > 0) {
    const existentes = new Set(await findExistingProductIds(productIds));

    if (existentes.size !== productIds.length) {
      throw new ApiError(400, 'VALIDATION_ERROR', MISSING_PRODUCTS_MESSAGE);
    }
  }

  if (categoryIds.length > 0) {
    const existentes = new Set(await findExistingCategoryIds(categoryIds));

    if (existentes.size !== categoryIds.length) {
      throw new ApiError(400, 'VALIDATION_ERROR', MISSING_CATEGORIES_MESSAGE);
    }
  }
}

/** Convierte las fechas de Lima que envía el admin al intervalo guardado en UTC. */
function prepare(input: CampaignInput): PreparedCampaign {
  const period = limaDayToPeriod(input.startsAt);
  const endPeriod = limaDayToPeriod(input.endsAt);

  if (!period || !endPeriod) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Alguna de las fechas no existe.');
  }

  return {
    name: normalizeName(input.name),
    scope: input.scope,
    discountType: input.discountType,
    discountValue: input.discountValue,
    priority: input.priority ?? 0,
    startsAt: period.startsAt,
    endsAt: endPeriod.endsAt,
    active: input.active ?? true,
    productIds: input.productIds ?? [],
    categoryIds: input.categoryIds ?? [],
  };
}

export async function listCampaigns(now: Date): Promise<CampaignView[]> {
  const campaigns = await listCampaignRecords();

  return Promise.all(campaigns.map((campaign) => toView(campaign, now)));
}

export async function getCampaign(id: number, now: Date): Promise<CampaignView> {
  return toView(await requireCampaign(id), now);
}

export async function createCampaign(input: CampaignInput, now: Date): Promise<CampaignView> {
  await assertTargetsExist(input);

  const campaign = await createCampaignRecord(prepare(input));

  return toView(campaign, now);
}

export async function updateCampaign(
  id: number,
  input: CampaignInput,
  now: Date,
): Promise<CampaignView> {
  await requireCampaign(id);
  await assertTargetsExist(input);

  const campaign = await updateCampaignRecord(id, prepare(input));

  return toView(campaign, now);
}

export async function setCampaignActive(
  id: number,
  active: boolean,
  now: Date,
): Promise<CampaignView> {
  await requireCampaign(id);

  return toView(await setCampaignActiveRecord(id, active), now);
}
