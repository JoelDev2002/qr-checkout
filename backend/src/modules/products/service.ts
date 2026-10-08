import {
  toDisplayAttributes,
  validateAttributes,
  type AttributeValues,
  type DisplayAttribute,
} from '../../domain/attributes.js';
import { resolvePrices, type Campaign, type PricedProduct, type ResolvedPrices } from '../../domain/pricing.js';
import { normalizeStockReason } from '../../domain/stock.js';
import { ApiError } from '../../middlewares/errorHandler.js';
import { findActive as findActiveCampaigns } from '../campaigns/repository.js';
import { findCategoryById, type CategoryRecord } from '../categories/repository.js';
import {
  applyStockAdjustment as applyStockAdjustmentRecord,
  createProduct as createProductRecord,
  createProductScan,
  findProductByBarcode,
  findProductById,
  isUniqueViolation,
  listProducts as listProductRecords,
  listStockAdjustments as listStockAdjustmentRecords,
  setProductActive as setProductActiveRecord,
  updateProduct as updateProductRecord,
  type ProductRecord,
  type StockAdjustmentRecord,
} from './repository.js';
import type {
  CreateProductInput,
  ListProductsQuery,
  PricePreviewInput,
  StockAdjustmentInput,
  StockAdjustmentsQuery,
  UpdateProductInput,
} from './schemas.js';


export type ProductView = {
  id: number;
  barcode: string;
  name: string;
  brand: string;
  color: string | null;
  categoryId: number;
  categoryName: string;
  originalPriceCents: number;
  hasCmrDiscount: boolean;
  cmrDiscountBps: number;
  attributes: Record<string, unknown>;
  stock: number;
  maxPerPurchase: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  prices: ResolvedPrices;
};

export type ProductListView = {
  items: ProductView[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Lo que ve el cliente al escanear. No lleva el stock exacto ni el porcentaje CMR: el límite es
 * maxQuantity (RN-04) y el porcentaje CMR es una regla interna del producto (RN-01).
 */
export type ScannedProductView = {
  id: number;
  barcode: string;
  name: string;
  brand: string;
  color: string | null;
  originalPriceCents: number;
  offerPriceCents: number;
  cmrPriceCents: number;
  hasCmrDiscount: boolean;
  campaignName: string | null;
  /** Porcentaje de ahorro del precio CMR contra el original, ya redondeado (RN-18). */
  discountPercent: number;
  details: DisplayAttribute[];
  /** Menor entre el máximo por compra y el stock (RN-04). */
  maxQuantity: number;
};

/** Vista previa del formulario del admin: no escribe nada en la base de datos. */
export type PricePreviewView = {
  offerPriceCents: number;
  cmrPriceCents: number;
  campaignName: string | null;
  discountPercent: number;
  cmrSavingCents: number;
};

/** Un ajuste del historial: qué cambió, por qué, cuándo y quién lo hizo (RN-13). */
export type StockAdjustmentView = {
  id: number;
  productId: number;
  delta: number;
  reason: string;
  createdAt: string;
  userId: number;
  userName: string;
};

export type StockAdjustmentResultView = {
  stock: number;
  adjustment: StockAdjustmentView;
};

export type StockAdjustmentListView = {
  items: StockAdjustmentView[];
  total: number;
  page: number;
  pageSize: number;
};

const PRODUCT_NOT_FOUND_MESSAGE = 'El producto no existe.';
/** El cliente no debe distinguir entre un código que no existe y uno que ya no se vende. */
const SCAN_NOT_FOUND_MESSAGE = 'No encontramos este producto.';
const DUPLICATE_BARCODE_MESSAGE = 'Ya existe un producto con ese código de barras.';
const CATEGORY_NOT_FOUND_MESSAGE = 'La categoría no existe.';

function toAdjustmentView(adjustment: StockAdjustmentRecord): StockAdjustmentView {
  return {
    id: adjustment.id,
    productId: adjustment.productId,
    delta: adjustment.delta,
    reason: adjustment.reason,
    createdAt: adjustment.createdAt.toISOString(),
    userId: adjustment.userId,
    userName: adjustment.userName,
  };
}


/** Los espacios sobrantes no se guardan: ni al principio ni al final ni entre palabras. */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function normalizeColor(color: string | undefined): string | null {
  const clean = color?.trim();

  return clean && clean.length > 0 ? clean : null;
}

function toView(product: ProductRecord, campaigns: readonly Campaign[], now: Date): ProductView {
  return {
    id: product.id,
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    color: product.color,
    categoryId: product.categoryId,
    categoryName: product.categoryName,
    originalPriceCents: product.originalPriceCents,
    hasCmrDiscount: product.hasCmrDiscount,
    cmrDiscountBps: product.cmrDiscountBps,
    attributes: product.attributes,
    stock: product.stock,
    maxPerPurchase: product.maxPerPurchase,
    active: product.active,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    prices: resolvePrices(product, campaigns, now),
  };
}

async function requireProduct(id: number): Promise<ProductRecord> {
  const product = await findProductById(id);

  if (!product) {
    throw new ApiError(404, 'NOT_FOUND', PRODUCT_NOT_FOUND_MESSAGE);
  }

  return product;
}

async function requireActiveCategory(categoryId: number): Promise<CategoryRecord> {
  const category = await findCategoryById(categoryId, false);

  if (!category) {
    throw new ApiError(400, 'VALIDATION_ERROR', CATEGORY_NOT_FOUND_MESSAGE);
  }

  if (!category.active) {
    throw new ApiError(400, 'VALIDATION_ERROR', `La categoría "${category.name}" está desactivada.`);
  }

  return category;
}

function validateOrFail(category: CategoryRecord, values: Record<string, unknown>): AttributeValues {
  const validation = validateAttributes(category.fields, values);

  if (!validation.ok) {
    throw new ApiError(
      400,
      'INVALID_ATTRIBUTES',
      validation.errors.map((error) => error.message).join(' '),
    );
  }

  return validation.values;
}

async function assertBarcodeIsFree(barcode: string): Promise<void> {
  if (await findProductByBarcode(barcode)) {
    throw new ApiError(409, 'DUPLICATE_BARCODE', DUPLICATE_BARCODE_MESSAGE);
  }
}

async function guardDuplicateBarcode<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    // El preaviso evita el gasto normal; esto cubre la carrera de dos altas simultáneas.
    if (isUniqueViolation(error)) {
      throw new ApiError(409, 'DUPLICATE_BARCODE', DUPLICATE_BARCODE_MESSAGE);
    }

    throw error;
  }
}

function isAttributeValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * RN-15: los valores ya guardados de campos desactivados no se borran al editar. Al cambiar de
 * categoría, lo único que se descarta son los valores de campos que la nueva categoría no tiene,
 * y solo si el admin lo confirma con discardAttributes.
 */
function mergeAttributes(
  current: ProductRecord,
  category: CategoryRecord,
  sent: AttributeValues,
  discardAttributes: boolean,
): AttributeValues {
  const activeKeys = new Set(category.fields.filter((field) => field.active).map((field) => field.key));
  const categoryKeys = new Set(category.fields.map((field) => field.key));
  const conflicting = Object.keys(current.attributes).filter((key) => !categoryKeys.has(key));

  if (conflicting.length > 0 && !discardAttributes) {
    throw new ApiError(
      409,
      'CONFLICT',
      `La nueva categoría no tiene estos campos: ${conflicting.join(', ')}. Vuelve a guardar para descartarlos.`,
    );
  }

  const preserved: AttributeValues = {};

  for (const [key, value] of Object.entries(current.attributes)) {
    if (!activeKeys.has(key) && categoryKeys.has(key) && isAttributeValue(value)) {
      preserved[key] = value;
    }
  }

  return { ...sent, ...preserved };
}

export async function listProducts(query: ListProductsQuery, now: Date): Promise<ProductListView> {
  // Las campañas se consultan una sola vez por petición y se reparten entre todos los productos.
  const campaigns = await findActiveCampaigns(now);
  const { rows, total } = await listProductRecords({
    search: query.q,
    categoryId: query.categoryId,
    active: query.active,
    page: query.page,
    pageSize: query.pageSize,
  });

  return {
    items: rows.map((row) => toView(row, campaigns, now)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getProduct(id: number, now: Date): Promise<ProductView> {
  const product = await requireProduct(id);
  const campaigns = await findActiveCampaigns(now);

  return toView(product, campaigns, now);
}

export async function createProduct(
  input: CreateProductInput,
  userId: number,
  now: Date,
): Promise<ProductView> {
  await assertBarcodeIsFree(input.barcode);
  const category = await requireActiveCategory(input.categoryId);
  const attributes = validateOrFail(category, input.attributes ?? {});

  const product = await guardDuplicateBarcode(() =>
    createProductRecord({
      barcode: input.barcode,
      name: normalizeName(input.name),
      brand: normalizeName(input.brand),
      color: normalizeColor(input.color),
      categoryId: input.categoryId,
      originalPriceCents: input.originalPriceCents,
      hasCmrDiscount: input.hasCmrDiscount,
      cmrDiscountBps: input.cmrDiscountBps,
      attributes,
      stock: input.stock,
      maxPerPurchase: input.maxPerPurchase,
      userId,
    }),
  );

  const campaigns = await findActiveCampaigns(now);

  return toView(product, campaigns, now);
}

export async function updateProduct(id: number, input: UpdateProductInput, now: Date): Promise<ProductView> {
  const current = await requireProduct(id);
  const category = await requireActiveCategory(input.categoryId);
  const attributes = mergeAttributes(
    current,
    category,
    validateOrFail(category, input.attributes ?? {}),
    input.discardAttributes === true,
  );

  const product = await updateProductRecord(id, {
    name: normalizeName(input.name),
    brand: normalizeName(input.brand),
    color: normalizeColor(input.color),
    categoryId: input.categoryId,
    originalPriceCents: input.originalPriceCents,
    hasCmrDiscount: input.hasCmrDiscount,
    cmrDiscountBps: input.cmrDiscountBps,
    attributes,
    maxPerPurchase: input.maxPerPurchase,
  });

  const campaigns = await findActiveCampaigns(now);

  return toView(product, campaigns, now);
}

export async function setProductActive(id: number, active: boolean, now: Date): Promise<ProductView> {
  await requireProduct(id);
  const product = await setProductActiveRecord(id, active);
  const campaigns = await findActiveCampaigns(now);

  return toView(product, campaigns, now);
}

export async function getProductByBarcode(
  barcode: string,
  now: Date,
  customerId: number | null,
): Promise<ScannedProductView> {
  const product = await findProductByBarcode(barcode);

  if (!product || !product.active) {
    throw new ApiError(404, 'PRODUCT_NOT_FOUND', SCAN_NOT_FOUND_MESSAGE);
  }

  const category = await findCategoryById(product.categoryId, true);

  if (!category || !category.active) {
    throw new ApiError(404, 'PRODUCT_NOT_FOUND', SCAN_NOT_FOUND_MESSAGE);
  }

  const campaigns = await findActiveCampaigns(now);
  const prices = resolvePrices(product, campaigns, now);

  // T3.1: solo un cliente registra la lectura, y solo si la consulta encontró el producto. Si el
  // registro falla, la consulta responde igual: la lectura no debe tumbar el escáner.
  if (customerId !== null) {
    try {
      await createProductScan(product.id, customerId);
    } catch (error) {
      console.error(`No se pudo registrar la lectura del producto ${product.id}:`, error);
    }
  }

  return {
    id: product.id,
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    color: product.color,
    originalPriceCents: prices.originalCents,
    offerPriceCents: prices.normalCents,
    cmrPriceCents: prices.cmrCents,
    hasCmrDiscount: product.hasCmrDiscount,
    campaignName: prices.campaignName,
    discountPercent: prices.cmrPercent,
    details: toDisplayAttributes(category.fields, product.attributes),
    maxQuantity: Math.min(product.maxPerPurchase, product.stock),
  };
}

export async function previewPrice(input: PricePreviewInput, now: Date): Promise<PricePreviewView> {
  // Con productId se incluyen las campañas por producto; sin él, ninguna de ese alcance aplica.
  const candidate: PricedProduct = {
    id: input.productId ?? 0,
    categoryId: input.categoryId,
    originalPriceCents: input.originalPriceCents,
    hasCmrDiscount: input.hasCmrDiscount,
    cmrDiscountBps: input.cmrDiscountBps,
  };

  const campaigns = await findActiveCampaigns(now);
  const prices = resolvePrices(candidate, campaigns, now);

  return {
    offerPriceCents: prices.normalCents,
    cmrPriceCents: prices.cmrCents,
    campaignName: prices.campaignName,
    discountPercent: prices.cmrPercent,
    cmrSavingCents: prices.normalCents - prices.cmrCents,
  };
}

/**
 * RN-13: ajuste manual de stock con motivo, registrado con el usuario que lo hizo. Un producto
 * inactivo también puede ajustarse: el stock se corrige aunque ya no se venda.
 */
export async function adjustStock(
  id: number,
  input: StockAdjustmentInput,
  userId: number,
): Promise<StockAdjustmentResultView> {
  const result = await applyStockAdjustmentRecord({
    productId: id,
    userId,
    delta: input.delta,
    reason: normalizeStockReason(input.reason),
  });

  if (result.status === 'NOT_FOUND') {
    throw new ApiError(404, 'NOT_FOUND', PRODUCT_NOT_FOUND_MESSAGE);
  }

  if (result.status === 'OUT_OF_STOCK') {
    throw new ApiError(
      409,
      'OUT_OF_STOCK',
      `El ajuste dejaría el stock en negativo: ahora hay ${result.stock} unidades.`,
    );
  }

  return { stock: result.stock, adjustment: toAdjustmentView(result.adjustment) };
}

export async function listStockAdjustments(
  id: number,
  query: StockAdjustmentsQuery,
): Promise<StockAdjustmentListView> {
  await requireProduct(id);

  const { rows, total } = await listStockAdjustmentRecords(id, query.page, query.pageSize);

  return {
    items: rows.map(toAdjustmentView),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
