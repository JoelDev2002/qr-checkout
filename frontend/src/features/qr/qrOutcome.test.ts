import { describe, expect, it } from 'vitest';
import { resolveQrPhase } from './qrOutcome';
import type { QrExpected, QrCurrent } from './qrOutcome';

const expected: QrExpected = { cartId: 5, code: 'C-8F3K2' };

function current(overrides: Partial<QrCurrent>): QrCurrent {
  return {
    cartId: 5,
    status: 'PENDING',
    qrCode: 'C-8F3K2',
    purchaseCodes: [],
    ...overrides,
  };
}

describe('resolveQrPhase', () => {
  it('sigue activo mientras el mismo carrito está PENDING con el mismo código', () => {
    expect(resolveQrPhase(expected, current({}))).toBe('active');
  });

  it('si el mismo carrito dejó de estar PENDING con el código, el QR venció', () => {
    expect(resolveQrPhase(expected, current({ status: 'OPEN', qrCode: null }))).toBe('expired');
    expect(resolveQrPhase(expected, current({ status: 'OPEN', qrCode: 'C-OTRO' }))).toBe('expired');
  });

  it('con otro carrito y una compra de ese código, el QR se cobró', () => {
    expect(
      resolveQrPhase(expected, current({ cartId: 6, status: 'OPEN', purchaseCodes: ['C-X', 'C-8F3K2'] })),
    ).toBe('paid');
  });

  it('con otro carrito y sin compra de ese código, el carrito se rechazó o canceló', () => {
    expect(
      resolveQrPhase(expected, current({ cartId: 6, status: 'OPEN', qrCode: null, purchaseCodes: ['C-X'] })),
    ).toBe('inactive');
  });
});