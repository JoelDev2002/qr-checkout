import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';

describe('formatMoney', () => {
  it('formatea los céntimos con el formato peruano', () => {
    expect(formatMoney(188900)).toBe('S/ 1,889.00');
    expect(formatMoney(1685590)).toBe('S/ 16,855.90');
    expect(formatMoney(100)).toBe('S/ 1.00');
    expect(formatMoney(89)).toBe('S/ 0.89');
    expect(formatMoney(0)).toBe('S/ 0.00');
  });

  it('antepone el signo menos a los montos negativos', () => {
    expect(formatMoney(-699100)).toBe('− S/ 6,991.00');
  });
});