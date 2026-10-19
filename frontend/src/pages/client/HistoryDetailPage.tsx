import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Receipt } from '../../components/Receipt';
import { deliveryStatus } from '../../lib/delivery';
import { ApiError } from '../../services/api';
import { getPurchaseDetail } from '../../services/purchases';
import type { PurchaseDetail, PurchaseDetailItem } from '../../types/purchases';

const primaryButton =
  'flex min-h-[44px] w-full items-center justify-center rounded-button bg-button px-4 text-base font-semibold text-surface hover:bg-button-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';
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

export default function HistoryDetailPage() {
  const { saleId } = useParams();
  const id = Number(saleId);

  const [detail, setDetail] = useState<PurchaseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) {
      setError('No encontramos esa compra.');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getPurchaseDetail(id)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(toMessage(caught));
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
  }, [id, retryKey]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink">Detalle de compra</h1>
        <Link
          to="/history"
          className="min-h-[44px] rounded-button px-3 text-sm font-semibold text-ink underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Volver al historial
        </Link>
      </div>

      {loading && (
        <p role="status" className="text-base text-muted">
          Cargando detalle…
        </p>
      )}

      {error !== null && (
        <div role="alert" className="rounded-tag border border-cmr bg-surface px-3 py-2">
          <p className="text-sm text-cmr">{error}</p>
          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
            className={`${secondaryButton} mt-2`}
          >
            Reintentar
          </button>
        </div>
      )}

      {detail !== null && (
        <div className="flex flex-col gap-3">
          {detail.paymentMethod === 'ONLINE' && (
            <p className="text-sm text-muted">En línea · {deliveryStatus(detail.deliveredAt)}</p>
          )}
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
  );
}