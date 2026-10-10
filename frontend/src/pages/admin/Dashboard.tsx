import { useEffect, useState } from 'react';
import {
  DASHBOARD_MAX_DAYS,
  barHeight,
  daysInRange,
  defaultDashboardRange,
  formatDayLabel,
  formatPercent,
  lastDaysRange,
} from '../../lib/dashboard';
import { formatMoney } from '../../lib/money';
import { paymentMethodLabel } from '../../lib/payment';
import { ApiError } from '../../services/api';
import {
  getDashboardSummary,
  type DashboardSummary,
} from '../../services/dashboard';

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
const buttonClasses = `min-h-[44px] rounded-button px-4 text-base font-semibold disabled:opacity-50 ${focusRing}`;
const secondaryButton = `${buttonClasses} border border-line bg-surface text-ink`;
const primaryButton = `${buttonClasses} bg-ink text-surface`;
const fieldClasses = `min-h-[44px] rounded-button border border-line bg-surface px-3 py-2 text-base text-ink ${focusRing}`;

const RANGE_DAYS_OPTIONS = [7, 30, 90];
const LOW_STOCK_MIN = 0;

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/** Panel del admin (T3.1; DESIGN §4, admin punto 7): los totales los calcula el servidor. */
export function Dashboard() {
  const [range, setRange] = useState(() => defaultDashboardRange(new Date()));
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [thresholdInput, setThresholdInput] = useState('3');
  const [threshold, setThreshold] = useState(3);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    getDashboardSummary({ from: range.from, to: range.to, lowStockThreshold: threshold })
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(toMessage(err));
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
  }, [range, threshold, retryKey]);

  function applyPreset(days: number): void {
    setRange(lastDaysRange(days, new Date()));
    setRangeError(null);
  }

  function applyCustomRange(): void {
    const from = fromText.trim();
    const to = toText.trim();

    if (from === '' || to === '') {
      setRangeError('Elige las dos fechas del rango.');
      return;
    }

    const days = daysInRange(from, to);

    if (days === null) {
      setRangeError('Elige fechas válidas en el formato AAAA-MM-DD.');
      return;
    }

    if (to < from) {
      setRangeError('La fecha final no puede ser anterior a la inicial.');
      return;
    }

    if (days > DASHBOARD_MAX_DAYS) {
      setRangeError(`El rango no puede exceder ${DASHBOARD_MAX_DAYS} días.`);
      return;
    }

    setRange({ from, to });
    setRangeError(null);
  }

  function applyThreshold(): void {
    const value = Number.parseInt(thresholdInput, 10);

    if (!Number.isInteger(value) || value < LOW_STOCK_MIN) {
      setThresholdError('El umbral debe ser un número entero de 0 a más.');
      return;
    }

    setThresholdError(null);
    setThreshold(value);
  }

  const maxDayTotal = data === null ? 0 : Math.max(0, ...data.salesByDay.map((day) => day.totalCents));

  return (
    <main className="min-h-dvh bg-paper px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div>
            <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-cmr" />
            <h1 className="mt-3 text-2xl font-bold text-ink">Panel</h1>
            {data !== null && (
              <p className="mt-1 text-base text-muted">
                {formatDayLabel(data.range.from)} al {formatDayLabel(data.range.to)}
              </p>
            )}
          </div>
        </header>

        <section aria-label="Rango de fechas" className="mt-6">
          <div className="flex flex-wrap items-end gap-2">
            {RANGE_DAYS_OPTIONS.map((days) => (
              <button key={days} type="button" onClick={() => applyPreset(days)} className={secondaryButton}>
                Últimos {days} días
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="dashboard-from" className="text-sm font-semibold text-ink">
                Desde
              </label>
              <input
                id="dashboard-from"
                type="date"
                value={fromText}
                onChange={(event) => setFromText(event.target.value)}
                className={fieldClasses}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="dashboard-to" className="text-sm font-semibold text-ink">
                Hasta
              </label>
              <input
                id="dashboard-to"
                type="date"
                value={toText}
                onChange={(event) => setToText(event.target.value)}
                className={fieldClasses}
              />
            </div>
            <button type="button" onClick={applyCustomRange} className={primaryButton}>
              Aplicar rango
            </button>
          </div>

          {rangeError !== null && (
            <p role="alert" className="mt-2 text-sm text-cmr">
              {rangeError}
            </p>
          )}
        </section>

        {loading && data === null && (
          <p role="status" className="mt-6 text-base text-muted">
            Cargando panel…
          </p>
        )}

        {!loading && error !== null && data === null && (
          <div role="alert" className="mt-6 rounded-tag border border-warn px-3 py-2">
            <p className="text-sm text-warn">{error}</p>
            <button
              type="button"
              onClick={() => setRetryKey((key) => key + 1)}
              className={`${buttonClasses} mt-2 border border-line bg-surface text-ink`}
            >
              Reintentar
            </button>
          </div>
        )}

        {data !== null && (
          <>
            <section aria-label="Resumen" className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-sheet border border-line bg-surface p-4">
                <p className="text-sm text-muted">Ventas</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{data.totals.salesCount}</p>
              </div>
              <div className="rounded-sheet border border-line bg-surface p-4">
                <p className="text-sm text-muted">Total cobrado</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
                  {formatMoney(data.totals.totalCollectedCents)}
                </p>
              </div>
              <div className="rounded-sheet border border-line bg-surface p-4">
                <p className="text-sm text-muted">Ventas con CMR</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
                  {formatPercent(data.totals.cmrSalesPercent)}
                </p>
              </div>
            </section>

            {data.totals.salesCount === 0 && (
              <p className="mt-6 text-base text-muted">No hay ventas en este rango.</p>
            )}

            {data.totals.salesCount > 0 && (
              <>
                <section aria-label="Ventas por día" className="mt-6">
                  <h2 className="text-lg font-semibold text-ink">Ventas por día</h2>
                  <div
                    role="img"
                    aria-label="Gráfico de ventas por día: cada barra es un día del rango"
                    className="mt-3 flex h-40 items-end gap-px"
                  >
                    {data.salesByDay.map((day) => (
                      <div key={day.date} className="flex h-full min-w-0 flex-1 items-end">
                        <div
                          className="w-full rounded-t bg-cmr"
                          style={{ height: `${Math.max(barHeight(day.totalCents, maxDayTotal), 2)}%` }}
                          title={`${formatDayLabel(day.date)} · ${formatMoney(day.totalCents)}`}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 overflow-x-auto rounded-tag border border-line bg-surface">
                    <table className="w-full text-sm">
                      <caption className="text-left text-xs text-muted">
                        Ventas por día del {formatDayLabel(data.range.from)} al {formatDayLabel(data.range.to)}
                      </caption>
                      <thead>
                        <tr className="text-left text-muted">
                          <th scope="col" className="px-3 py-2 font-semibold">
                            Día
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-semibold">
                            Ventas
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-semibold">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.salesByDay.map((day) => (
                          <tr key={day.date} className="border-t border-line">
                            <td className="px-3 py-2 tabular-nums text-ink">{formatDayLabel(day.date)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-ink">{day.salesCount}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-ink">
                              {formatMoney(day.totalCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section aria-label="Medios de pago" className="mt-6">
                  <h2 className="text-lg font-semibold text-ink">Medios de pago</h2>
                  <div className="mt-3 overflow-x-auto rounded-tag border border-line bg-surface">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted">
                          <th scope="col" className="px-3 py-2 font-semibold">
                            Medio
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-semibold">
                            Ventas
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-semibold">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byPaymentMethod.map((row) => (
                          <tr key={row.paymentMethod} className="border-t border-line">
                            <td className="px-3 py-2 text-ink">{paymentMethodLabel(row.paymentMethod)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-ink">{row.salesCount}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-ink">
                              {formatMoney(row.totalCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            <section aria-label="Productos más escaneados" className="mt-6">
              <h2 className="text-lg font-semibold text-ink">Más escaneados</h2>
              {data.topScanned.length === 0 ? (
                <p className="mt-2 text-base text-muted">Todavía no hay escaneos registrados.</p>
              ) : (
                <ol className="mt-3 flex flex-col gap-2">
                  {data.topScanned.map((row, index) => (
                    <li key={row.productId} className="flex items-center gap-3 rounded-tag border border-line bg-surface p-3">
                      <span className="w-6 shrink-0 text-right text-base font-bold tabular-nums text-muted">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-ink">{row.name}</p>
                        {row.barcode !== '' && (
                          <p className="truncate text-sm tabular-nums text-muted">{row.barcode}</p>
                        )}
                      </div>
                      <span className="text-base font-semibold tabular-nums text-ink">{row.scans}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section aria-label="Productos con poco stock" className="mt-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink">Productos con poco stock</h2>
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="dashboard-threshold" className="text-sm font-semibold text-ink">
                      Umbral
                    </label>
                    <input
                      id="dashboard-threshold"
                      type="number"
                      min={LOW_STOCK_MIN}
                      value={thresholdInput}
                      onChange={(event) => setThresholdInput(event.target.value)}
                      className={fieldClasses}
                    />
                  </div>
                  <button type="button" onClick={applyThreshold} className={secondaryButton}>
                    Aplicar
                  </button>
                </div>
              </div>

              {thresholdError !== null && (
                <p role="alert" className="mt-2 text-sm text-cmr">
                  {thresholdError}
                </p>
              )}

              {data.lowStock.length === 0 ? (
                <p className="mt-3 text-base text-muted">
                  No hay productos con stock igual o menor al umbral.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-tag border border-line bg-surface">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted">
                        <th scope="col" className="px-3 py-2 font-semibold">
                          Producto
                        </th>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          Código
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">
                          Stock
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lowStock.map((product) => (
                        <tr key={product.id} className="border-t border-line">
                          <td className="px-3 py-2 text-ink">{product.name}</td>
                          <td className="px-3 py-2 tabular-nums text-ink">{product.barcode}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink">{product.stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}