import { describe, expect, it } from 'vitest';
import { buildCampaignBody, formatBps, parsePercentToBps, parseSolesToCents } from './campaignValues';
import type { CampaignFormDraft } from './campaignValues';

function draft(overrides: Partial<CampaignFormDraft> = {}): CampaignFormDraft {
  return {
    name: 'Campaña de prueba',
    scope: 'STORE',
    discountType: 'PERCENT',
    discountValue: '10',
    priority: '0',
    startsAt: '2026-01-01',
    endsAt: '2026-12-31',
    active: true,
    productIds: [],
    categoryIds: [],
    ...overrides,
  };
}

describe('parsePercentToBps', () => {
  it('convierte el porcentaje a puntos básicos', () => {
    expect(parsePercentToBps('28.5')).toEqual({ ok: true, value: 2850 });
    expect(parsePercentToBps('44')).toEqual({ ok: true, value: 4400 });
    expect(parsePercentToBps('1')).toEqual({ ok: true, value: 100 });
    expect(parsePercentToBps('7.5')).toEqual({ ok: true, value: 750 });
    expect(parsePercentToBps('007.5')).toEqual({ ok: true, value: 750 });
    expect(parsePercentToBps('  44  ')).toEqual({ ok: true, value: 4400 });
  });

  it('acepta la coma decimal', () => {
    expect(parsePercentToBps('28,5')).toEqual({ ok: true, value: 2850 });
    expect(parsePercentToBps('0,01')).toEqual({ ok: true, value: 1 });
  });

  it('acepta los bordes del rango', () => {
    expect(parsePercentToBps('0.01')).toEqual({ ok: true, value: 1 });
    expect(parsePercentToBps('90')).toEqual({ ok: true, value: 9000 });
    expect(parsePercentToBps('90.00')).toEqual({ ok: true, value: 9000 });
    expect(parsePercentToBps('89.99')).toEqual({ ok: true, value: 8999 });
  });

  it('rechaza los textos vacíos', () => {
    expect(parsePercentToBps('')).toEqual({
      ok: false,
      message: 'Escribe el porcentaje del descuento.',
    });
    expect(parsePercentToBps('   ')).toEqual({
      ok: false,
      message: 'Escribe el porcentaje del descuento.',
    });
  });

  it('rechaza los textos que no son números', () => {
    expect(parsePercentToBps('abc')).toEqual({
      ok: false,
      message: 'Escribe el porcentaje con números, por ejemplo 28.5.',
    });
    expect(parsePercentToBps('1e2')).toEqual({
      ok: false,
      message: 'Escribe el porcentaje con números, por ejemplo 28.5.',
    });
    expect(parsePercentToBps('28.5.')).toEqual({
      ok: false,
      message: 'Escribe el porcentaje con números, por ejemplo 28.5.',
    });
    expect(parsePercentToBps('1,000.50')).toEqual({
      ok: false,
      message: 'Escribe el porcentaje con números, por ejemplo 28.5.',
    });
    expect(parsePercentToBps('28 %')).toEqual({
      ok: false,
      message: 'Escribe el porcentaje con números, por ejemplo 28.5.',
    });
  });

  it('rechaza más de dos decimales', () => {
    expect(parsePercentToBps('28.555')).toEqual({
      ok: false,
      message: 'El porcentaje admite como máximo 2 decimales.',
    });
    expect(parsePercentToBps('0.001')).toEqual({
      ok: false,
      message: 'El porcentaje admite como máximo 2 decimales.',
    });
    expect(parsePercentToBps('1,000')).toEqual({
      ok: false,
      message: 'El porcentaje admite como máximo 2 decimales.',
    });
  });

  it('rechaza ceros, negativos y valores fuera del rango', () => {
    const rango = 'El porcentaje debe ser mayor que 0 y hasta 90.';

    expect(parsePercentToBps('0')).toEqual({ ok: false, message: rango });
    expect(parsePercentToBps('0.00')).toEqual({ ok: false, message: rango });
    expect(parsePercentToBps('-5')).toEqual({ ok: false, message: rango });
    expect(parsePercentToBps('-0.5')).toEqual({ ok: false, message: rango });
    expect(parsePercentToBps('90.01')).toEqual({ ok: false, message: rango });
    expect(parsePercentToBps('91')).toEqual({ ok: false, message: rango });
    expect(parsePercentToBps('100')).toEqual({ ok: false, message: rango });
    expect(parsePercentToBps('1000')).toEqual({ ok: false, message: rango });
    expect(parsePercentToBps('99999999999999999999')).toEqual({ ok: false, message: rango });
  });
});

