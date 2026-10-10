import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Receipt } from '../../components/Receipt';
import { formatDateLima } from '../../lib/date';
import { formatMoney } from '../../lib/money';
import { paymentMethodLabel } from '../../lib/payment';
import { ApiError } from '../../services/api';
import { getPurchaseDetail, getPurchases } from '../../services/purchases';
import type { PurchaseDetail, PurchaseDetailItem, PurchaseSummary } from '../../types/purchases';

const PAGE_SIZE = 20;

const primaryButton =
  'flex min-h-[44px] w-full items-center justify-center rounded-button bg-ink px-4 text-base font-semibold text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';
const secondaryButton =
  'flex min-h-[44px] w-full items-center justify-center rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

function toDetailItems(items: PurchaseDetailItem[]) {
  return items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    subtotalCents: item.subtotalCents,
  }));
}

export default function HistoryPage() {
  const [items, setItems] = useState<PurchaseSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PurchaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState(0);

  const loadPage = useCallback(async (nextPage: number, replace = false) => {
    setLoading(true);
    setError(null);

    try {
      const result = await getPurchases({ page: nextPage, pageSize: PAGE_SIZE });
      setItems((prev) => (replace ? result.items : [...prev, ...result.items]));
      setPage(nextPage);
      setHasMore(result.items.length >= PAGE_SIZE && nextPage * PAGE_SIZE < result.total);
    } catch (caught) {
      if (replace) {
        setItems([]);
      }
      setError(toMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage(1, true);
  }, [loadPage]);

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    getPurchaseDetail(selectedId)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setDetailError(toMessage(caught));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, detailKey]);

  const selectedSummary = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink">Historial de compras</h1>
        <Link
          to="/"
          className="min-h-[44px] rounded-button px-3 text-sm font-semibold text-ink underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Volver al inicio
        </Link>
      </div>

      {loading && items.length === 0 && (
        <p role="status" className="text-base text-muted">
          Cargando historial…
        </p>
      )}

      {error !== null && (
        <div role="alert" className="rounded-tag border border-cmr bg-surface px-3 py-2">
          <p className="text-sm text-cmr">{error}</p>
          <button
            type="button"
            onClick={() => void loadPage(page, true)}
            className={`${secondaryButton} mt-2`}
          >
            Reintentar
          </button>
        </div>
      )}

      {!loading && error === null && items.length === 0 && (
        <section className="rounded-sheet border border-line bg-surface p-6 text-center">
          <p className="text-base text-ink">Aún no tienes compras.</p>
          <p className="mt-1 text-sm text-muted">Escanea productos y paga en caja para verlas aquí.</p>
          <Link to="/" className={`${secondaryButton} mt-4`}>
            Ir al escáner
          </Link>
        </section>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-sheet border border-line bg-surface p-3">
              <button
                type="button"
                onClick={() => setSelectedId(item.id)}
                aria-label={`Ver detalle de ${item.receiptNumber}`}
                className="flex w-full items-start justify-between gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <div className="min-w-0">
                  <p className="text-base font-semibold tabular-nums text-ink">{item.receiptNumber}</p>
                  <p className="text-sm text-muted">{formatDateLima(item.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-semibold tabular-nums text-ink">
                    {formatMoney(item.totalCents)}
                  </p>
                  <p className="text-sm text-muted">{paymentMethodLabel(item.paymentMethod)}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasMore && items.length > 0 && (
        <button
          type="button"
          onClick={() => void loadPage(page + 1)}
          disabled={loading}
          className={secondaryButton}
        >
          {loading ? 'Cargando…' : 'Cargar más'}
        </button>
      )}

      {selectedId !== null && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
          <div className="mx-auto flex w-full max-w-[360px] flex-col gap-3">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="inline-flex min-h-[44px] items-center rounded-button border border-line bg-surface px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                Cerrar
              </button>
            </div>

            {detailLoading && (
              <p role="status" className="rounded-sheet bg-surface p-4 text-sm text-muted">
                Cargando detalle…
              </p>
            )}

            {detailError !== null && (
              <div role="alert" className="rounded-tag border border-cmr bg-surface px-3 py-2">
                <p className="text-sm text-cmr">{detailError}</p>
                <button
                  type="button"
                  onClick={() => setDetailKey((key) => key + 1)}
                  className={`${secondaryButton} mt-2`}
                >
                  Reintentar
                </button>
              </div>
            )}

            {detail !== null && selectedSummary !== null && (
              <div className="flex flex-col gap-3">
                <Receipt
                  receiptNumber={detail.receiptNumber}
                  code={detail.code}
                  createdAt={detail.createdAt}
                  items={toDetailItems(detail.items)}
                  totalCents={detail.totals.totalCents}
                  paymentMethod={detail.paymentMethod}
                />
                <button type="button" onClick={() => window.print()} className={primaryButton}>
                  Imprimir comprobante
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}