export type CampaignScope = 'PRODUCTS' | 'CATEGORIES' | 'STORE';

export type DiscountType = 'PERCENT' | 'FIXED';

export type CampaignStatus = 'INACTIVE' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED';

/** Lo que devuelve el servidor en la lista y en el detalle (GET /campaigns). */
export type Campaign = {
  id: number;
  name: string;
  scope: CampaignScope;
  discountType: DiscountType;
  /** Regla guardada: puntos básicos si es porcentaje (2850 = 28.5 %), céntimos si es monto fijo. */
  discountValue: number;
  priority: number;
  /** Instantes guardados, en UTC. */
  startsAt: string;
  endsAt: string;
  /** Días de Lima que escribe el admin, listos para el formulario. */
  startDate: string;
  endDate: string;
  active: boolean;
  status: CampaignStatus;
  affectedProducts: number;
  productIds: number[];
  categoryIds: number[];
};

/** Lo que se envía en POST /campaigns y PUT /campaigns/:id. */
export type CampaignInput = {
  name: string;
  scope: CampaignScope;
  discountType: DiscountType;
  discountValue: number;
  priority: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  productIds?: number[];
  categoryIds?: number[];
};

export type SetCampaignActiveInput = {
  active: boolean;
};
