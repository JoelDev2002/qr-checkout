import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../services/api';
import { searchProducts } from '../../services/products';
import type { ProductListItem } from '../../types/product';

const buttonClasses =
  'min-h-[44px] rounded-button border border-line bg-surface px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50';

const inputClasses =
  'mt-2 min-h-[44px] w-full rounded-button border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

const SEARCH_DEBOUNCE_MS = 300;

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

function label(product: ProductListItem): string {
  return product.brand.length > 0 ? `${product.name} · ${product.brand}` : product.name;
}

type ProductPickerProps = {
  selectedIds: number[];
  /** Nombres de todos los productos, para mostrar los elegidos al abrir el formulario. */
  knownProducts: Map<number, ProductListItem>;
  onAdd: (product: ProductListItem) => void;
  onRemove: (id: number) => void;
  disabled: boolean;
};

/** Busca productos con 300 ms de espera y muestra los elegidos como chips. */
export function ProductPicker({
  selectedIds,
  knownProducts,
  onAdd,
  onRemove,
  disabled,
}: ProductPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [cache, setCache] = useState<Map<number, ProductListItem>>(() => new Map(knownProducts));
  const [retryToken, setRetryToken] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const text = query.trim();

    if (text === '') {
      requestId.current += 1;
      setResults([]);
      setSearching(false);
      setSearched(false);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    const request = requestId.current + 1;
    requestId.current = request;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const page = await searchProducts(text);

          if (request !== requestId.current) {
            return;
          }

          setResults(page.items);
          setCache((previous) => {
            const next = new Map(previous);

            for (const product of page.items) {
              next.set(product.id, product);
            }

            return next;
          });
          setSearched(true);
        } catch (error) {
          if (request !== requestId.current) {
            return;
          }

          setSearchError(toMessage(error));
        } finally {
          if (request === requestId.current) {
            setSearching(false);
          }
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, retryToken]);

  const selected = selectedIds.map((id) => {
    const product = cache.get(id) ?? knownProducts.get(id);

    return {
      id,
      text: product === undefined ? `Producto #${id}` : label(product),
    };
  });

  return (
    <div>
      <label htmlFor="campaign-product-search" className="block text-sm font-semibold text-ink">
        Buscar productos
      </label>
      <input
        id="campaign-product-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        disabled={disabled}
        placeholder="Nombre, marca o código de barras"
        autoComplete="off"
        className={inputClasses}
      />
      <p className="mt-1 text-sm text-muted">
        Escribe al menos una letra; la búsqueda espera 300 ms antes de consultar.
      </p>

      {searching && <p className="mt-2 text-sm text-muted">Buscando productos…</p>}

      {searchError !== null && (
        <div role="alert" className="mt-2 rounded-tag border border-cmr px-3 py-2">
          <p className="text-sm text-cmr">{searchError}</p>
          <button
            type="button"
            onClick={() => setRetryToken((token) => token + 1)}
            className={`${buttonClasses} mt-2`}
          >
            Reintentar
          </button>
        </div>
      )}

      {!searching && searchError === null && searched && results.length === 0 && (
        <p className="mt-2 text-sm text-muted">No encontramos productos con esa búsqueda.</p>
      )}

      {!searching && searchError === null && results.length > 0 && (
        <ul className="mt-2 rounded-tag border border-line">
          {results.map((product) => {
            const alreadySelected = selectedIds.includes(product.id);

            return (
              <li
                key={product.id}
                className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 first:border-t-0"
              >
                <span className="text-base text-ink">{label(product)}</span>
                <button
                  type="button"
                  onClick={() => onAdd(product)}
                  disabled={disabled || alreadySelected}
                  className={buttonClasses}
                >
                  {alreadySelected ? 'Agregado' : 'Agregar'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-sm font-semibold text-ink">Elegidos</p>

      {selected.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Todavía no elegiste productos.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {selected.map((product) => (
            <li
              key={product.id}
              className="flex min-h-[44px] items-center gap-1 rounded-tag border border-line bg-paper pl-3 pr-1 text-base text-ink"
            >
              <span>{product.text}</span>
              <button
                type="button"
                onClick={() => onRemove(product.id)}
                disabled={disabled}
                aria-label={`Quitar ${product.text}`}
                className="flex h-11 w-11 items-center justify-center rounded-button text-lg font-semibold text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
