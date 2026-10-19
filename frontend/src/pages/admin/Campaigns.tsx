import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CampaignList } from '../../features/campaigns/CampaignList';
import { readSession } from '../../lib/session';
import { toastSuccess } from '../../lib/toast';
import { ApiError } from '../../services/api';
import { listCampaigns, setCampaignActive } from '../../services/campaigns';
import { listCategories } from '../../services/categories';
import { fetchAllProducts } from '../../services/products';
import type { Campaign } from '../../types/campaign';
import type { Category } from '../../types/category';
import type { ProductListItem } from '../../types/product';

const buttonClasses =
  'flex items-center min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

export function Campaigns() {
  const session = readSession();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pending, setPending] = useState<Campaign | null>(null);

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

  const productNames = useMemo(
    () => new Map(products.map((product) => [product.id, product.name])),
    [products],
  );
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  async function handleConfirm() {
    if (pending === null) {
      return;
    }

    const campaign = pending;
    setBusyId(campaign.id);
    setLoadError(null);

    try {
      await setCampaignActive(campaign.id, { active: !campaign.active });
      setPending(null);
      toastSuccess(campaign.active ? 'Campaña desactivada' : 'Campaña activada');
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
          <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-primary" />
          <h1 className="mt-3 text-2xl font-bold text-ink">Campañas</h1>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Campañas existentes</h2>
        <Link to="/admin/campaigns/new" className={`${buttonClasses} bg-button text-surface hover:bg-button-hover`}>
          Nueva campaña
        </Link>
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
            onEdit={(campaign) => navigate(`/admin/campaigns/${campaign.id}`)}
            onAsk={setPending}
          />
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.active === true ? 'Desactivar campaña' : 'Activar campaña'}
        message={
          pending === null
            ? ''
            : `¿${pending.active ? 'Desactivar' : 'Activar'} la campaña «${pending.name}»?`
        }
        confirmLabel={pending?.active === true ? 'Desactivar' : 'Activar'}
        busy={busyId !== null && busyId === pending?.id}
        onConfirm={() => void handleConfirm()}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
