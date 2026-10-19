import { describe, expect, it } from 'vitest';
import { exitVerificationStatus } from '../../src/domain/exit.js';

describe('exitVerificationStatus (RN-21)', () => {
  it('una compra sin entregar se puede entregar', () => {
    expect(exitVerificationStatus(null)).toBe('DELIVERED');
  });

  it('una compra ya entregada no se vuelve a entregar', () => {
    expect(exitVerificationStatus(new Date('2026-06-15T15:00:00.000Z'))).toBe('ALREADY_DELIVERED');
  });
});
