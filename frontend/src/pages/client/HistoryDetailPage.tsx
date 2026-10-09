import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Receipt } from '../../components/Receipt';
import { getPurchaseDetail } from '../../services/purchases';
import type { PurchaseDetail } from '../../types/purchases';

export default function HistoryDetailPage() {
  const { saleId } = useParams();
  const id = Number(saleId);

  const [detail, setDetail] = useState<PurchaseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) {
      setError('No encontramos esa compra');
      return;
    }
    setLoading(true);
    setError(null);
    getPurchaseDetail(id)
      .then((d) => setDetail(d))
      .catch((err: any) => {
        const msg = err?.response?.status === 404 ? 'No encontramos esa compra' : err?.response?.data?.error?.message || err?.message || 'Error al cargar detalle';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="mx-auto w-full max-w-[360px] px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">Detalle de compra</h1>
        <Link to="/client/history" className="text-sm text-ink underline">
          Volver al historial
        </Link>
      </div>

      {loading && <p className="text-sm text-muted">Cargando...</p>}
      {error && <p className="text-sm text-warn">{error}</p>}

      {detail && (
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
  );
}
