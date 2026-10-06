import { Prisma, type CampaignScope, type DiscountType, type PrismaClient } from '@prisma/client';
import type { AttributeValues, CategoryField } from '../domain/attributes.js';
import { fail } from './error.js';

export type CategoryPlan = {
  name: string;
  fields: CategoryField[];
};

export type ProductPlan = {
  barcode: string;
  name: string;
  brand: string;
  color: string | null;
  categoryName: string;
  originalPriceCents: number;
  hasCmrDiscount: boolean;
  cmrDiscountBps: number;
  attributes: AttributeValues;
  stock: number;
  maxPerPurchase: number;
};

export type CampaignPlan = {
  name: string;
  scope: CampaignScope;
  discountType: DiscountType;
  discountValue: number;
  priority: number;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  categoryNames: string[];
  barcodes: string[];
};

export type CategoriesResult = {
  ids: Map<string, number>;
  created: number;
  fieldsCreated: number;
};

export type ProductsResult = {
  idsByBarcode: Map<string, number>;
  created: number;
  skipped: number;
};

export type CampaignsResult = {
  created: number;
  updated: number;
};

export async function loadCategories(client: PrismaClient, plans: readonly CategoryPlan[]): Promise<CategoriesResult> {
  const ids = new Map<string, number>();
  let created = 0;
  let fieldsCreated = 0;

  for (const plan of plans) {
    const existing = await client.category.findUnique({ where: { name: plan.name }, select: { id: true } });
    const id = existing?.id ?? (await client.category.create({ data: { name: plan.name }, select: { id: true } })).id;

    ids.set(plan.name, id);

    if (!existing) {
      created += 1;
    }

    for (const field of plan.fields) {
      const yaExiste = await client.categoryField.findUnique({
        where: { categoryId_key: { categoryId: id, key: field.key } },
        select: { id: true },
      });

      // Un campo existente no se toca: si el admin lo desactivó, la semilla no lo vuelve a activar.
      if (yaExiste) {
        continue;
      }

      await client.categoryField.create({
        data: {
          categoryId: id,
          key: field.key,
          label: field.label,
          type: field.type,
          required: field.required,
          options: field.options === null ? Prisma.DbNull : [...field.options],
          unit: field.unit,
          sortOrder: field.sortOrder,
        },
      });

      fieldsCreated += 1;
    }
  }

  return { ids, created, fieldsCreated };
}

export async function loadProducts(
  client: PrismaClient,
  plans: readonly ProductPlan[],
  categoryIds: ReadonlyMap<string, number>,
): Promise<ProductsResult> {
  const idsByBarcode = new Map<string, number>();
  let created = 0;
  let skipped = 0;

  for (const plan of plans) {
    const categoryId = categoryIds.get(plan.categoryName);

    if (categoryId === undefined) {
      fail(`Producto "${plan.name}" (${plan.barcode}): la categoría "${plan.categoryName}" no se pudo cargar.`);
    }

    const existing = await client.product.findUnique({
      where: { barcode: plan.barcode },
      select: { id: true },
    });

    // Un producto que ya existe no se toca: su stock lo mueven las ventas y los ajustes, no la semilla.
    if (existing) {
      idsByBarcode.set(plan.barcode, existing.id);
      skipped += 1;
      continue;
    }

    const row = await client.product.create({
      data: {
        barcode: plan.barcode,
        name: plan.name,
        brand: plan.brand,
        color: plan.color,
        categoryId,
        originalPriceCents: plan.originalPriceCents,
        hasCmrDiscount: plan.hasCmrDiscount,
        cmrDiscountBps: plan.cmrDiscountBps,
        attributes: plan.attributes as Prisma.InputJsonValue,
        stock: plan.stock,
        maxPerPurchase: plan.maxPerPurchase,
      },
      select: { id: true },
    });

    idsByBarcode.set(plan.barcode, row.id);
    created += 1;
  }

  return { idsByBarcode, created, skipped };
}

export async function loadCampaigns(
  client: PrismaClient,
  plans: readonly CampaignPlan[],
  categoryIds: ReadonlyMap<string, number>,
  productIdsByBarcode: ReadonlyMap<string, number>,
): Promise<CampaignsResult> {
  let created = 0;
  let updated = 0;

  for (const plan of plans) {
    const productIds: number[] = [];

    for (const barcode of plan.barcodes) {
      const id = productIdsByBarcode.get(barcode);

      if (id === undefined) {
        fail(`Campaña "${plan.name}": el producto con el código ${barcode} no existe.`);
      }

      productIds.push(id);
    }

    const categoryIdList: number[] = [];

    for (const name of plan.categoryNames) {
      const id =
        categoryIds.get(name) ??
        (await client.category.findUnique({ where: { name }, select: { id: true } }))?.id;

      if (id === undefined) {
        fail(`Campaña "${plan.name}": la categoría "${name}" no existe.`);
      }

      categoryIdList.push(id);
    }

    const data = {
      name: plan.name,
      scope: plan.scope,
      discountType: plan.discountType,
      discountValue: plan.discountValue,
      priority: plan.priority,
      startsAt: plan.startsAt,
      endsAt: plan.endsAt,
      active: plan.active,
      products: { create: productIds.map((productId) => ({ productId })) },
      categories: { create: categoryIdList.map((categoryId) => ({ categoryId })) },
    };

    const existing = await client.campaign.findFirst({ where: { name: plan.name }, select: { id: true } });

    if (!existing) {
      await client.campaign.create({ data });
      created += 1;
      continue;
    }

    // El alcance se reemplaza por completo, igual que al editar una campaña desde la API.
    await client.$transaction([
      client.campaignProduct.deleteMany({ where: { campaignId: existing.id } }),
      client.campaignCategory.deleteMany({ where: { campaignId: existing.id } }),
      client.campaign.update({ where: { id: existing.id }, data }),
    ]);

    updated += 1;
  }

  return { created, updated };
}
