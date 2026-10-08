export type ProductStatusFilter = 'active' | 'inactive' | 'all';

export type ProductListFilters = {
  search: string;
  categoryId: number | null;
  status: ProductStatusFilter;
  page: number;
  pageSize: number;
};

/**
 * Arma la consulta de GET /products: la búsqueda y los filtros van solo si aportan algo
 * (el servidor ya tiene valores por defecto para page y pageSize) y siempre en el mismo
 * orden, para que la petición cambie solo cuando cambia lo que ve el admin.
 */
export function buildProductListQuery(filters: ProductListFilters): string {
  const params = new URLSearchParams();
  const search = filters.search.trim();

  if (search.length > 0) {
    params.set('q', search);
  }

  if (filters.categoryId !== null) {
    params.set('categoryId', String(filters.categoryId));
  }

  if (filters.status !== 'all') {
    params.set('active', filters.status === 'active' ? 'true' : 'false');
  }

  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));

  return `?${params.toString()}`;
}
