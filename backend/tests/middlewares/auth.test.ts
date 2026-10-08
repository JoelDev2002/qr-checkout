import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  createAuthenticate,
  requireRole,
  type SessionUser,
  type SessionUserRepository,
} from '../../src/middlewares/auth.js';
import { signAuthToken, type AuthRole, type AuthTokenPayload } from '../../src/infrastructure/jwt.js';
import { ApiError } from '../../src/middlewares/errorHandler.js';

function makeReq(headers: Record<string, string | undefined> = {}): Request {
  return { headers } as Request;
}

function makeRes(): Response {
  return {} as Response;
}

function makeNext(): { next: NextFunction; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const next: NextFunction = (...args: unknown[]) => {
    calls.push(args);
  };
  return { next, calls };
}

/** Repositorio falso: la comprobación de sesión se prueba sin tocar la base. */
function makeRepository(users: Record<number, SessionUser>): SessionUserRepository {
  return async (userId) => users[userId] ?? null;
}

async function authenticateWith(
  users: Record<number, SessionUser>,
  headers: Record<string, string | undefined>,
): Promise<{ calls: unknown[][]; user: AuthTokenPayload | undefined }> {
  const req = makeReq(headers);
  const { next, calls } = makeNext();

  await createAuthenticate(makeRepository(users))(req, makeRes(), next);

  return { calls, user: req.user };
}

function firstError(calls: unknown[][]): unknown {
  expect(calls).toHaveLength(1);
  return calls[0]?.[0];
}

function expectUnauthorized(error: unknown, message: string): void {
  expect(error).toBeInstanceOf(ApiError);
  const apiError = error as ApiError;
  expect(apiError.status).toBe(401);
  expect(apiError.code).toBe('UNAUTHORIZED');
  expect(apiError.message).toBe(message);
}

function catchApiError(action: () => void): ApiError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }

  throw new Error('Se esperaba un ApiError.');
}

const ACTIVO: SessionUser = { role: 'CUSTOMER', active: true };

describe('auth middleware', () => {
  it('requiere Authorization Bearer', async () => {
    const { calls, user } = await authenticateWith({ 1: ACTIVO }, {});

    expectUnauthorized(firstError(calls), 'Se requiere autenticación.');
    expect(user).toBeUndefined();
  });

  it('rechaza token ausente tras Bearer', async () => {
    const { calls, user } = await authenticateWith({ 1: ACTIVO }, { authorization: 'Bearer ' });

    expectUnauthorized(firstError(calls), 'Se requiere autenticación.');
    expect(user).toBeUndefined();
  });

  it('acepta token válido de un usuario activo y setea req.user', async () => {
    const token = signAuthToken({ sub: '1', role: 'CUSTOMER' });
    const { calls, user } = await authenticateWith(
      { 1: ACTIVO },
      { authorization: `Bearer ${token}` },
    );

    expect(firstError(calls)).toBeUndefined();
    expect(user).toBeDefined();
    expect(user?.role).toBe('CUSTOMER');
  });

  it('rechaza token falso', async () => {
    const { calls } = await authenticateWith({ 1: ACTIVO }, { authorization: 'Bearer false' });

    expectUnauthorized(firstError(calls), 'Token inválido o vencido.');
  });

  it('rechaza un sub que no es un id numérico sin consultar el repositorio', async () => {
    const findSessionUser = vi.fn(makeRepository({ 1: ACTIVO }));
    const token = signAuthToken({ sub: 'u1', role: 'CUSTOMER' });

    const req = makeReq({ authorization: `Bearer ${token}` });
    const { next, calls } = makeNext();

    await createAuthenticate(findSessionUser)(req, makeRes(), next);

    expectUnauthorized(firstError(calls), 'Token inválido o vencido.');
    expect(findSessionUser).not.toHaveBeenCalled();
  });

  it('rechaza si el usuario ya no existe en la base', async () => {
    const token = signAuthToken({ sub: '7', role: 'CUSTOMER' });
    const { calls } = await authenticateWith({}, { authorization: `Bearer ${token}` });

    expectUnauthorized(firstError(calls), 'Token inválido o vencido.');
  });

  it('rechaza si el usuario está desactivado', async () => {
    const token = signAuthToken({ sub: '1', role: 'CUSTOMER' });
    const { calls } = await authenticateWith(
      { 1: { role: 'CUSTOMER', active: false } },
      { authorization: `Bearer ${token}` },
    );

    expectUnauthorized(firstError(calls), 'Token inválido o vencido.');
  });

  it('rechaza si el rol de la base ya no es el del token', async () => {
    const token = signAuthToken({ sub: '1', role: 'ADMIN' });
    const { calls } = await authenticateWith(
      { 1: { role: 'CASHIER', active: true } },
      { authorization: `Bearer ${token}` },
    );

    expectUnauthorized(firstError(calls), 'Token inválido o vencido.');
  });

  it('usa el mismo mensaje genérico para cualquier sesión que ya no sirve', async () => {
    const token = signAuthToken({ sub: '1', role: 'CUSTOMER' });
    const headers = { authorization: `Bearer ${token}` };

    const mensajes = [
      firstError((await authenticateWith({}, headers)).calls),
      firstError((await authenticateWith({ 1: { role: 'CUSTOMER', active: false } }, headers)).calls),
      firstError((await authenticateWith({ 1: { role: 'ADMIN', active: true } }, headers)).calls),
      firstError((await authenticateWith({ 1: ACTIVO }, { authorization: 'Bearer falso' })).calls),
    ].map((error) => (error as ApiError).message);

    expect(new Set(mensajes).size).toBe(1);
    expect(mensajes[0]).toBe('Token inválido o vencido.');
  });
});

describe('requireRole', () => {
  async function authenticateAs(role: AuthRole): Promise<{ req: Request; next: NextFunction }> {
    const token = signAuthToken({ sub: '1', role });
    const req = makeReq({ authorization: `Bearer ${token}` });
    const { next, calls } = makeNext();

    await createAuthenticate(makeRepository({ 1: { role, active: true } }))(
      req,
      makeRes(),
      next,
    );

    expect(firstError(calls)).toBeUndefined();
    return { req, next };
  }

  it('requiere autenticación con requireRole', () => {
    const req = makeReq();
    const mw = requireRole('CASHIER');
    expect(() => mw(req, makeRes(), makeNext().next)).toThrow(ApiError);
  });

  it('rechaza rol incorrecto con FORBIDDEN', async () => {
    const { req, next } = await authenticateAs('CUSTOMER');
    const mw = requireRole('CASHIER');

    const error = catchApiError(() => mw(req, makeRes(), next));
    expect(error.status).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });

  it('permite rol correcto', async () => {
    const { req, next } = await authenticateAs('CASHIER');
    const mw = requireRole('CASHIER');

    expect(() => mw(req, makeRes(), next)).not.toThrow();
  });

  it('permite múltiples roles', async () => {
    const { req, next } = await authenticateAs('ADMIN');
    const mw = requireRole('CASHIER', 'ADMIN');

    expect(() => mw(req, makeRes(), next)).not.toThrow();
  });
});
