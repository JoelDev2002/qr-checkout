import { describe, expect, it } from 'vitest';
import { formatDiscountPercent } from './percent';

describe('formatDiscountPercent', () => {
  it('da formato a un porcentaje entero con el signo menos', () => {
    expect(formatDiscountPercent(58)).toBe('\u221258%');
    expect(formatDiscountPercent(5)).toBe('\u22125%');
    expect(formatDiscountPercent(100)).toBe('\u2212100%');
  });

  it('no muestra nada cuando no hay ahorro', () => {
    expect(formatDiscountPercent(0)).toBeNull();
    expect(formatDiscountPercent(-3)).toBeNull();
  });

  it('no muestra nada sin un número válido', () => {
    expect(formatDiscountPercent(null)).toBeNull();
    expect(formatDiscountPercent(undefined)).toBeNull();
    expect(formatDiscountPercent(Number.NaN)).toBeNull();
  });
});
