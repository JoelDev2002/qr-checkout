import { describe, expect, it } from 'vitest';
import { paymentMethodLabel } from './payment';

describe('paymentMethodLabel', () => {
  it('maps payment methods', () => {
    expect(paymentMethodLabel('CASH')).toBe('Efectivo');
    expect(paymentMethodLabel('CMR')).toBe('Tarjeta CMR');
    expect(paymentMethodLabel('CARD')).toBe('Otra tarjeta');
    expect(paymentMethodLabel('ONLINE')).toBe('En l�nea');
  });
});

