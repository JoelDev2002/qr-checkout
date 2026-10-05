import { describe, expect, it } from 'vitest';
import { signAuthToken, verifyAuthToken } from '../../src/infrastructure/jwt.js';

describe('jwt', () => {
  it('firma y verifica un token', () => {
    const token = signAuthToken({ sub: 'u1', role: 'CUSTOMER', email: 'test@local' });
    const decoded = verifyAuthToken(token);
    expect(decoded.sub).toBe('u1');
    expect(decoded.role).toBe('CUSTOMER');
  });

  it('rechaza token falso', () => {
    expect(() => verifyAuthToken('no-es-un-token')).toThrow();
  });
});
