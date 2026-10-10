import { useEffect, useMemo, useState } from 'react';
import { CampaignForm } from '../../features/campaigns/CampaignForm';
import { CampaignList } from '../../features/campaigns/CampaignList';
import { campaignToForm } from '../../features/campaigns/converters';
import type { CampaignFormValues } from '../../features/campaigns/schema';
import { buildCampaignBody } from '../../lib/campaignValues';
import { readSession } from '../../lib/session';
import { ApiError } from '../../services/api';
import {
  createCampaign,
  listCampaigns,
  setCampaignActive,
  updateCampaign,
} from '../../services/campaigns';
import { listCategories } from '../../services/categories';
import { fetchAllProducts } from '../../services/products';
import type { Campaign } from '../../types/campaign';
import type { Category } from '../../types/category';
import type { ProductListItem } from '../../types/product';

const buttonClasses =
  'min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

export function Campaigns() {
  const session = readSession();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);

    try {
      const [campaignRecords, categoryRecords, productRecords] = await Promise.all([
        listCampaigns(),
        listCategories(true),
        fetchAllProducts(),
      ]);
      setCampaigns(campaignRecords);
      setCategories(categoryRecords);
      setProducts(productRecords);
    } catch (error) {
      setLoadError(toMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const knownProducts = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const productNames = useMemo(
    () => new Map(products.map((product) => [product.id, product.name])),
    [products],
  );
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const activeCategories = useMemo(
    () => categories.filter((category) => category.active),
    [categories],
  );

  function openForm(campaign: Campaign | null) {
    setEditing(campaign);
    setFormError(null);
    setNotice(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setFormError(null);
  }

  async function handleToggleActive(campaign: Campaign, active: boolean) {
    setBusyId(campaign.id);
    setLoadError(null);

    try {
      await setCampaignActive(campaign.id, { active });
      await load();
    } catch (error) {
      setLoadError(toMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSave(values: CampaignFormValues) {
    setSubmitting(true);
    setFormError(null);
    setNotice(null);

    try {
      const body = buildCampaignBody(values);

      if (editing === null) {
        await createCampaign(body);
      } else {
        await updateCampaign(editing.id, body);
      }

      setNotice('Campaña guardada');
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
            <h1 className="mt-3 text-2xl font-bold text-ink">Campañas</h1>
          </div>
        </header>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Campañas existentes</h2>
          <button
            type="button"
            onClick={() => openForm(null)}
            className={`${buttonClasses} bg-ink text-surface`}
          >
            Nueva campaña
          </button>
        </div>

        {loading && <p className="mt-4 text-base text-muted">Cargando campañas…</p>}

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

        {!loading && loadError === null && campaigns.length === 0 && (
          <p className="mt-4 text-base text-muted">
            Todavía no hay campañas. Crea la primera con «Nueva campaña».
          </p>
        )}

        {!loading && loadError === null && campaigns.length > 0 && (
          <div className="mt-4">
            <CampaignList
              campaigns={campaigns}
              productNames={productNames}
              categoryNames={categoryNames}
              busyId={busyId}
              onEdit={(campaign) => openForm(campaign)}
              onToggleActive={(campaign, active) => void handleToggleActive(campaign, active)}
            />
          </div>
        )}

        {notice !== null && (
          <p role="status" className="mt-4 rounded-tag bg-saving px-3 py-2 text-sm text-surface">
            {notice}
          </p>
        )}

        {showForm && (
          <CampaignForm
            key={editing === null ? 'nueva' : editing.id}
            initial={editing === null ? undefined : campaignToForm(editing)}
            knownProducts={knownProducts}
            categories={activeCategories}
            affectedProducts={editing?.affectedProducts}
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
