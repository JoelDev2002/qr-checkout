import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ProductForm } from '../../features/products/ProductForm';
import type { ProductFormMode, ProductFormValues } from '../../features/products/schema';
import {
  buildCreateBody,
  buildUpdateBody,
  productToDraft,
} from '../../lib/productForm';
import { clearSession, readSession } from '../../lib/session';
import { ApiError } from '../../services/api';
import { listCategories } from '../../services/categories';
import {
  createProduct,
  findProductByBarcode,
  getProduct,
  updateProduct,
} from '../../services/products';
import type { Category } from '../../types/category';
import type { AdminProduct } from '../../types/product';

const buttonClasses =
  'min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

/** Sin precio todavía: la vista previa y la validación esperan a que el admin escriba. */
function emptyDraft(): ProductFormValues {
  return {
    barcode: '',
    name: '',
    brand: '',
    color: '',
    categoryId: '',
    originalPrice: '',
    hasCmrDiscount: false,
    cmrPercent: '',
    stock: '',
    maxPerPurchase: '10',
    attributes: {},
  };
}

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

export function ProductFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const session = readSession();
  const editingId = id === undefined || id === '' ? null : Number(id);
  const mode: ProductFormMode = editingId === null ? 'create' : 'edit';

  const [categories, setCategories] = useState<Category[]>([]);
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<AdminProduct | null>(null);
  const [conflict, setConflict] = useState<{ message: string; values: ProductFormValues } | null>(
    null,
  );
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setLoadError(null);

    Promise.all([listCategories(), editingId === null ? Promise.resolve(null) : getProduct(editingId)])
      .then(([categoryRecords, productRecord]) => {
        if (cancelled) {
          return;
        }

        setCategories(categoryRecords);
        setProduct(productRecord);
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
  }, [editingId, retryKey]);

  const defaultValues = useMemo(() => {
    if (mode === 'edit' && product !== null) {
      const category = categories.find((candidate) => candidate.id === product.categoryId);

      return productToDraft(product, category?.fields ?? []);
    }

    return emptyDraft();
  }, [mode, product, categories]);

  function fieldsOf(categoryId: string) {
    const category = categories.find(
      (candidate) => String(candidate.id) === categoryId.trim(),
    );

    return category?.fields ?? [];
  }

  async function handleSubmit(values: ProductFormValues, discardAttributes = false) {
    setSubmitting(true);
    setSubmitError(null);
    setDuplicate(null);
    setConflict(null);

    try {
      const fields = fieldsOf(values.categoryId);

      if (mode === 'create') {
        await createProduct(buildCreateBody(values, fields));
      } else if (editingId !== null) {
        await updateProduct(editingId, buildUpdateBody(values, fields, { discardAttributes }));
      }

      navigate('/admin/products', { state: { notice: 'Producto guardado' } });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setSubmitError('Ocurrió un error inesperado. Inténtalo de nuevo.');
        return;
      }

      // Código repetido: se ofrece editar el producto que ya usa ese código.
      if (error.code === 'DUPLICATE_BARCODE' && mode === 'create') {
        const barcode = values.barcode.trim();
        const found = await findProductByBarcode(barcode).catch(() => null);
        const match =
          found?.items.find((item) => item.barcode === barcode) ?? found?.items[0] ?? null;

        if (match === null) {
          setSubmitError(error.message);
        } else {
          setDuplicate(match);
        }

        return;
      }

      // Cambiar de categoría sin descartar los valores que la nueva no tiene (RN-15).
      if (error.code === 'CONFLICT' && mode === 'edit') {
        setConflict({ message: error.message, values });
        return;
      }

      setSubmitError(error.message);
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
            <h1 className="mt-3 text-2xl font-bold text-ink">
              {mode === 'create' ? 'Nuevo producto' : 'Editar producto'}
            </h1>
            <p className="mt-1 text-base text-muted">
              {session.user.name} · Administrador
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin/products"
              className={`${buttonClasses} flex min-h-[44px] items-center border border-line bg-surface text-ink`}
            >
              Volver a la lista
            </Link>
            <button
              type="button"
              onClick={() => {
                clearSession();
                navigate('/login', { replace: true });
              }}
              className={`${buttonClasses} border border-line bg-surface text-ink`}
            >
              Cerrar sesión
            </button>
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

        {!loading && loadError === null && mode === 'edit' && product === null && (
          <div role="alert" className="mt-6 rounded-tag border border-cmr px-3 py-2">
            <p className="text-sm text-cmr">No encontramos este producto.</p>
            <Link
              to="/admin/products"
              className={`${buttonClasses} mt-2 inline-flex border border-line bg-surface text-ink`}
            >
              Volver a la lista
            </Link>
          </div>
        )}

        {!loading && loadError === null && (mode === 'create' || product !== null) && (
          <ProductForm
            mode={mode}
            product={product ?? undefined}
            categories={categories}
            defaultValues={defaultValues}
            onSubmit={(values) => handleSubmit(values)}
            onCancel={() => navigate('/admin/products')}
            submitting={submitting}
            submitError={submitError}
            duplicate={duplicate}
            conflict={conflict?.message ?? null}
            onConfirmDiscard={() => {
              const pending = conflict;

              if (pending !== null) {
                void handleSubmit(pending.values, true);
              }
            }}
            onCancelDiscard={() => setConflict(null)}
          />
        )}
      </div>
    </main>
  );
}
