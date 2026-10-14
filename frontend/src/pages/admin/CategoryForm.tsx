import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CategoryForm } from '../../features/categories/CategoryForm';
import {
  categoryToForm,
  fieldFormToCreate,
  fieldFormToUpdate,
} from '../../features/categories/converters';
import type { CategoryFormValues } from '../../features/categories/schema';
import { readSession } from '../../lib/session';
import { toastSuccess } from '../../lib/toast';
import { ApiError } from '../../services/api';
import {
  createCategory,
  createField,
  listCategories,
  setCategoryActive,
  setFieldActive,
  updateCategory,
  updateField,
} from '../../services/categories';
import type { Category } from '../../types/category';

const buttonClasses =
  'min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

export function CategoryFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const session = readSession();
  const editingId = id === undefined || id === '' ? null : Number(id);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setLoadError(null);

    listCategories(true)
      .then((records) => {
        if (!cancelled) {
          setCategories(records);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(toMessage(error));
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
  }, [retryKey]);

  const editing = useMemo(
    () => (editingId === null ? null : categories.find((category) => category.id === editingId) ?? null),
    [categories, editingId],
  );

  async function handleSave(values: CategoryFormValues) {
    setSubmitting(true);
    setFormError(null);

    try {
      const category = editing
        ? await updateCategory(editing.id, { name: values.name })
        : await createCategory({ name: values.name });

      if (category.active !== values.active) {
        await setCategoryActive(category.id, { active: values.active });
      }

      const existing = new Map(category.fields.map((field) => [field.id, field]));

      for (const [index, row] of values.fields.entries()) {
        if (row.id === undefined) {
          const created = await createField(category.id, fieldFormToCreate(row, index));

          if (!row.active) {
            await setFieldActive(category.id, created.id, { active: false });
          }
        } else {
          await updateField(category.id, row.id, fieldFormToUpdate(row, index));
          const original = existing.get(row.id);

          if (original !== undefined && row.active !== original.active) {
            await setFieldActive(category.id, row.id, { active: row.active });
          }
        }
      }

      toastSuccess('Categoría guardada');
      navigate('/admin/categories');
    } catch (error) {
      setFormError(toMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (session === null) {
    return null;
  }

  const notFound = !loading && loadError === null && editingId !== null && editing === null;

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-cmr" />
          <h1 className="mt-3 text-2xl font-bold text-ink">
            {editingId === null ? 'Nueva categoría' : 'Editar categoría'}
          </h1>
        </div>
      </header>

      {loading && <p className="mt-6 text-base text-muted">Cargando…</p>}

      {!loading && loadError !== null && (
        <div role="alert" className="mt-6 rounded-tag border border-cmr px-3 py-2">
          <p className="text-sm text-cmr">{loadError}</p>
          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
            className={`${buttonClasses} mt-2 border border-line bg-surface text-ink`}
          >
            Reintentar
          </button>
        </div>
      )}

      {notFound && (
        <div role="alert" className="mt-6 rounded-tag border border-cmr px-3 py-2">
          <p className="text-sm text-cmr">No encontramos esta categoría.</p>
          <Link
            to="/admin/categories"
            className={`${buttonClasses} mt-2 inline-flex border border-line bg-surface text-ink`}
          >
            Volver a la lista
          </Link>
        </div>
      )}

      {!loading && loadError === null && (editingId === null || editing !== null) && (
        <CategoryForm
          key={editing === null ? 'nueva' : editing.id}
          initial={editing === null ? undefined : categoryToForm(editing)}
          onSubmit={(values) => handleSave(values)}
          onCancel={() => navigate('/admin/categories')}
          submitting={submitting}
          submitError={formError}
        />
      )}
    </div>
  );
}
