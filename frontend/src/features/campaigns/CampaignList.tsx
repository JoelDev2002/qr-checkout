import { formatMoney } from '../../lib/money';
import { formatBps } from '../../lib/campaignValues';
import type { Campaign } from '../../types/campaign';
import { CAMPAIGN_STATUS_CLASSES, CAMPAIGN_STATUS_TEXT, SCOPE_TEXT } from './status';

const buttonClasses =
  'min-h-[44px] rounded-button border border-line bg-surface px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50';

const MAX_NAMES_SHOWN = 3;

type CampaignListProps = {
  campaigns: Campaign[];
  productNames: Map<number, string>;
  categoryNames: Map<number, string>;
  busyId: number | null;
  onToggleActive: (campaign: Campaign, active: boolean) => void;
  onEdit: (campaign: Campaign) => void;
};

function joinNames(ids: number[], names: Map<number, string>): string {
  const labels = ids.map((id) => names.get(id) ?? `#${id}`);
  const visible = labels.slice(0, MAX_NAMES_SHOWN).join(', ');

  return labels.length > MAX_NAMES_SHOWN
    ? `${visible} +${labels.length - MAX_NAMES_SHOWN} más`
    : visible;
}

function scopeText(campaign: Campaign, productNames: Map<number, string>, categoryNames: Map<number, string>): string {
  if (campaign.scope === 'PRODUCTS') {
    return `Productos: ${joinNames(campaign.productIds, productNames)}`;
  }

  if (campaign.scope === 'CATEGORIES') {
    return `Categorías: ${joinNames(campaign.categoryIds, categoryNames)}`;
  }

  return SCOPE_TEXT.STORE;
}

function discountText(campaign: Campaign): string {
  return campaign.discountType === 'PERCENT'
    ? formatBps(campaign.discountValue)
    : formatMoney(campaign.discountValue);
}

type CampaignListRowProps = {
  campaign: Campaign;
  productNames: Map<number, string>;
  categoryNames: Map<number, string>;
  busy: boolean;
  onToggleActive: (campaign: Campaign, active: boolean) => void;
  onEdit: (campaign: Campaign) => void;
};

function CampaignListRow({
  campaign,
  productNames,
  categoryNames,
  busy,
  onToggleActive,
  onEdit,
}: CampaignListRowProps) {
  return (
    <tr className="border-t border-line">
      <td className="p-2">{campaign.name}</td>
      <td className="p-2">{scopeText(campaign, productNames, categoryNames)}</td>
      <td className="p-2">{discountText(campaign)}</td>
      <td className="p-2 text-center">{campaign.priority}</td>
      <td className="p-2">
        <span
          className={`inline-block rounded-tag border px-2 py-1 text-sm font-semibold ${CAMPAIGN_STATUS_CLASSES[campaign.status]}`}
        >
          {CAMPAIGN_STATUS_TEXT[campaign.status]}
        </span>
      </td>
      <td className="p-2">
        Aplica hoy a {campaign.affectedProducts} {campaign.affectedProducts === 1 ? 'producto' : 'productos'}
      </td>
      <td className="p-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={campaign.active}
            aria-label={`Campaña ${campaign.name}: ${campaign.active ? 'activa' : 'inactiva'}`}
            onClick={() => onToggleActive(campaign, !campaign.active)}
            disabled={busy}
            className={`${buttonClasses} flex items-center gap-2`}
          >
            <span
              aria-hidden="true"
              className={`h-4 w-8 rounded-full ${campaign.active ? 'bg-saving' : 'bg-line'}`}
            />
            <span>{campaign.active ? 'Activa' : 'Inactiva'}</span>
          </button>
          <button
            type="button"
            onClick={() => onEdit(campaign)}
            disabled={busy}
            className={buttonClasses}
          >
            Editar
          </button>
        </div>
      </td>
    </tr>
  );
}

export function CampaignList({
  campaigns,
  productNames,
  categoryNames,
  busyId,
  onToggleActive,
  onEdit,
}: CampaignListProps) {
  return (
    <div className="overflow-x-auto rounded-tag border border-line">
      <table className="w-full min-w-[64rem] border-collapse bg-surface text-base">
        <caption className="sr-only">Lista de campañas</caption>
        <thead>
          <tr className="bg-paper text-sm font-semibold text-ink">
            <th scope="col" className="p-2 text-left">
              Nombre
            </th>
            <th scope="col" className="p-2 text-left">
              Alcance
            </th>
            <th scope="col" className="p-2 text-left">
              Descuento
            </th>
            <th scope="col" className="p-2 text-center">
              Prioridad
            </th>
            <th scope="col" className="p-2 text-left">
              Estado
            </th>
            <th scope="col" className="p-2 text-left">
              Productos
            </th>
            <th scope="col" className="p-2 text-left">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => (
            <CampaignListRow
              key={campaign.id}
              campaign={campaign}
              productNames={productNames}
              categoryNames={categoryNames}
              busy={busyId === campaign.id}
              onToggleActive={onToggleActive}
              onEdit={onEdit}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
