import { useEffect, useState } from 'react';
import { CategoryForm } from '../../features/categories/CategoryForm';
import { categoryToForm, fieldFormToCreate, fieldFormToUpdate } from '../../features/categories/converters';
import { CategoryList } from '../../features/categories/CategoryList';
import { readSession } from '../../lib/session';
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
import type { CategoryFormValues } from '../../features/categories/schema';

const buttonClasses =
  'min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

export function Categories() {
  const session = readSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  function openForm(category: Category | null) {
    setEditing(category);
    setFormError(null);
    setNotice(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setFormError(null);
  }

  async function handleToggleActive(category: Category, active: boolean) {
    setBusyId(category.id);
    setLoadError(null);

    try {
      await setCategoryActive(category.id, { active });
      await load();
    } catch (error) {
      setLoadError(toMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSave(values: CategoryFormValues) {
    setSubmitting(true);
    setFormError(null);
    setNotice(null);

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

      setNotice('Categoría guardada');
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
    <main className="min-h-dvh bg-paper px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div>
            <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-cmr" />
            <h1 className="mt-3 text-2xl font-bold text-ink">Categorías</h1>
          </div>
        </header>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Categorías existentes</h2>
          <button
            type="button"
            onClick={() => openForm(null)}
            className={`${buttonClasses} bg-ink text-surface`}
          >
            Nueva categoría
          </button>
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
              onEdit={(category) => openForm(category)}
              onToggleActive={(category, active) => void handleToggleActive(category, active)}
            />
          </div>
        )}

        {notice !== null && (
          <p role="status" className="mt-4 rounded-tag bg-saving px-3 py-2 text-sm text-surface">
            {notice}
          </p>
        )}

        {showForm && (
          <CategoryForm
            key={editing === null ? 'nueva' : editing.id}
            initial={editing === null ? undefined : categoryToForm(editing)}
            onSubmit={(values) => handleSave(values)}
            onCancel={closeForm}
            submitting={submitting}
            submitError={formError}
          />
        )}
      </div>
    </main>
  );
}