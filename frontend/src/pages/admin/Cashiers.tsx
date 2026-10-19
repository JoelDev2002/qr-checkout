import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CashierForm } from '../../features/users/CashierForm';
import { CashierList } from '../../features/users/CashierList';
import { readSession } from '../../lib/session';
import { toastSuccess } from '../../lib/toast';
import { ApiError } from '../../services/api';
import { createCashier, listCashiers, setCashierActive } from '../../services/users';
import type { CashierFormValues } from '../../features/users/schema';
import type { Cashier } from '../../types/user';

const buttonClasses =
  'min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

export function Cashiers() {
  const session = readSession();
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pending, setPending] = useState<Cashier | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);

    try {
      setCashiers(await listCashiers());
    } catch (error) {
      setLoadError(toMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openForm() {
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setFormError(null);
  }

  async function handleConfirm() {
    if (pending === null) {
      return;
    }

    const cashier = pending;
    setBusyId(cashier.id);
    setLoadError(null);

    try {
      await setCashierActive(cashier.id, { active: !cashier.active });
      setPending(null);
      toastSuccess(cashier.active ? 'Cajero desactivado' : 'Cajero activado');
      await load();
    } catch (error) {
      setPending(null);
      setLoadError(toMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSave(values: CashierFormValues) {
    setSubmitting(true);
    setFormError(null);

    try {
      await createCashier(values);
      toastSuccess('Cajero creado');
      closeForm();
      await load();
    } catch (error) {
      setFormError(toMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (session === null) {
    return null;
  }

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-primary" />
          <h1 className="mt-3 text-2xl font-bold text-ink">Cajeros</h1>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Cajeros existentes</h2>
        <button type="button" onClick={openForm} className={`${buttonClasses} bg-button text-surface hover:bg-button-hover`}>
          Nuevo cajero
        </button>
      </div>

      {loading && <p className="mt-4 text-base text-muted">Cargando cajeros…</p>}

      {!loading && loadError !== null && (
        <div role="alert" className="mt-4 rounded-tag border border-cmr px-3 py-2">
          <p className="text-sm text-cmr">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className={`${buttonClasses} mt-2 border border-line bg-surface text-ink`}
          >
            Reintentar
          </button>
        </div>
      )}

      {!loading && loadError === null && cashiers.length === 0 && (
        <p className="mt-4 text-base text-muted">
          Todavía no hay cajeros. Crea el primero con «Nuevo cajero».
        </p>
      )}

      {!loading && loadError === null && cashiers.length > 0 && (
        <div className="mt-4">
          <CashierList
            cashiers={cashiers}
            busyId={busyId}
            onAsk={setPending}
          />
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.active === true ? 'Desactivar cajero' : 'Activar cajero'}
        message={pending === null ? '' : `¿${pending.active ? 'Desactivar' : 'Activar'} a «${pending.name}»?`}
        confirmLabel={pending?.active === true ? 'Desactivar' : 'Activar'}
        busy={busyId !== null && busyId === pending?.id}
        onConfirm={() => void handleConfirm()}
        onCancel={() => setPending(null)}
      />

      {showForm && (
        <CashierForm
          onSubmit={(values) => handleSave(values)}
          onCancel={closeForm}
          submitting={submitting}
          submitError={formError}
        />
      )}
    </div>
  );
}
