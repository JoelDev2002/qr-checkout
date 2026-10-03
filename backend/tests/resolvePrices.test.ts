import { describe, expect, it } from 'vitest';
import { resolvePrices, type Campaign, type PricedProduct } from '../src/domain/pricing.js';

const NOW = new Date('2026-03-10T15:00:00.000Z');

function makeProduct(overrides: Partial<PricedProduct> = {}): PricedProduct {
  return {
    id: 1,
    categoryId: 10,
    originalPriceCents: 10000,
    hasCmrDiscount: false,
    cmrDiscountBps: 0,
    ...overrides,
  };
}

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1,
    name: 'Campaña de prueba',
    scope: 'STORE',
    discountType: 'PERCENT',
    discountValue: 3000,
    priority: 0,
    startsAt: new Date('2026-03-01T00:00:00.000Z'),
    endsAt: new Date('2026-03-31T23:59:59.999Z'),
    active: true,
    productIds: [],
    categoryIds: [],
    ...overrides,
  };
}

describe('resolvePrices', () => {
  it('sin campañas deja el precio de oferta en el original', () => {
    expect(resolvePrices(makeProduct(), [], NOW)).toEqual({
      originalCents: 10000,
      normalCents: 10000,
      cmrCents: 10000,
      campaignId: null,
      campaignName: null,
      discountPercent: 0,
      cmrPercent: 0,
    });
  });

  it('sin campañas calcula el CMR sobre el original', () => {
    const product = makeProduct({ hasCmrDiscount: true, cmrDiscountBps: 500 });

    const prices = resolvePrices(product, [], NOW);

    expect(prices.normalCents).toBe(10000);
    expect(prices.cmrCents).toBe(9500);
    expect(prices.cmrPercent).toBe(5);
  });

  it('aplica una campaña de porcentaje y calcula el CMR sobre la oferta', () => {
    const product = makeProduct({ hasCmrDiscount: true, cmrDiscountBps: 500 });

    const prices = resolvePrices(product, [makeCampaign({ discountValue: 3000 })], NOW);

    expect(prices.normalCents).toBe(7000);
    expect(prices.cmrCents).toBe(6650);
    expect(prices.campaignId).toBe(1);
    expect(prices.campaignName).toBe('Campaña de prueba');
  });

  it('aplica una campaña de monto fijo restándolo del original', () => {
    const prices = resolvePrices(makeProduct(), [makeCampaign({ discountType: 'FIXED', discountValue: 1500 })], NOW);

    expect(prices.normalCents).toBe(8500);
    expect(prices.discountPercent).toBe(15);
  });

  it('una campaña de tienda alcanza a cualquier producto', () => {
    const product = makeProduct({ id: 77, categoryId: 5 });
    const campaign = makeCampaign({ scope: 'STORE' });

    expect(resolvePrices(product, [campaign], NOW).normalCents).toBe(7000);
  });

  it('una campaña de categorías solo alcanza a los productos de su categoría', () => {
    const campaign = makeCampaign({ scope: 'CATEGORIES', categoryIds: [10, 11] });

    expect(resolvePrices(makeProduct({ categoryId: 11 }), [campaign], NOW).normalCents).toBe(7000);
    expect(resolvePrices(makeProduct({ categoryId: 12 }), [campaign], NOW).normalCents).toBe(10000);
  });

  it('una campaña de productos solo alcanza a los productos que apunta', () => {
    const campaign = makeCampaign({ scope: 'PRODUCTS', productIds: [1, 2] });

    expect(resolvePrices(makeProduct({ id: 2 }), [campaign], NOW).normalCents).toBe(7000);
    expect(resolvePrices(makeProduct({ id: 3 }), [campaign], NOW).normalCents).toBe(10000);
  });

  it('gana la campaña de mayor prioridad sin acumular las dos', () => {
    const product = makeProduct();
    const campaigns = [
      makeCampaign({ id: 1, name: 'Prioridad baja', discountValue: 3000, priority: 1 }),
      makeCampaign({ id: 2, name: 'Prioridad alta', discountValue: 5000, priority: 5 }),
    ];

    const prices = resolvePrices(product, campaigns, NOW);

    expect(prices.normalCents).toBe(5000);
    expect(prices.campaignName).toBe('Prioridad alta');
  });

  it('con la misma prioridad gana la que más ahorra en ese producto', () => {
    const product = makeProduct({ hasCmrDiscount: true, cmrDiscountBps: 0 });
    const campaigns = [
      makeCampaign({ id: 1, name: 'Ahorra poco', discountValue: 1000, priority: 3 }),
      makeCampaign({ id: 2, name: 'Ahorra más', discountValue: 2500, priority: 3 }),
    ];

    const prices = resolvePrices(product, campaigns, NOW);
    expect(prices.normalCents).toBe(7500);
    expect(prices.campaignName).toBe('Ahorra más');
  });

  it('con igual prioridad y igual ahorro gana la de mayor id', () => {
    const campaigns = [
      makeCampaign({ id: 4, name: 'Menor id', discountValue: 2000 }),
      makeCampaign({ id: 9, name: 'Mayor id', discountValue: 2000 }),
    ];

    const prices = resolvePrices(makeProduct(), campaigns, NOW);

    expect(prices.campaignId).toBe(9);
    expect(prices.campaignName).toBe('Mayor id');
  });

  it('ignora campañas inactivas, vencidas y futuras', () => {
    const inactive = makeCampaign({ id: 1, name: 'Inactiva', active: false });
    const expired = makeCampaign({
      id: 2,
      name: 'Vencida',
      endsAt: new Date('2026-03-09T23:59:59.999Z'),
    });
    const future = makeCampaign({ id: 3, name: 'Futura', startsAt: new Date('2026-03-11T00:00:00.000Z') });

    const prices = resolvePrices(makeProduct(), [inactive, expired, future], NOW);

    expect(prices.normalCents).toBe(10000);
    expect(prices.campaignName).toBeNull();
  });

  it('aplica una campaña en los bordes exactos de sus fechas', () => {
    const campaign = makeCampaign({
      startsAt: NOW,
      endsAt: NOW,
    });

    expect(resolvePrices(makeProduct(), [campaign], NOW).normalCents).toBe(7000);
  });

  it('no aplica un monto fijo que iguala o supera el precio original', () => {
    const equal = makeCampaign({ id: 1, discountType: 'FIXED', discountValue: 10000 });
    const greater = makeCampaign({ id: 2, discountType: 'FIXED', discountValue: 12000 });

    expect(resolvePrices(makeProduct(), [equal], NOW).normalCents).toBe(10000);
    expect(resolvePrices(makeProduct(), [greater], NOW).normalCents).toBe(10000);
  });

  it('un monto fijo que no aplica no tapa a una campaña que sí aplica', () => {
    const campaigns = [
      makeCampaign({ id: 1, name: 'Fijo mayor que el original', discountType: 'FIXED', discountValue: 10000, priority: 9 }),
      makeCampaign({ id: 2, name: 'Porcentaje', discountValue: 3000, priority: 1 }),
    ];

    const prices = resolvePrices(makeProduct(), campaigns, NOW);

    expect(prices.normalCents).toBe(7000);
    expect(prices.campaignName).toBe('Porcentaje');
  });

  it('un producto sin descuento CMR tiene cmr igual a la oferta', () => {
    const prices = resolvePrices(makeProduct(), [makeCampaign({ discountValue: 3000 })], NOW);

    expect(prices.cmrCents).toBe(prices.normalCents);
    expect(prices.cmrPercent).toBe(30);
  });

  it('redondea a la mitad hacia arriba', () => {
    const prices = resolvePrices(makeProduct({ originalPriceCents: 1005 }), [makeCampaign({ discountValue: 1000 })], NOW);

    expect(prices.normalCents).toBe(905);
  });

  it('calcula los porcentajes a partir de los precios y los redondea a entero', () => {
    const product = makeProduct({
      originalPriceCents: 8990,
      hasCmrDiscount: true,
      cmrDiscountBps: 500,
    });
    const campaign = makeCampaign({ discountType: 'FIXED', discountValue: 5000 });

    const prices = resolvePrices(product, [campaign], NOW);

    expect(prices.normalCents).toBe(3990);
    expect(prices.cmrCents).toBe(3791);
    expect(prices.discountPercent).toBe(56);
    expect(prices.cmrPercent).toBe(58);
  });

  it('mantiene cmr menor o igual que la oferta, y la oferta menor o igual que el original', () => {
    const product = makeProduct({ hasCmrDiscount: true, cmrDiscountBps: 9000 });
    const prices = resolvePrices(product, [makeCampaign({ discountValue: 2500 })], NOW);

    expect(prices.cmrCents).toBeLessThanOrEqual(prices.normalCents);
    expect(prices.normalCents).toBeLessThanOrEqual(prices.originalCents);
  });
});
