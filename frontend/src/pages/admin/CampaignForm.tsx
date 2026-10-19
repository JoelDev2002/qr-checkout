import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CampaignForm } from '../../features/campaigns/CampaignForm';
import { campaignToForm } from '../../features/campaigns/converters';
import type { CampaignFormValues } from '../../features/campaigns/schema';
import { buildCampaignBody } from '../../lib/campaignValues';
import { readSession } from '../../lib/session';
import { toastSuccess } from '../../lib/toast';
import { ApiError } from '../../services/api';
import {
  createCampaign,
  listCampaigns,
  updateCampaign,
} from '../../services/campaigns';
import { listCategories } from '../../services/categories';
import { fetchAllProducts } from '../../services/products';
import type { Campaign } from '../../types/campaign';
import type { Category } from '../../types/category';
import type { ProductListItem } from '../../types/product';

const buttonClasses =
  'min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

export function CampaignFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const session = readSession();
  const editingId = id === undefined || id === '' ? null : Number(id);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setLoadError(null);

    Promise.all([listCampaigns(), listCategories(true), fetchAllProducts()])
      .then(([campaignRecords, categoryRecords, productRecords]) => {
        if (cancelled) {
          return;
        }

        setCampaigns(campaignRecords);
        setCategories(categoryRecords);
        setProducts(productRecords);
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
    () => (editingId === null ? null : campaigns.find((campaign) => campaign.id === editingId) ?? null),
    [campaigns, editingId],
  );
  const knownProducts = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const activeCategories = useMemo(
    () => categories.filter((category) => category.active),
    [categories],
  );

  async function handleSave(values: CampaignFormValues) {
    setSubmitting(true);
    setFormError(null);

    try {
      const body = buildCampaignBody(values);

      if (editing === null) {
        await createCampaign(body);
      } else {
        await updateCampaign(editing.id, body);
      }

      toastSuccess('Campaña guardada');
      navigate('/admin/campaigns');
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
          <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-primary" />
          <h1 className="mt-3 text-2xl font-bold text-ink">
            {editingId === null ? 'Nueva campaña' : 'Editar campaña'}
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
          <p className="text-sm text-cmr">No encontramos esta campaña.</p>
          <Link
            to="/admin/campaigns"
            className={`${buttonClasses} mt-2 inline-flex border border-line bg-surface text-ink`}
          >
            Volver a la lista
          </Link>
        </div>
      )}

      {!loading && loadError === null && (editingId === null || editing !== null) && (
        <CampaignForm
          key={editing === null ? 'nueva' : editing.id}
          initial={editing === null ? undefined : campaignToForm(editing)}
          knownProducts={knownProducts}
          categories={activeCategories}
          affectedProducts={editing?.affectedProducts}
          onSubmit={(values) => handleSave(values)}
          onCancel={() => navigate('/admin/campaigns')}
          submitting={submitting}
          submitError={formError}
        />
      )}
    </div>
  );
}