describe('parseSolesToCents', () => {
  it('convierte los soles a céntimos', () => {
    expect(parseSolesToCents('50')).toEqual({ ok: true, value: 5000 });
    expect(parseSolesToCents('50.00')).toEqual({ ok: true, value: 5000 });
    expect(parseSolesToCents('50.5')).toEqual({ ok: true, value: 5050 });
    expect(parseSolesToCents('0.01')).toEqual({ ok: true, value: 1 });
    expect(parseSolesToCents('1')).toEqual({ ok: true, value: 100 });
    expect(parseSolesToCents('  50  ')).toEqual({ ok: true, value: 5000 });
  });

  it('acepta la coma decimal', () => {
    expect(parseSolesToCents('50,50')).toEqual({ ok: true, value: 5050 });
    expect(parseSolesToCents('0,25')).toEqual({ ok: true, value: 25 });
  });

  it('rechaza los textos vacíos', () => {
    expect(parseSolesToCents('')).toEqual({
      ok: false,
      message: 'Escribe el monto fijo del descuento.',
    });
    expect(parseSolesToCents('   ')).toEqual({
      ok: false,
      message: 'Escribe el monto fijo del descuento.',
    });
  });

  it('rechaza los textos que no son números', () => {
    expect(parseSolesToCents('abc')).toEqual({
      ok: false,
      message: 'Escribe el monto con números, por ejemplo 50.00.',
    });
    expect(parseSolesToCents('50,')).toEqual({
      ok: false,
      message: 'Escribe el monto con números, por ejemplo 50.00.',
    });
    expect(parseSolesToCents('S/ 50')).toEqual({
      ok: false,
      message: 'Escribe el monto con números, por ejemplo 50.00.',
    });
    expect(parseSolesToCents('1e3')).toEqual({
      ok: false,
      message: 'Escribe el monto con números, por ejemplo 50.00.',
    });
  });

  it('rechaza más de dos decimales', () => {
    expect(parseSolesToCents('50.005')).toEqual({
      ok: false,
      message: 'El monto admite como máximo 2 decimales.',
    });
    expect(parseSolesToCents('50,005')).toEqual({
      ok: false,
      message: 'El monto admite como máximo 2 decimales.',
    });
  });

  it('rechaza ceros y negativos', () => {
    const mayor = 'El monto fijo debe ser mayor que cero.';

    expect(parseSolesToCents('0')).toEqual({ ok: false, message: mayor });
    expect(parseSolesToCents('0.00')).toEqual({ ok: false, message: mayor });
    expect(parseSolesToCents('-50')).toEqual({ ok: false, message: mayor });
    expect(parseSolesToCents('-0.01')).toEqual({ ok: false, message: mayor });
  });

  it('rechaza montos demasiado grandes y acepta los enormes válidos', () => {
    expect(parseSolesToCents('9999999999.99')).toEqual({ ok: true, value: 999999999999 });
    expect(parseSolesToCents('99999999999')).toEqual({
      ok: false,
      message: 'El monto es demasiado grande.',
    });
    expect(parseSolesToCents('99999999999.99')).toEqual({
      ok: false,
      message: 'El monto es demasiado grande.',
    });
  });
});

