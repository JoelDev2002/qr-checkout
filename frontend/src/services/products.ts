import type { ProductCreateBody, ProductUpdateBody } from '../lib/productForm';
import type { AdminProduct, ProductListItem } from '../types/product';
import { get, patch, post, put } from './api';

type ProductPage = {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminProductPage = {
  items: AdminProduct[];
  total: number;
  page: number;
  pageSize: number;
};

/** Lista del admin; los parámetros los construye lib/productQuery.ts. */
export function listProducts(query: string): Promise<AdminProductPage> {
  return get<AdminProductPage>(`/products${query}`);
}

/** RN-12: los productos no se borran, solo se activan o desactivan. */
export function setProductActive(id: number, active: boolean): Promise<AdminProduct> {
  return patch<AdminProduct>(`/products/${id}/active`, { active });
}

/** El selector de productos del formulario busca contra el servidor con una espera de 300 ms. */
export function searchProducts(query: string): Promise<ProductPage> {
  const params = new URLSearchParams({ q: query, active: 'true' });
  return get<ProductPage>(`/products?${params.toString()}`);
}

export function getProduct(id: number): Promise<AdminProduct> {
  return get<AdminProduct>(`/products/${id}`);
}

export function createProduct(body: ProductCreateBody): Promise<AdminProduct> {
  return post<AdminProduct>('/products', body);
}

export function updateProduct(id: number, body: ProductUpdateBody): Promise<AdminProduct> {
  return put<AdminProduct>(`/products/${id}`, body);
}

/** Para el aviso "Este producto ya existe": el servidor busca por nombre, marca o código. */
export function findProductByBarcode(barcode: string): Promise<AdminProductPage> {
  const params = new URLSearchParams({ q: barcode });
  return get<AdminProductPage>(`/products?${params.toString()}`);
}

/** Entrada de POST /products/price-preview; el servidor calcula los precios (RN-01). */
export type PricePreviewInput = {
  originalPriceCents: number;
  categoryId: number;
  hasCmrDiscount: boolean;
  cmrDiscountBps: number;
  /** Solo al editar: incluye las campañas con alcance por producto. */
  productId?: number;
};

export type PricePreview = {
  offerPriceCents: number;
  cmrPriceCents: number;
  campaignName: string | null;
  discountPercent: number;
  cmrSavingCents: number;
};

export function previewPrice(input: PricePreviewInput): Promise<PricePreview> {
  return post<PricePreview>('/products/price-preview', input);
}

const MAX_PAGES = 20;

/** Todos los productos, página por página, para mostrar nombres en la lista de campañas. */
export async function fetchAllProducts(): Promise<ProductListItem[]> {
  const products: ProductListItem[] = [];
  let page = 1;
  let total = 0;

  do {
    const result: ProductPage = await get<ProductPage>(
      `/products?page=${page}&pageSize=100`,
    );
    products.push(...result.items);
    total = result.total;
    page += 1;

    if (result.items.length === 0) {
      break;
    }
  } while (products.length < total && page <= MAX_PAGES);

  return products;
}
