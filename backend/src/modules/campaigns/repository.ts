import { Prisma, type CampaignScope, type DiscountType } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma.js';
import type { Campaign } from '../../domain/pricing.js';

export type CampaignRecord = {
  id: number;
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

export type SaveCampaignData = {
  name: string;
  scope: CampaignScope;
  discountType: DiscountType;
  discountValue: number;
  priority: number;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  productIds: readonly number[];
  categoryIds: readonly number[];
};

const campaignSelect = {
  id: true,
  name: true,
  scope: true,
  discountType: true,
  discountValue: true,
  priority: true,
  startsAt: true,
  endsAt: true,
  active: true,
  products: { select: { productId: true }, orderBy: { productId: 'asc' } },
  categories: { select: { categoryId: true }, orderBy: { categoryId: 'asc' } },
} satisfies Prisma.CampaignSelect;

type CampaignRow = {
  id: number;
  name: string;
  scope: CampaignScope;
  discountType: DiscountType;
  discountValue: number;
  priority: number;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  products: Array<{ productId: number }>;
  categories: Array<{ categoryId: number }>;
};

function toRecord(row: CampaignRow): CampaignRecord {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    discountType: row.discountType,
    discountValue: row.discountValue,
    priority: row.priority,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    active: row.active,
    productIds: row.products.map((product) => product.productId),
    categoryIds: row.categories.map((category) => category.categoryId),
  };
}

/** Productos activos que alcanza la campaña, según su alcance. */
function affectedWhere(campaign: CampaignRecord): Prisma.ProductWhereInput {
  if (campaign.scope === 'STORE') {
    return { active: true };
  }

  if (campaign.scope === 'CATEGORIES') {
    return { active: true, categoryId: { in: [...campaign.categoryIds] } };
  }

  return { active: true, id: { in: [...campaign.productIds] } };
}

export async function listCampaigns(): Promise<CampaignRecord[]> {
  const rows = await prisma.campaign.findMany({
    select: campaignSelect,
    orderBy: [{ priority: 'desc' }, { id: 'asc' }],
  });

  return rows.map(toRecord);
}

export async function findCampaignById(id: number): Promise<CampaignRecord | null> {
  const row = await prisma.campaign.findUnique({ where: { id }, select: campaignSelect });

  return row ? toRecord(row) : null;
}

export async function createCampaign(data: SaveCampaignData): Promise<CampaignRecord> {
  const row = await prisma.campaign.create({
    data: {
      name: data.name,
      scope: data.scope,
      discountType: data.discountType,
      discountValue: data.discountValue,
      priority: data.priority,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      active: data.active,
      products: { create: data.productIds.map((productId) => ({ productId })) },
      categories: { create: data.categoryIds.map((categoryId) => ({ categoryId })) },
    },
    select: campaignSelect,
  });

  return toRecord(row);
}

export async function updateCampaign(id: number, data: SaveCampaignData): Promise<CampaignRecord> {
  // El alcance se reemplaza por completo, así que los destinos anteriores se borran primero.
  await prisma.$transaction([
    prisma.campaignProduct.deleteMany({ where: { campaignId: id } }),
    prisma.campaignCategory.deleteMany({ where: { campaignId: id } }),
    prisma.campaign.update({
      where: { id },
      data: {
        name: data.name,
        scope: data.scope,
        discountType: data.discountType,
        discountValue: data.discountValue,
        priority: data.priority,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        active: data.active,
        products: { create: data.productIds.map((productId) => ({ productId })) },
        categories: { create: data.categoryIds.map((categoryId) => ({ categoryId })) },
      },
    }),
  ]);

  const row = await findCampaignById(id);

  if (!row) {
    throw new Error(`La campaña ${id} se actualizó pero ya no existe.`);
  }

  return row;
}

export async function setCampaignActive(id: number, active: boolean): Promise<CampaignRecord> {
  const row = await prisma.campaign.update({ where: { id }, data: { active }, select: campaignSelect });

  return toRecord(row);
}

export async function countAffectedProducts(campaign: CampaignRecord): Promise<number> {
  return prisma.product.count({ where: affectedWhere(campaign) });
}

export async function findExistingProductIds(ids: readonly number[]): Promise<number[]> {
  if (ids.length === 0) {
    return [];
  }

  const rows = await prisma.product.findMany({ where: { id: { in: [...ids] } }, select: { id: true } });

  return rows.map((row) => row.id);
}

export async function findExistingCategoryIds(ids: readonly number[]): Promise<number[]> {
  if (ids.length === 0) {
    return [];
  }

  const rows = await prisma.category.findMany({ where: { id: { in: [...ids] } }, select: { id: true } });

  return rows.map((row) => row.id);
}

/**
 * Campañas activas y en fecha, con sus destinos, en la forma que espera resolvePrices.
 * Es el único lugar donde se consultan campañas para calcular precios.
 */
export async function findActive(now: Date): Promise<Campaign[]> {
  const rows = await prisma.campaign.findMany({
    where: { active: true, startsAt: { lte: now }, endsAt: { gte: now } },
    select: campaignSelect,
    orderBy: [{ priority: 'desc' }, { id: 'desc' }],
  });

  return rows.map(toRecord);
}
