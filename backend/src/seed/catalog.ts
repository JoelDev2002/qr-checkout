import type { CampaignScope, PrismaClient } from '@prisma/client';
import type { z } from 'zod';
import { validateAttributes, validateFieldDefinition, type CategoryField } from '../domain/attributes.js';
import { limaDayToPeriod } from '../domain/campaigns.js';
import { createCampaignSchema } from '../modules/campaigns/schemas.js';
import { createProductSchema, DEFAULT_MAX_PER_PURCHASE } from '../modules/products/schemas.js';
import { fail } from './error.js';
import {
  categoriesFileSchema,
  campaignsFileSchema,
  discountValueOf,
  percentToBps,
  productsFileSchema,
  solesToCents,
  type SeedCampaignFile,
  type SeedCategoryFile,
  type SeedCatalogInput,
  type SeedProductFile,
} from './schemas.js';
import {
  loadCampaigns,
  loadCategories,
  loadProducts,
  type CampaignPlan,
  type CategoryPlan,
  type ProductPlan,
} from './writers.js';

/**
 * Los ids solo se validan como números positivos: la categoría y los productos de una campaña se
 * resuelven por nombre y por código de barras, que es como los escriben los archivos.
 */
const PLACEHOLDER_ID = 1;

export { SeedCatalogError } from './error.js';

export type CatalogSummary = {
  categoriesCreated: number;
  fieldsCreated: number;
  campaignsCreated: number;
  campaignsUpdated: number;
  productsCreated: number;
  productsSkipped: number;
};

function describeIssues(
  error: z.ZodError,
  etiqueta?: (path: (string | number)[]) => string | null,
): string {
  return error.issues
    .map((issue) => {
      const prefix = etiqueta?.(issue.path) ?? null;
      const path = issue.path.join('.');
      const detalle = path === '' ? issue.message : `${path}: ${issue.message}`;

      return prefix === null ? detalle : `${prefix}: ${detalle}`;
    })
    .join(' ');
}

function parseFile<T>(
  fileName: string,
  schema: z.ZodType<T>,
  value: unknown,
  etiqueta?: (path: (string | number)[]) => string | null,
): T {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    fail(`${fileName}: ${describeIssues(parsed.error, etiqueta)}`);
  }

  return parsed.data;
}

function describeProduct(product: Pick<SeedProductFile, 'barcode' | 'name'>): string {
  return `Producto "${product.name}" (${product.barcode})`;
}

/** Un error de products.json tiene que decir qué producto es, no solo en qué posición está. */
function parseProductsFile(value: unknown): SeedProductFile[] {
  const lista: Array<Record<string, unknown>> = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>)
    : [];

  return parseFile('products.json', productsFileSchema, value, (path) => {
    const indice = path[0];
    const producto = typeof indice === 'number' ? lista[indice] : undefined;

    if (producto === undefined || typeof producto.name !== 'string') {
      return null;
    }

    return typeof producto.barcode === 'string'
      ? `Producto "${producto.name}" (${producto.barcode})`
      : `Producto "${producto.name}"`;
  });
}

function planCategories(categories: readonly SeedCategoryFile[]): CategoryPlan[] {
  const names = new Set<string>();

  return categories.map((category) => {
    if (names.has(category.name)) {
      fail(`La categoría "${category.name}" está repetida en categories.json.`);
    }

    names.add(category.name);

    const keys = new Set<string>();

    const fields = category.fields.map((field): CategoryField => {
      if (keys.has(field.key)) {
        fail(`Categoría "${category.name}": el campo "${field.key}" está repetido.`);
      }

      keys.add(field.key);

      const definition: CategoryField = {
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required ?? false,
        options: field.options === undefined || field.options.length === 0 ? null : [...field.options],
        unit: field.unit ?? null,
        sortOrder: field.sortOrder ?? 0,
        active: true,
      };

      const validation = validateFieldDefinition(definition);

      if (!validation.ok) {
        fail(
          `Categoría "${category.name}", campo "${field.key}": ${validation.errors
            .map((error) => error.message)
            .join(' ')}`,
        );
      }

      return definition;
    });

    return { name: category.name, fields };
  });
}

