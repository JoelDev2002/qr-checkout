import { describe, expect, it } from 'vitest';
import { deliveryStatus } from './delivery';

describe('deliveryStatus (RN-21)', () => {
  it('una compra sin entregar queda por entregar', () => {
    expect(deliveryStatus(null)).toBe('Por entregar');
  });

  it('una compra con fecha de entrega queda entregada', () => {
    expect(deliveryStatus('2026-06-15T15:00:00.000Z')).toBe('Entregado');
  });
});
