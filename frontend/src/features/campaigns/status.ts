import type { CampaignScope, CampaignStatus, DiscountType } from '../../types/campaign';

/** El estado siempre lleva texto: el color solo lo acompaña (DESIGN §6). */
export const CAMPAIGN_STATUS_TEXT: Record<CampaignStatus, string> = {
  ACTIVE: 'Vigente',
  SCHEDULED: 'Programada',
  EXPIRED: 'Vencida',
  INACTIVE: 'Inactiva',
};

export const CAMPAIGN_STATUS_CLASSES: Record<CampaignStatus, string> = {
  ACTIVE: 'border-saving text-saving',
  SCHEDULED: 'border-warn text-warn',
  EXPIRED: 'border-line bg-paper text-muted',
  INACTIVE: 'border-dashed border-line text-muted',
};

export const SCOPE_TEXT: Record<CampaignScope, string> = {
  PRODUCTS: 'Productos',
  CATEGORIES: 'Categorías',
  STORE: 'Toda la tienda',
};

export const DISCOUNT_TYPE_TEXT: Record<DiscountType, string> = {
  PERCENT: 'Porcentaje',
  FIXED: 'Monto fijo',
};