describe('formatBps', () => {
  it('muestra el porcentaje sin decimales de más', () => {
    expect(formatBps(4400)).toBe('44 %');
    expect(formatBps(9000)).toBe('90 %');
    expect(formatBps(100)).toBe('1 %');
    expect(formatBps(0)).toBe('0 %');
  });

  it('muestra los decimales de la regla sin ceros sobrantes', () => {
    expect(formatBps(2850)).toBe('28.5 %');
    expect(formatBps(750)).toBe('7.5 %');
    expect(formatBps(50)).toBe('0.5 %');
    expect(formatBps(5)).toBe('0.05 %');
    expect(formatBps(505)).toBe('5.05 %');
    expect(formatBps(8999)).toBe('89.99 %');
  });
});

describe('buildCampaignBody', () => {
  it('arma el cuerpo de una campaña de productos con sus ids', () => {
    const body = buildCampaignBody(
      draft({
        name: '  Oferta Apple  ',
        scope: 'PRODUCTS',
        discountType: 'PERCENT',
        discountValue: '28,5',
        priority: '10',
        productIds: [7, 9],
        categoryIds: [3],
      }),
    );

    expect(body).toEqual({
      name: 'Oferta Apple',
      scope: 'PRODUCTS',
      discountType: 'PERCENT',
      discountValue: 2850,
      priority: 10,
      startsAt: '2026-01-01',
      endsAt: '2026-12-31',
      active: true,
      productIds: [7, 9],
    });
    expect('categoryIds' in body).toBe(false);
  });

  it('arma el cuerpo de una campaña de categorías con sus ids', () => {
    const body = buildCampaignBody(
      draft({
        scope: 'CATEGORIES',
        categoryIds: [2],
        productIds: [4],
      }),
    );

    expect(body.categoryIds).toEqual([2]);
    expect('productIds' in body).toBe(false);
  });

  it('arma el cuerpo de una campaña de toda la tienda sin destinos', () => {
    const body = buildCampaignBody(
      draft({
        scope: 'STORE',
        productIds: [1],
        categoryIds: [1],
      }),
    );

    expect('productIds' in body).toBe(false);
    expect('categoryIds' in body).toBe(false);
  });

  it('convierte el monto fijo a céntimos', () => {
    expect(
      buildCampaignBody(
        draft({ scope: 'STORE', discountType: 'FIXED', discountValue: '50' }),
      ).discountValue,
    ).toBe(5000);

    expect(
      buildCampaignBody(
        draft({ scope: 'STORE', discountType: 'FIXED', discountValue: '50.00' }),
      ).discountValue,
    ).toBe(5000);
  });

  it('envía la prioridad como entero y respeta el interruptor', () => {
    const body = buildCampaignBody(draft({ priority: '-3', active: false }));

    expect(body.priority).toBe(-3);
    expect(body.active).toBe(false);
  });

  it('lanza el aviso del valor cuando el descuento no sirve', () => {
    expect(() =>
      buildCampaignBody(draft({ discountType: 'PERCENT', discountValue: '90.01' })),
    ).toThrow('El porcentaje debe ser mayor que 0 y hasta 90.');

    expect(() =>
      buildCampaignBody(draft({ discountType: 'PERCENT', discountValue: '' })),
    ).toThrow('Escribe el porcentaje del descuento.');

    expect(() =>
      buildCampaignBody(draft({ discountType: 'FIXED', discountValue: '0' })),
    ).toThrow('El monto fijo debe ser mayor que cero.');
  });

  it('lanza el aviso cuando la prioridad no es un entero', () => {
    expect(() => buildCampaignBody(draft({ priority: 'alta' }))).toThrow(
      'La prioridad debe ser un número entero.',
    );
    expect(() => buildCampaignBody(draft({ priority: '1.5' }))).toThrow(
      'La prioridad debe ser un número entero.',
    );
  });
});
