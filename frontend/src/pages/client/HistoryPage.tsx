import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt } from '../../components/Receipt';
import { formatMoney } from '../../lib/money';
import { formatDateLima } from '../../lib/date';
import { paymentMethodLabel } from '../../lib/payment';
import { getPurchases, getPurchaseDetail } from '../../services/purchases';
import type { PurchaseDetail, PurchaseSummary } from '../../types/purchases';

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

  const navigate = useNavigate();

  const loadPage = useCallback(
    async (nextPage: number, replace = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getPurchases({ page: nextPage, pageSize: 20 });
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
        setPage(nextPage);
        setHasMore(res.items.length >= 20 && (nextPage * 20) < res.total);
      } catch (err: any) {
        setError(err?.response?.data?.error?.message || err?.message || 'Error al cargar');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadPage(1, true);
  }, [loadPage]);

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    getPurchaseDetail(selectedId)
      .then((d) => setDetail(d))
      .catch((err: any) => {
        const msg = err?.response?.status === 404 ? 'No encontramos esa compra' : err?.response?.data?.error?.message || err?.message || 'Error al cargar detalle';
        setDetailError(msg);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const selectedSummary = useMemo(() => items.find((i) => i.id === selectedId) || null, [items, selectedId]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">Historial de compras</h1>
        <button type="button" onClick={() => navigate('/client')} className="text-sm text-ink underline">
          Volver al inicio
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded border border-line bg-white p-3 text-sm text-warn">
          {error}
          <button type="button" onClick={() => loadPage(page, true)} className="ml-2 underline">
            Reintentar
          </button>
        </div>
      )}

      {items.length === 0 && !loading && !error && <p className="text-sm text-muted">Aún no tienes compras.</p>}

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded border border-line bg-white p-3">
            <button type="button" onClick={() => setSelectedId(item.id)} className="w-full text-left">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-ink">{item.receiptNumber}</p>
                  <p className="text-xs text-muted">{formatDateLima(item.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-ink tabular-nums">{formatMoney(item.totalCents)}</p>
                  <p className="text-xs text-muted tabular-nums">{paymentMethodLabel(item.paymentMethod)}</p>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="mt-4">
          <button type="button" onClick={() => loadPage(page + 1)} disabled={loading} className="w-full rounded border border-line bg-white py-2 text-sm font-medium text-ink disabled:opacity-50">
            {loading ? 'Cargando...' : 'Cargar más'}
          </button>
        </div>
      )}

      {selectedId !== null && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
          <div className="mx-auto max-w-[360px]">
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => setSelectedId(null)} className="rounded bg-white px-3 py-1 text-sm text-ink">
                Cerrar
              </button>
            </div>
            {detailLoading && <p className="rounded bg-white p-4 text-sm text-muted">Cargando...</p>}
            {detailError && <p className="rounded bg-white p-4 text-sm text-warn">{detailError}</p>}
            {detail && selectedSummary && (
              <div className="space-y-3">
                <Receipt
                  receiptNumber={detail.receiptNumber}
                  code={detail.code}
                  createdAt={detail.createdAt}
                  items={detail.items.map((i) => ({ name: i.name, quantity: i.quantity, subtotalCents: i.subtotalCents }))}
                  totalCents={detail.totals.totalCents}
                  paymentMethod={detail.paymentMethod}
                />
                <button type="button" onClick={() => window.print()} className="w-full rounded border border-line bg-white py-2 text-sm font-medium text-ink">
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
