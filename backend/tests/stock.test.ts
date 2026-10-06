import { describe, expect, it } from 'vitest';
import { STOCK_REASON_MAX_LENGTH, STOCK_REASON_MIN_LENGTH, normalizeStockReason } from '../src/domain/stock.js';

describe('normalizeStockReason', () => {
  it('quita los espacios sobrantes del motivo', () => {
    expect(normalizeStockReason('  Recepción   de\nmercancia  ')).toBe('Recepción de mercancia');
    expect(normalizeStockReason('Merma por rotura')).toBe('Merma por rotura');
  });

  it('deja vacío un motivo que solo tiene espacios', () => {
    expect(normalizeStockReason('   \t ')).toBe('');
  });

  it('usa límites que dejan un motivo legible en el historial', () => {
    expect(STOCK_REASON_MIN_LENGTH).toBe(3);
    expect(STOCK_REASON_MAX_LENGTH).toBe(200);
  });
});
