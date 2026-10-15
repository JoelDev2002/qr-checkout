import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import {
  formatAdjustmentDateTime,
  formatSignedDelta,
  resultingStock,
  validateDelta,
  validateReason,
  wouldGoNegative,
} from '../../lib/stockAdjustment';
import { toastSuccess } from '../../lib/toast';
import { ApiError } from '../../services/api';
import { adjustStock, listStockAdjustments } from '../../services/products';
import type { StockAdjustment } from '../../types/product';

const HISTORY_PAGE_SIZE = 10;

const inputClasses =
  'mt-2 min-h-[44px] w-full rounded-button border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

const buttonClasses =
  'min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

const secondaryButton = `${buttonClasses} flex min-h-[44px] items-center border border-line bg-surface text-ink`;

/** Datos mínimos del producto que necesita el ajuste: el panel pasa menos campos que el listado. */
export type StockAdjustmentProduct = {
  id: number;
  name: string;
  stock: number;
  active?: boolean;
};

type StockAdjustmentModalProps = {
  product: StockAdjustmentProduct;
  /** El stock nuevo que devolvió el servidor, para actualizar la lista o el formulario. */
  onChanged: (stock: number) => void;
  onClose: () => void;
};

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/** Historial de un ajuste: fecha, cantidad con signo, motivo y quién lo hizo (RN-13). */
function AdjustmentRows({ history }: { history: StockAdjustment[] }) {
  return (
    <>
      {history.map((adjustment) => (
        <tr key={adjustment.id} className="border-t border-line">
          <td className="p-2 tabular-nums">{formatAdjustmentDateTime(adjustment.createdAt)}</td>
          <td
            className={`p-2 text-right font-bold tabular-nums ${
              adjustment.delta > 0 ? 'text-saving' : adjustment.delta < 0 ? 'text-cmr' : 'text-ink'
            }`}
          >
            {formatSignedDelta(adjustment.delta)}
          </td>
          <td className="p-2">{adjustment.reason}</td>
          <td className="p-2">{adjustment.userName}</td>
        </tr>
      ))}
    </>
  );
}

