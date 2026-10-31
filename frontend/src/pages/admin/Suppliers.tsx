import { useEffect, useState, type FormEvent } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SupplierForm } from '../../features/suppliers/SupplierForm';
import { SupplierList } from '../../features/suppliers/SupplierList';
import type { SupplierFormOutput } from '../../features/suppliers/schema';
import { toastSuccess } from '../../lib/toast';
import { ApiError } from '../../services/api';
import { createSupplier, listSuppliers, setSupplierActive, updateSupplier } from '../../services/suppliers';
import type { Supplier } from '../../types/supplier';

const buttonClasses =
  'min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/** Formulario abierto: nuevo proveedor (null) o el proveedor que se edita. */
type FormState = { supplier: Supplier | null } | null;

export function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pending, setPending] = useState<Supplier | null>(null);
  const [formState, setFormState] = useState<FormState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load(term = search) {
    setLoading(true);
    setLoadError(null);

    try {
      setSuppliers(await listSuppliers(term));
    } catch (error) {
      setLoadError(toMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load('');
    // Solo la primera carga; las búsquedas se lanzan con el botón.
  }, []);

  function openForm(supplier: Supplier | null) {
    setFormError(null);
    setFormState({ supplier });
  }

  function closeForm() {
    setFormState(null);
    setFormError(null);
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    void load(search);
  }

  async function handleSave(values: SupplierFormOutput) {
    if (formState === null) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      if (formState.supplier === null) {
        await createSupplier(values);
        toastSuccess('Proveedor creado');
      } else {
        const { ruc: _ruc, ...fields } = values;
        await updateSupplier(formState.supplier.id, fields);
        toastSuccess('Proveedor actualizado');
      }

      closeForm();
      await load();
    } catch (error) {
      setFormError(toMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (pending === null) {
      return;
    }

    const supplier = pending;
    setBusyId(supplier.id);
    setLoadError(null);

    try {
      await setSupplierActive(supplier.id, { active: !supplier.active });
      setPending(null);
      toastSuccess(supplier.active ? 'Proveedor desactivado' : 'Proveedor activado');
      await load();
    } catch (error) {
      setPending(null);
      setLoadError(toMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <header>
        <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-primary" />
        <h1 className="mt-3 text-2xl font-bold text-ink">Proveedores</h1>
      </header>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-2" role="search">
          <div>
            <label htmlFor="supplier-search" className="block text-sm font-semibold text-ink">
              Buscar por razón social o RUC
            </label>
            <input
              id="supplier-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="mt-2 min-h-[44px] w-64 max-w-full rounded-button border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />
          </div>
          <button type="submit" className={`${buttonClasses} border border-line bg-surface text-ink`}>
            Buscar
          </button>
        </form>
        <button
          type="button"
          onClick={() => openForm(null)}
          className={`${buttonClasses} bg-button text-surface hover:bg-button-hover`}
        >
          Nuevo proveedor
        </button>
      </div>

      {formState !== null && (
        <SupplierForm
          key={formState.supplier?.id ?? 'nuevo'}
          supplier={formState.supplier}
          onSubmit={(values) => handleSave(values)}
          onCancel={closeForm}
          submitting={submitting}
          submitError={formError}
        />
      )}

      {loading && <p className="mt-4 text-base text-muted">Cargando proveedores…</p>}

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

      {!loading && loadError === null && suppliers.length === 0 && (
        <p className="mt-4 text-base text-muted">
          {search.trim() === ''
            ? 'Todavía no hay proveedores. Crea el primero con «Nuevo proveedor».'
            : 'No hay proveedores que coincidan con la búsqueda.'}
        </p>
      )}

      {!loading && loadError === null && suppliers.length > 0 && (
        <div className="mt-4">
          <SupplierList
            suppliers={suppliers}
            busyId={busyId}
            onEdit={(supplier) => openForm(supplier)}
            onAsk={setPending}
          />
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.active === true ? 'Desactivar proveedor' : 'Activar proveedor'}
        message={
          pending === null ? '' : `¿${pending.active ? 'Desactivar' : 'Activar'} a «${pending.businessName}»?`
        }
        confirmLabel={pending?.active === true ? 'Desactivar' : 'Activar'}
        busy={busyId !== null && busyId === pending?.id}
        onConfirm={() => void handleConfirm()}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