function planProducts(
  products: readonly SeedProductFile[],
  fieldsByCategory: ReadonlyMap<string, readonly CategoryField[]>,
): ProductPlan[] {
  const barcodes = new Set<string>();

  return products.map((product) => {
    if (barcodes.has(product.barcode)) {
      fail(`${describeProduct(product)}: el código de barras está repetido en products.json.`);
    }

    barcodes.add(product.barcode);

    const fields = fieldsByCategory.get(product.category);

    if (!fields) {
      fail(`${describeProduct(product)}: la categoría "${product.category}" no está en categories.json.`);
    }

    const hasCmrDiscount = product.hasCmrDiscount ?? product.cmrDiscountPercent !== undefined;

    const parsed = createProductSchema.safeParse({
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      color: product.color,
      categoryId: PLACEHOLDER_ID,
      originalPriceCents: solesToCents(product.originalPrice),
      hasCmrDiscount,
      cmrDiscountBps: hasCmrDiscount ? percentToBps(product.cmrDiscountPercent ?? 0) : 0,
      stock: product.stock,
      maxPerPurchase: product.maxPerPurchase ?? DEFAULT_MAX_PER_PURCHASE,
      attributes: product.attributes ?? {},
    });

    if (!parsed.success) {
      fail(`${describeProduct(product)}: ${describeIssues(parsed.error)}`);
    }

    const attributes = validateAttributes(fields, product.attributes ?? {});

    if (!attributes.ok) {
      fail(`${describeProduct(product)}: ${attributes.errors.map((error) => error.message).join(' ')}`);
    }

    const values = parsed.data;

    return {
      barcode: values.barcode,
      name: values.name,
      brand: values.brand,
      color: values.color ?? null,
      categoryName: product.category,
      originalPriceCents: values.originalPriceCents,
      hasCmrDiscount: values.hasCmrDiscount,
      cmrDiscountBps: values.cmrDiscountBps,
      attributes: attributes.values,
      stock: values.stock,
      maxPerPurchase: values.maxPerPurchase,
    };
  });
}

async function findExistingBarcodes(client: PrismaClient, barcodes: readonly string[]): Promise<Set<string>> {
  if (barcodes.length === 0) {
    return new Set<string>();
  }

  const rows = await client.product.findMany({
    where: { barcode: { in: [...barcodes] } },
    select: { barcode: true },
  });

  return new Set(rows.map((row) => row.barcode));
}

async function findExistingCategoryNames(client: PrismaClient, names: readonly string[]): Promise<Set<string>> {
  if (names.length === 0) {
    return new Set<string>();
  }

  const rows = await client.category.findMany({ where: { name: { in: [...names] } }, select: { name: true } });

  return new Set(rows.map((row) => row.name));
}