function AdjustmentCards({ history }: { history: StockAdjustment[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {history.map((adjustment) => (
        <li key={adjustment.id} className="rounded-tag border border-line bg-paper p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted">{formatAdjustmentDateTime(adjustment.createdAt)}</span>
            <span
              className={`font-bold tabular-nums ${
                adjustment.delta > 0 ? 'text-saving' : adjustment.delta < 0 ? 'text-cmr' : 'text-ink'
              }`}
            >
              {formatSignedDelta(adjustment.delta)}
            </span>
          </div>
          <p className="mt-1 text-base text-ink">{adjustment.reason}</p>
          <p className="mt-1 text-sm text-muted">{adjustment.userName}</p>
        </li>
      ))}
    </ul>
  );
}

/** Modal para ajustar el stock con motivo y ver el historial paginado (DESIGN §4, admin punto 5). */
export function StockAdjustmentModal({ product, onChanged, onClose }: StockAdjustmentModalProps) {
  const [stock, setStock] = useState(product.stock);
  const [deltaInput, setDeltaInput] = useState('');
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [history, setHistory] = useState<StockAdjustment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const delta = validateDelta(deltaInput);
  const reasonValidation = validateReason(reason);
  const resulting = delta.ok ? resultingStock(stock, delta.value) : null;
  const negative = delta.ok ? wouldGoNegative(stock, delta.value) : false;
  const formReady =
    delta.ok && reasonValidation.ok && !negative && !submitting;

  const deltaError =
    deltaInput !== '' ? (!delta.ok ? delta.message : null) : attempted ? 'La cantidad del ajuste es obligatoria.' : null;
  const reasonError =
    reason !== '' ? (!reasonValidation.ok ? reasonValidation.message : null) : attempted ? 'El motivo del ajuste es obligatorio.' : null;

  useEffect(() => {
    let cancelled = false;

    setLoadingHistory(true);
    setHistoryError(null);

    listStockAdjustments(product.id, page, HISTORY_PAGE_SIZE)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setHistory(result.items);
        setTotal(result.total);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setHistoryError(toMessage(caught));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingHistory(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [product.id, page, historyKey]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);

    if (!delta.ok || !reasonValidation.ok) {
      return;
    }

    if (negative) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const result = await adjustStock(product.id, {
        delta: delta.value,
        reason: reasonValidation.value,
      });

      setStock(result.stock);
      setDeltaInput('');
      setReason('');
      setAttempted(false);
      setPage(1);
      setHistoryKey((key) => key + 1);
      toastSuccess('Stock ajustado', `Quedó en ${result.stock} unidades.`);
      onChanged(result.stock);
    } catch (error) {
      setSubmitError(toMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const firstShown = total === 0 ? 0 : (page - 1) * HISTORY_PAGE_SIZE + 1;
  const lastShown = Math.min(page * HISTORY_PAGE_SIZE, total);

  return (
    <Modal open title="Ajustar stock" onClose={onClose} busy={submitting} size="lg">
      <p className="mt-1 text-base text-muted">
        {product.name}
        {product.active === false && ' · Este producto está inactivo y su stock también se puede corregir'}
      </p>

      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="mt-4 max-w-md">
        <p className="text-base text-ink">
          Stock actual: <span className="font-bold tabular-nums">{stock}</span>
        </p>

        <div className="mt-3">
          <label htmlFor="adjust-delta" className="block text-sm font-semibold text-ink">
            Cantidad a sumar o restar
          </label>
          <div className="flex items-center gap-2">
            <input
              id="adjust-delta"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ej.: 5 o -3"
              value={deltaInput}
              onChange={(event) => setDeltaInput(event.target.value)}
              aria-invalid={deltaError !== null}
              disabled={submitting}
              className={inputClasses}
            />
            <span aria-hidden="true" className="mt-2 text-base font-semibold text-muted">
              uds.
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">Un número entero: el signo suma o resta unidades.</p>
          {deltaError !== null && <p className="mt-1 text-sm text-cmr">{deltaError}</p>}
          {delta.ok && resulting !== null && !negative && (
            <p className="mt-1 text-sm font-semibold text-ink">Quedará en {resulting}.</p>
          )}
          {negative && (
            <p role="alert" className="mt-1 text-sm font-semibold text-warn">
              El stock no puede quedar en negativo.
            </p>
          )}
        </div>

        <div className="mt-3">
          <label htmlFor="adjust-reason" className="block text-sm font-semibold text-ink">
            Motivo
          </label>
          <textarea
            id="adjust-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={reasonError !== null}
            disabled={submitting}
            rows={3}
            className={inputClasses}
          />
          <p className="mt-1 text-sm text-muted">El motivo es obligatorio y queda registrado.</p>
          {reasonError !== null && <p className="mt-1 text-sm text-cmr">{reasonError}</p>}
        </div>

        {submitError !== null && (
          <p role="alert" className="mt-3 rounded-tag border border-cmr px-3 py-2 text-sm text-cmr">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={!formReady}
          className={`${buttonClasses} mt-4 bg-ink text-surface`}
        >
          {submitting ? 'Ajustando…' : 'Ajustar stock'}
        </button>
      </form>

      <div className="mt-6">
        <h4 className="text-base font-semibold text-ink">Historial de ajustes</h4>
        <p className="mt-1 text-sm text-muted">Cada ajuste queda registrado con su motivo (RN-13).</p>

        {loadingHistory && page === 1 && history.length === 0 && (
          <p role="status" className="mt-3 text-base text-muted">
            Cargando historial…
          </p>
        )}

        {!loadingHistory && historyError !== null && (
          <div role="alert" className="mt-3 rounded-tag border border-cmr px-3 py-2">
            <p className="text-sm text-cmr">{historyError}</p>
            <button
              type="button"
              onClick={() => setHistoryKey((key) => key + 1)}
              className={`${secondaryButton} mt-2`}
            >
              Reintentar
            </button>
          </div>
        )}

        {!loadingHistory && historyError === null && total === 0 && (
          <p className="mt-3 text-base text-muted">Todavía no hay ajustes registrados.</p>
        )}

        {!loadingHistory && historyError === null && total > 0 && (
          <>
            <div className="mt-3 hidden overflow-x-auto rounded-tag border border-line sm:block">
              <table className="w-full min-w-[36rem] border-collapse bg-surface text-base">
                <caption className="sr-only">Historial de ajustes de {product.name}</caption>
                <thead>
                  <tr className="bg-paper text-sm font-semibold text-ink">
                    <th scope="col" className="p-2 text-left">
                      Fecha
                    </th>
                    <th scope="col" className="p-2 text-right">
                      Cantidad
                    </th>
                    <th scope="col" className="p-2 text-left">
                      Motivo
                    </th>
                    <th scope="col" className="p-2 text-left">
                      Usuario
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <AdjustmentRows history={history} />
                </tbody>
              </table>
            </div>

            <div className="mt-3 sm:hidden">
              <AdjustmentCards history={history} />
            </div>

            <nav aria-label="Paginación del historial" className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                Mostrando {firstShown}–{lastShown} de {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => current - 1)}
                  disabled={page <= 1 || loadingHistory}
                  className={secondaryButton}
                >
                  Anterior
                </button>
                <span className="text-sm text-ink">
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={page >= totalPages || loadingHistory}
                  className={secondaryButton}
                >
                  Siguiente
                </button>
              </div>
            </nav>
          </>
        )}

        {loadingHistory && page > 1 && (
          <p role="status" className="mt-3 text-base text-muted">
            Cargando historial…
          </p>
        )}
      </div>
    </Modal>
  );
}