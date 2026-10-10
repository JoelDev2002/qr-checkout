import { useCallback, useEffect, useState } from 'react';
import { checkoutErrorMessage } from '../../features/checkout/checkout';
import { formatTimeLima } from '../../lib/date';
import { formatMoney } from '../../lib/money';
import { paymentMethodLabel } from '../../lib/payment';
import { getSalesToday, type SalesTodayList } from '../../services/checkout';

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
const buttonBase = `min-h-[44px] rounded-button px-4 text-base font-semibold disabled:opacity-60 ${focusRing}`;
const secondaryButton = `${buttonBase} border border-line bg-surface text-ink`;

const DOC_TYPE_LABELS: Record<string, string> = {
  TICKET: 'Ticket',
  BOLETA: 'Boleta',
  FACTURA: 'Factura',
};

/** Pantalla "Cobros de hoy" del cajero (T2.9; DESIGN §4, cajero punto 4). */
export function TodaySales() {
  const [data, setData] = useState<SalesTodayList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setData(await getSalesToday());
    } catch (err) {
      setError(checkoutErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data?.summary ?? null;
  const breakdown = summary === null ? [] : Object.entries(summary.byPaymentMethod);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-ink">Cobros de hoy</h1>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className={secondaryButton}
        >
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {loading && data === null && (
        <p role="status" className="text-sm text-muted">
          Cargando cobros de hoy…
        </p>
      )}

      {error !== null && (
        <div
          role="alert"
          className="rounded-tag border border-warn bg-surface px-3 py-2 text-sm text-warn"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className={`mt-2 min-h-[44px] rounded-button px-3 text-sm font-semibold underline ${focusRing}`}
          >
            Reintentar
          </button>
        </div>
      )}

      {data !== null && (
        <>
          <section className="rounded-sheet border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted">Ventas</span>
              <span className="text-base font-semibold tabular-nums text-ink">{data.summary.count}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted">Total cobrado</span>
              <span className="text-2xl font-bold tabular-nums text-ink">
                {formatMoney(data.summary.totalCents)}
              </span>
            </div>
            {breakdown.length > 0 && (
              <ul className="mt-3 border-t border-line pt-3">
                {breakdown.map(([method, amount]) => (
                  <li
                    key={method}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="text-muted">{paymentMethodLabel(method)}</span>
                    <span className="tabular-nums text-ink">{formatMoney(amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.items.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay cobros hoy.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.items.map((item) => (
                <li
                  key={item.code}
                  className="rounded-sheet border border-line bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold tabular-nums text-ink">
                        {formatTimeLima(item.createdAt)}
                      </p>
                      <p className="text-sm tabular-nums text-muted">{item.code}</p>
                    </div>
                    <p className="text-base font-semibold tabular-nums text-ink">
                      {formatMoney(item.totalCents)}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {item.receiptNumber} · {DOC_TYPE_LABELS[item.docType] ?? item.docType} ·{' '}
                    {paymentMethodLabel(item.paymentMethod)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}