/** Los destinos de una campaña se comprueban contra los productos del archivo y los que ya existen. */
async function planCampaigns(
  client: PrismaClient,
  campaigns: readonly SeedCampaignFile[],
  categoryNamesInFile: ReadonlySet<string>,
  productBarcodesInFile: ReadonlySet<string>,
): Promise<CampaignPlan[]> {
  const names = new Set<string>();
  const targetBarcodes = campaigns.flatMap((campaign) => campaign.targetBarcodes ?? []);
  const barcodesInFile = new Set(targetBarcodes.filter((barcode) => productBarcodesInFile.has(barcode)));
  const barcodesInDatabase = await findExistingBarcodes(
    client,
    targetBarcodes.filter((barcode) => !barcodesInFile.has(barcode)),
  );
  const targetCategoryNames = campaigns.flatMap((campaign) => campaign.targetCategory ?? []);
  const categoryNamesInDatabase = await findExistingCategoryNames(
    client,
    targetCategoryNames.filter((name) => !categoryNamesInFile.has(name)),
  );

  return campaigns.map((campaign) => {
    if (names.has(campaign.name)) {
      fail(`La campaña "${campaign.name}" está repetida en campaigns.json.`);
    }

    names.add(campaign.name);

    const barcodes = campaign.targetBarcodes ?? [];
    const categoryNames = campaign.targetCategory === undefined ? [] : [campaign.targetCategory];

    for (const barcode of barcodes) {
      if (!barcodesInFile.has(barcode) && !barcodesInDatabase.has(barcode)) {
        fail(
          `Campaña "${campaign.name}": el producto con el código ${barcode} no está en products.json ni existe.`,
        );
      }
    }

    for (const name of categoryNames) {
      if (!categoryNamesInFile.has(name) && !categoryNamesInDatabase.has(name)) {
        fail(`Campaña "${campaign.name}": la categoría "${name}" no está en categories.json ni existe.`);
      }
    }

    const parsed = createCampaignSchema.safeParse({
      name: campaign.name,
      scope: campaign.scope,
      discountType: campaign.discountType,
      discountValue: discountValueOf(campaign.discountType, campaign.discountPercent, campaign.discountAmount),
      priority: campaign.priority ?? 0,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      active: campaign.active ?? true,
      productIds: campaign.scope === 'PRODUCTS' ? barcodes.map(() => PLACEHOLDER_ID) : undefined,
      categoryIds: campaign.scope === 'CATEGORIES' ? categoryNames.map(() => PLACEHOLDER_ID) : undefined,
    });

    if (!parsed.success) {
      fail(`Campaña "${campaign.name}": ${describeIssues(parsed.error)}`);
    }

    const values = parsed.data;
    const period = limaDayToPeriod(values.startsAt);
    const endPeriod = limaDayToPeriod(values.endsAt);

    if (!period || !endPeriod) {
      fail(`Campaña "${campaign.name}": alguna de las fechas no existe.`);
    }

    return {
      name: values.name,
      scope: values.scope as CampaignScope,
      discountType: values.discountType,
      discountValue: values.discountValue,
      priority: values.priority ?? 0,
      startsAt: period.startsAt,
      endsAt: endPeriod.endsAt,
      active: values.active ?? true,
      categoryNames,
      barcodes,
    } satisfies CampaignPlan;
  });
}

/**
 * Carga el catálogo de `prisma/seed-data/`. Idempotente: las categorías se buscan por nombre, los
 * campos por clave, las campañas por nombre y los productos por código de barras; un producto que
 * ya existe se deja como está, con su stock.
 *
 * Valida los datos con las mismas reglas de la API (EAN-13, porcentajes, campos de la categoría,
 * prioridad y fechas de las campañas) y, si algo falla, dice qué registro es y por qué.
 */
export async function loadCatalog(client: PrismaClient, data: SeedCatalogInput): Promise<CatalogSummary> {
  const categories = planCategories(parseFile('categories.json', categoriesFileSchema, data.categories));
  const products = planProducts(
    parseProductsFile(data.products),
    new Map(categories.map((category) => [category.name, category.fields])),
  );
  const campaigns = await planCampaigns(
    client,
    parseFile('campaigns.json', campaignsFileSchema, data.campaigns),
    new Set(categories.map((category) => category.name)),
    new Set(products.map((product) => product.barcode)),
  );

  const categoryResult = await loadCategories(client, categories);
  const productResult = await loadProducts(client, products, categoryResult.ids);
  const campaignResult = await loadCampaigns(client, campaigns, categoryResult.ids, productResult.idsByBarcode);

  return {
    categoriesCreated: categoryResult.created,
    fieldsCreated: categoryResult.fieldsCreated,
    campaignsCreated: campaignResult.created,
    campaignsUpdated: campaignResult.updated,
    productsCreated: productResult.created,
    productsSkipped: productResult.skipped,
  };
}
