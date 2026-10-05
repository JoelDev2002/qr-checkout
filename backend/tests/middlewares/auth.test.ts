import { describe, expect, it } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../../src/middlewares/auth.js';
import { signAuthToken } from '../../src/infrastructure/jwt.js';
import { ApiError } from '../../src/middlewares/errorHandler.js';

function makeReq(headers: Record<string, string | undefined> = {}): Request {
  return { headers } as Request;
}

function makeRes(): Response {
  return {} as Response;
}

function makeNext(): NextFunction {
  return () => undefined;
}

describe('auth middleware', () => {
  it('requiere Authorization Bearer', () => {
    const req = makeReq();
    expect(() => authenticate(req, makeRes(), makeNext())).toThrow(ApiError);
    expect((req as { user?: unknown }).user).toBeUndefined();
  });

  it('rechaza token ausente tras Bearer', () => {
    const req = makeReq({ authorization: 'Bearer ' });
    expect(() => authenticate(req, makeRes(), makeNext())).toThrow(ApiError);
  });

  it('acepta token válido y setea req.user', () => {
    const token = signAuthToken({ sub: 'u1', role: 'CUSTOMER' });
    const req = makeReq({ authorization: `Bearer ${token}` });
    authenticate(req, makeRes(), makeNext());
    expect(req.user).toBeDefined();
    expect(req.user?.role).toBe('CUSTOMER');
  });

  it('rechaza token falso', () => {
    const req = makeReq({ authorization: 'Bearer false' });
    expect(() => authenticate(req, makeRes(), makeNext())).toThrow(ApiError);
  });

  it('requiere autenticación con requireRole', () => {
    const req = makeReq();
    const mw = requireRole('CASHIER');
    expect(() => mw(req, makeRes(), makeNext())).toThrow(ApiError);
  });

  it('rechaza rol incorrecto con FORBIDDEN', () => {
    const token = signAuthToken({ sub: 'u1', role: 'CUSTOMER' });
    const req = makeReq({ authorization: `Bearer ${token}` });
    authenticate(req, makeRes(), makeNext());
    const mw = requireRole('CASHIER');
    expect(() => mw(req, makeRes(), makeNext())).toThrow(ApiError);
  });

  it('permite rol correcto', () => {
    const token = signAuthToken({ sub: 'u1', role: 'CASHIER' });
    const req = makeReq({ authorization: `Bearer ${token}` });
    authenticate(req, makeRes(), makeNext());
    const mw = requireRole('CASHIER');
    expect(() => mw(req, makeRes(), makeNext())).not.toThrow();
  });

  it('permite múltiples roles', () => {
    const token = signAuthToken({ sub: 'u1', role: 'ADMIN' });
    const req = makeReq({ authorization: `Bearer ${token}` });
    authenticate(req, makeRes(), makeNext());
    const mw = requireRole('CASHIER', 'ADMIN');
    expect(() => mw(req, makeRes(), makeNext())).not.toThrow();
  });
});
