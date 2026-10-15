import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CategoryList } from '../../features/categories/CategoryList';
import { readSession } from '../../lib/session';
import { toastSuccess } from '../../lib/toast';
import { ApiError } from '../../services/api';
import { listCategories, setCategoryActive } from '../../services/categories';
import type { Category } from '../../types/category';

const buttonClasses =
  'flex items-center min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

export function Categories() {
  const session = readSession();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pending, setPending] = useState<Category | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);

    try {
      setCategories(await listCategories(true));
    } catch (error) {
      setLoadError(toMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleConfirm() {
    if (pending === null) {
      return;
    }

    const category = pending;
    setBusyId(category.id);
    setLoadError(null);

    try {
      await setCategoryActive(category.id, { active: !category.active });
      setPending(null);
      toastSuccess(category.active ? 'Categoría desactivada' : 'Categoría activada');
      await load();
    } catch (error) {
      setPending(null);
      setLoadError(toMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  if (session === null) {
    return null;
  }

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-cmr" />
          <h1 className="mt-3 text-2xl font-bold text-ink">Categorías</h1>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Categorías existentes</h2>
        <Link to="/admin/categories/new" className={`${buttonClasses} bg-ink text-surface`}>
          Nueva categoría
        </Link>
      </div>

      {loading && <p className="mt-4 text-base text-muted">Cargando categorías…</p>}

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

      {!loading && loadError === null && categories.length === 0 && (
        <p className="mt-4 text-base text-muted">
          Todavía no hay categorías. Crea la primera con «Nueva categoría».
        </p>
      )}

      {!loading && loadError === null && categories.length > 0 && (
        <div className="mt-4">
          <CategoryList
            categories={categories}
            busyId={busyId}
            onEdit={(category) => navigate(`/admin/categories/${category.id}`)}
            onAsk={setPending}
          />
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.active === true ? 'Desactivar categoría' : 'Activar categoría'}
        message={
          pending === null
            ? ''
            : `¿${pending.active ? 'Desactivar' : 'Activar'} la categoría «${pending.name}»?`
        }
        confirmLabel={pending?.active === true ? 'Desactivar' : 'Activar'}
        busy={busyId !== null && busyId === pending?.id}
        onConfirm={() => void handleConfirm()}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
