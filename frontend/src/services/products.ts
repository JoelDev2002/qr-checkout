import type { AdminProduct, ProductListItem } from '../types/product';
import { get, patch } from './api';

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
