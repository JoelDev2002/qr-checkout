import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';
import { signAuthToken, verifyAuthToken } from '../../src/infrastructure/jwt.js';

function decodeHeader(token: string): { alg: string } {
  const [header] = token.split('.');
  return JSON.parse(Buffer.from(header ?? '', 'base64url').toString('utf8')) as {
    alg: string;
  };
}

describe('jwt', () => {
  it('firma y verifica un token', () => {
    const token = signAuthToken({ sub: 'u1', role: 'CUSTOMER', email: 'test@local' });
    const decoded = verifyAuthToken(token);
    expect(decoded.sub).toBe('u1');
    expect(decoded.role).toBe('CUSTOMER');
  });

  it('firma siempre con HS256', () => {
    const token = signAuthToken({ sub: '1', role: 'CASHIER' });
    expect(decodeHeader(token).alg).toBe('HS256');
  });

  it('rechaza token falso', () => {
    expect(() => verifyAuthToken('no-es-un-token')).toThrow();
  });

  it('rechaza un token firmado con alg none', () => {
    const token = jwt.sign({ sub: '1', role: 'ADMIN' }, '', { algorithm: 'none' });
    expect(decodeHeader(token).alg).toBe('none');
    expect(() => verifyAuthToken(token)).toThrow();
  });

  it('rechaza un token firmado con otro algoritmo aunque use el mismo secreto', () => {
    const token = jwt.sign({ sub: '1', role: 'ADMIN' }, env.JWT_SECRET, { algorithm: 'HS512' });
    expect(decodeHeader(token).alg).toBe('HS512');
    expect(() => verifyAuthToken(token)).toThrow();
  });
});
