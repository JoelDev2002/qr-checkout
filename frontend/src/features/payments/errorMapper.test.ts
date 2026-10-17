import { describe, expect, it } from 'vitest';
import { mapApiError } from './errorMapper';

describe('mapApiError', () => {
  it('mapea AMOUNT_CHANGED con el monto nuevo', () => {
    const result = mapApiError('AMOUNT_CHANGED', 'El total cambió', { amountCents: 1500 });

    expect(result.kind).toBe('amount_changed');
    if (result.kind === 'amount_changed') {
      expect(result.amountCents).toBe(1500);
    }
  });

  it('mapea PAYMENT_DECLINED', () => {
    expect(mapApiError('PAYMENT_DECLINED', 'rechazado').kind).toBe('declined');
  });

  it('mapea PAYMENT_UNCERTAIN con el código del intento', () => {
    const result = mapApiError(
      'PAYMENT_UNCERTAIN',
      'No pudimos confirmar tu pago. No lo repitas: avisa en caja con este código: 42',
    );

    expect(result.kind).toBe('uncertain');
    if (result.kind === 'uncertain') {
      expect(result.attemptId).toBe('42');
    }
  });

  it('mapea PAYMENT_NOT_CONFIGURED como no disponible', () => {
    expect(mapApiError('PAYMENT_NOT_CONFIGURED', 'No configurado').kind).toBe('not_available');
  });

  it('un 500 sin código queda como error genérico', () => {
    expect(mapApiError('INTERNAL_ERROR', 'Ocurrió un error inesperado.').kind).toBe('error');
  });

  it('un 500 con código del intento es revisión manual (sin reintento)', () => {
    const result = mapApiError(
      'INTERNAL_ERROR',
      'Hubo un problema con tu pago. Avisa en caja con este código: 99',
    );

    expect(result.kind).toBe('manual_review');
    if (result.kind === 'manual_review') {
      expect(result.attemptId).toBe('99');
    }
  });
});
