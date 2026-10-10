import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ProductList } from '../../features/products/ProductList';
import { StockAdjustmentPanel } from '../../features/products/StockAdjustment';
import { buildProductListQuery, type ProductStatusFilter } from '../../lib/productQuery';
import { readSession } from '../../lib/session';
import { ApiError } from '../../services/api';
import { listCategories } from '../../services/categories';
import { listProducts, setProductActive } from '../../services/products';
import type { Category } from '../../types/category';
import type { AdminProduct } from '../../types/product';

const buttonClasses =
  'min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50';

const fieldClasses =
  'min-h-[44px] w-full rounded-button border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

/** La espera antes de buscar, para no mandar una petición por cada tecla. */
const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZES = [20, 50, 100];

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

function readNoticeFromState(state: unknown): string | null {
  if (typeof state === 'object' && state !== null && 'notice' in state) {
    const notice = (state as { notice?: unknown }).notice;

    return typeof notice === 'string' ? notice : null;
  }

  return null;
}

export function Products() {
  const location = useLocation();
  const session = readSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [status, setStatus] = useState<ProductStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pending, setPending] = useState<AdminProduct | null>(null);
  const [adjusting, setAdjusting] = useState<AdminProduct | null>(null);
  const [notice, setNotice] = useState<string | null>(
    // El formulario deja el aviso "Producto guardado" al volver a la lista.
    () => readNoticeFromState(location.state),
  );
  const [refreshKey, setRefreshKey] = useState(0);

  const query = useMemo(
    () => buildProductListQuery({ search, categoryId, status, page, pageSize }),
    [search, categoryId, status, page, pageSize],
  );

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setLoadError(null);

    listProducts(query)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setProducts(result.items);
        setTotal(result.total);

        // Un filtro puede dejar la página sin filas; en ese caso se vuelve a la primera.
        if (result.items.length === 0 && page > 1) {
          setPage(1);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(toMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [query, page, refreshKey]);

  useEffect(() => {
    listCategories(true)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [searchInput]);

  function handleCategoryChange(value: string) {
    setCategoryId(value === '' ? null : Number(value));
    setPage(1);
  }

  function handleStatusChange(value: string) {
    setStatus(value as ProductStatusFilter);
    setPage(1);
  }

  function handlePageSizeChange(value: string) {
    setPageSize(Number(value));
    setPage(1);
  }

  function handleAskToggle(product: AdminProduct) {
    setPending(product);
  }

  async function handleConfirmToggle() {
    if (pending === null) {
      return;
    }

    const active = !pending.active;
    setBusyId(pending.id);
    setLoadError(null);

    try {
      await setProductActive(pending.id, active);
      setPending(null);
      setNotice(active ? 'Producto activado' : 'Producto desactivado');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setLoadError(toMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  if (session === null) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstShown = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = Math.min(page * pageSize, total);
  const hasFilters = search.length > 0 || categoryId !== null || status !== 'all';

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div>
            <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-cmr" />
            <h1 className="mt-3 text-2xl font-bold text-ink">Productos</h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin/products/new"
              className={`${buttonClasses} bg-ink text-surface`}
            >
              Nuevo producto
            </Link>
          </div>
        </header>

        <h2 className="mt-6 text-lg font-semibold text-ink">Catálogo de productos</h2>

        <section aria-label="Búsqueda y filtros" className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <label htmlFor="product-search" className="text-sm font-semibold text-ink">
              Buscar
            </label>
            <input
              id="product-search"
              type="search"
              placeholder="Nombre, marca o código"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className={fieldClasses}
            />
          </div>

          <div className="flex min-w-[10rem] flex-col gap-1">
            <label htmlFor="product-category" className="text-sm font-semibold text-ink">
              Categoría
            </label>
            <select
              id="product-category"
              value={categoryId === null ? '' : String(categoryId)}
              onChange={(event) => handleCategoryChange(event.target.value)}
              className={fieldClasses}
            >
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-[8rem] flex-col gap-1">
            <label htmlFor="product-status" className="text-sm font-semibold text-ink">
              Estado
            </label>
            <select
              id="product-status"
              value={status}
              onChange={(event) => handleStatusChange(event.target.value)}
              className={fieldClasses}
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>
        </section>

        {loading && <p className="mt-4 text-base text-muted">Cargando productos…</p>}

        {!loading && loadError !== null && (
          <div role="alert" className="mt-4 rounded-tag border border-cmr px-3 py-2">
            <p className="text-sm text-cmr">{loadError}</p>
            <button
              type="button"
              onClick={() => setRefreshKey((key) => key + 1)}
              className={`${buttonClasses} mt-2 border border-line bg-surface text-ink`}
            >
              Reintentar
            </button>
          </div>
        )}

        {!loading && loadError === null && products.length === 0 && (
          <p className="mt-4 text-base text-muted">
            {hasFilters
              ? 'No encontramos productos con esa búsqueda. Cambia el texto o quita los filtros.'
              : 'Todavía no hay productos en el catálogo.'}
          </p>
        )}

        {!loading && loadError === null && products.length > 0 && (
          <ProductList
            products={products}
            busyId={busyId}
            pendingId={pending?.id ?? null}
            onAskToggle={handleAskToggle}
            onConfirmToggle={() => void handleConfirmToggle()}
            onCancelToggle={() => setPending(null)}
            onAskAdjust={setAdjusting}
          />
        )}

        {adjusting !== null && (
          <StockAdjustmentPanel
            product={adjusting}
            onChanged={() => setRefreshKey((key) => key + 1)}
            onClose={() => setAdjusting(null)}
          />
        )}

        {!loading && loadError === null && total > 0 && (
          <nav aria-label="Paginación" className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Mostrando {firstShown}–{lastShown} de {total}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="product-page-size" className="text-sm text-muted">
                Por página
              </label>
              <select
                id="product-page-size"
                value={String(pageSize)}
                onChange={(event) => handlePageSizeChange(event.target.value)}
                className={`${fieldClasses} w-auto`}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setPage((current) => current - 1)}
                disabled={page <= 1}
                className={`${buttonClasses} border border-line bg-surface text-ink`}
              >
                Anterior
              </button>
              <span className="text-sm text-ink">
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= totalPages}
                className={`${buttonClasses} border border-line bg-surface text-ink`}
              >
                Siguiente
              </button>
            </div>
          </nav>
        )}

        {notice !== null && (
          <p role="status" className="mt-4 rounded-tag bg-saving px-3 py-2 text-sm text-surface">
            {notice}
          </p>
        )}
    </div>
  );
}
