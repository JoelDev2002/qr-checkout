import { describe, expect, it } from 'vitest';
import { formatBarcode, formatProductPrices, isLowStock } from './productDisplay';

describe('formatProductPrices', () => {
  it('formatea original, oferta y CMR con el nombre de la campaña', () => {
    const cells = formatProductPrices({
      originalPriceCents: 89900,
      hasCmrDiscount: true,
      prices: { normalCents: 39900, cmrCents: 37900, campaignName: 'Campaña Dormitorio' },
    });

    expect(cells).toEqual({
      original: 'S/ 899.00',
      offer: 'S/ 399.00',
      campaignName: 'Campaña Dormitorio',
      cmr: 'S/ 379.00',
    });
  });

  it('devuelve la oferta igual al original y la campaña en null cuando ninguna campaña aplica', () => {
    const cells = formatProductPrices({
      originalPriceCents: 188900,
      hasCmrDiscount: true,
      prices: { normalCents: 188900, cmrCents: 169900, campaignName: null },
    });

    expect(cells.original).toBe('S/ 1,889.00');
    expect(cells.offer).toBe('S/ 1,889.00');
    expect(cells.campaignName).toBeNull();
    expect(cells.cmr).toBe('S/ 1,699.00');
  });

  it('muestra un guion cuando el producto no tiene descuento CMR', () => {
    const cells = formatProductPrices({
      originalPriceCents: 39900,
      hasCmrDiscount: false,
      prices: { normalCents: 39900, cmrCents: 39900, campaignName: null },
    });

    expect(cells.cmr).toBe('—');
  });
});

describe('isLowStock', () => {
  it('marca como poco stock con 3 unidades o menos', () => {
    expect(isLowStock(0)).toBe(true);
    expect(isLowStock(3)).toBe(true);
    expect(isLowStock(4)).toBe(false);
    expect(isLowStock(25)).toBe(false);
  });
});

describe('formatBarcode', () => {
  it('agrupa el EAN-13 en tres bloques separados por espacio', () => {
    expect(formatBarcode('7501234567890')).toBe('7 501234 567890');
  });

  it('deja cualquier otro código como está', () => {
    expect(formatBarcode('12345678')).toBe('12345678');
    expect(formatBarcode('C-8F3K2')).toBe('C-8F3K2');
  });
});
