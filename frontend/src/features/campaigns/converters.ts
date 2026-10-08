import type { Campaign } from '../../types/campaign';
import type { CampaignFormValues } from './schema';

/** 2850 → "28.5", 4400 → "44": el formulario edita la regla como texto. */
function percentBpsToText(bps: number): string {
  const digits = Math.max(0, Math.trunc(bps)).toString().padStart(3, '0');
  const whole = digits.slice(0, -2);
  const decimals = digits.slice(-2).replace(/0+$/, '');

  return decimals.length > 0 ? `${whole}.${decimals}` : whole;
}

/** 5000 → "50", 5050 → "50.50": el monto se edita en soles, no en céntimos. */
function centsToText(cents: number): string {
  const digits = Math.max(0, Math.trunc(cents)).toString().padStart(3, '0');
  const whole = digits.slice(0, -2);
  const decimals = digits.slice(-2);

  return decimals === '00' ? whole : `${whole}.${decimals}`;
}

export function campaignToForm(campaign: Campaign): CampaignFormValues {
  return {
    name: campaign.name,
    scope: campaign.scope,
    discountType: campaign.discountType,
    discountValue:
      campaign.discountType === 'PERCENT'
        ? percentBpsToText(campaign.discountValue)
        : centsToText(campaign.discountValue),
    priority: String(campaign.priority),
    startsAt: campaign.startDate,
    endsAt: campaign.endDate,
    active: campaign.active,
    productIds: [...campaign.productIds],
    categoryIds: [...campaign.categoryIds],
  };
}

function todayLimaDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${now.getFullYear()}-${month}-${day}`;
}

export function emptyCampaignForm(): CampaignFormValues {
  return {
    name: '',
    scope: 'PRODUCTS',
    discountType: 'PERCENT',
    discountValue: '',
    priority: '0',
    startsAt: todayLimaDate(),
    endsAt: todayLimaDate(),
    active: true,
    productIds: [],
    categoryIds: [],
  };
}
