import { describe, expect, it } from 'vitest';
import { summarizeCart, type CartItemPrices } from '../src/domain/pricing.js';

// Caso de referencia de ARCHITECTURE.md §10, con los precios ya resueltos.
const referenceItems: CartItemPrices[] = [
  { quantity: 1, originalCents: 424900, normalCents: 249900, cmrCents: 244900 },
  { quantity: 1, originalCents: 439900, normalCents: 269900, cmrCents: 264900 },
  { quantity: 1, originalCents: 337900, normalCents: 189900, cmrCents: 184900 },
  { quantity: 1, originalCents: 413900, normalCents: 229900, cmrCents: 219900 },
  { quantity: 1, originalCents: 60000, normalCents: 42900, cmrCents: 28900 },
  { quantity: 1, originalCents: 8990, normalCents: 3990, cmrCents: 3790 },
];

describe('summarizeCart', () => {
  it('resumen los seis productos de referencia', () => {
    expect(summarizeCart(referenceItems)).toEqual({
      originalTotalCents: 1685590,
      discountTotalCents: 699100,
      normalTotalCents: 986490,
      cmrTotalCents: 947290,
      cmrSavingCents: 39200,
    });
  });

  it('devuelve todos los totales en cero para un carrito vacío', () => {
    expect(summarizeCart([])).toEqual({
      originalTotalCents: 0,
      discountTotalCents: 0,
      normalTotalCents: 0,
      cmrTotalCents: 0,
      cmrSavingCents: 0,
    });
  });

  it('multiplica cada precio por la cantidad', () => {
    const items: CartItemPrices[] = [
      { quantity: 3, originalCents: 10000, normalCents: 7000, cmrCents: 6650 },
    ];

    expect(summarizeCart(items)).toEqual({
      originalTotalCents: 30000,
      discountTotalCents: 9000,
      normalTotalCents: 21000,
      cmrTotalCents: 19950,
      cmrSavingCents: 1050,
    });
  });

  it('deja los descuentos y el ahorro CMR en cero si no hay descuento', () => {
    const items: CartItemPrices[] = [
      { quantity: 2, originalCents: 5000, normalCents: 5000, cmrCents: 5000 },
    ];

    expect(summarizeCart(items)).toEqual({
      originalTotalCents: 10000,
      discountTotalCents: 0,
      normalTotalCents: 10000,
      cmrTotalCents: 10000,
      cmrSavingCents: 0,
    });
  });
});