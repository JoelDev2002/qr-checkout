import { describe, expect, it } from 'vitest';
import {
  STOCK_REASON_MAX_LENGTH,
  STOCK_REASON_MIN_LENGTH,
  formatSignedDelta,
  resultingStock,
  validateDelta,
  validateReason,
  wouldGoNegative,
} from './stockAdjustment';

describe('validateDelta', () => {
  it('acepta un entero positivo y uno negativo', () => {
    expect(validateDelta('7')).toEqual({ ok: true, value: 7 });
    expect(validateDelta('+4')).toEqual({ ok: true, value: 4 });
    expect(validateDelta('-3')).toEqual({ ok: true, value: -3 });
  });

  it('exige la cantidad', () => {
    expect(validateDelta('').ok).toBe(false);
    expect(validateDelta('   ').ok).toBe(false);
  });

  it('rechaza lo que no es un entero', () => {
    expect(validateDelta('abc').ok).toBe(false);
    expect(validateDelta('1.5').ok).toBe(false);
    expect(validateDelta('—').ok).toBe(false);
  });

  it('rechaza el cero: un delta de cero no cambia nada', () => {
    const result = validateDelta('0');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('La cantidad debe ser distinta de cero.');
    }
  });
});

describe('validateReason', () => {
  it('acepta un motivo y lo deja sin los espacios de los bordes', () => {
    expect(validateReason('  rotura de stock  ')).toEqual({ ok: true, value: 'rotura de stock' });
  });

  it('exige un motivo', () => {
    const result = validateReason('   ');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('El motivo del ajuste es obligatorio.');
    }
  });

  it(`exige al menos ${STOCK_REASON_MIN_LENGTH} caracteres`, () => {
    const result = validateReason('ab');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(`El motivo debe tener al menos ${STOCK_REASON_MIN_LENGTH} caracteres.`);
    }
  });

  it(`tolera como máximo ${STOCK_REASON_MAX_LENGTH} caracteres`, () => {
    const result = validateReason('a'.repeat(STOCK_REASON_MAX_LENGTH + 1));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(`El motivo no puede tener más de ${STOCK_REASON_MAX_LENGTH} caracteres.`);
    }
  });
});

describe('resultingStock y wouldGoNegative', () => {
  it('suma o resta sobre el stock actual', () => {
    expect(resultingStock(10, 5)).toBe(15);
    expect(resultingStock(10, -4)).toBe(6);
  });

  it('detecta cuándo el stock quedaría en negativo', () => {
    expect(wouldGoNegative(3, -4)).toBe(true);
    expect(wouldGoNegative(3, -3)).toBe(false);
    expect(wouldGoNegative(3, 2)).toBe(false);
  });

  it('el stock en cero admite sumar pero no restar', () => {
    expect(wouldGoNegative(0, -1)).toBe(true);
    expect(wouldGoNegative(0, 4)).toBe(false);
  });
});

describe('formatSignedDelta', () => {
  it('muestra el signo de la cantidad en el historial', () => {
    expect(formatSignedDelta(5)).toBe('+5');
    expect(formatSignedDelta(-3)).toBe('-3');
    expect(formatSignedDelta(-0)).toBe('0');
  });
});