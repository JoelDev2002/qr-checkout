import type { NextFunction, Request, Response } from 'express';
import { verifyAuthToken, type AuthRole, type AuthTokenPayload } from '../infrastructure/jwt.js';
import { findUserById } from '../modules/auth/repository.js';
import { ApiError } from './errorHandler.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthTokenPayload;
  }
}

/** Usuario de la sesión, tal como está hoy en la base. */
export type SessionUser = {
  role: AuthRole;
  active: boolean;
};

/**
 * Devuelve el usuario de la sesión por su id, o null si ya no existe. Se inyecta como
 * parámetro para que el middleware no dependa de Prisma y las pruebas puedan falsificarlo.
 */
export type SessionUserRepository = (userId: number) => Promise<SessionUser | null>;

const MISSING_CREDENTIALS_MESSAGE = 'Se requiere autenticación.';

/** Único mensaje para un token que ya no da acceso: no se revela si el usuario existe o qué pasó. */
const INVALID_SESSION_MESSAGE = 'Token inválido o vencido.';

/** Cabecera, JWT y sesión en la base. Lanza ApiError; no conoce Express. */
async function resolveSession(
  req: Request,
  findSessionUser: SessionUserRepository,
): Promise<AuthTokenPayload> {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw new ApiError(401, 'UNAUTHORIZED', MISSING_CREDENTIALS_MESSAGE);
  }

  const token = header.slice('Bearer '.length).trim();

  if (!token) {
    throw new ApiError(401, 'UNAUTHORIZED', MISSING_CREDENTIALS_MESSAGE);
  }

  let decoded: AuthTokenPayload;

  try {
    decoded = verifyAuthToken(token);
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', INVALID_SESSION_MESSAGE);
  }

  const userId = Number(decoded.sub);

  if (!Number.isInteger(userId)) {
    throw new ApiError(401, 'UNAUTHORIZED', INVALID_SESSION_MESSAGE);
  }

  const user = await findSessionUser(userId);

  if (!user || !user.active || user.role !== decoded.role) {
    throw new ApiError(401, 'UNAUTHORIZED', INVALID_SESSION_MESSAGE);
  }

  return decoded;
}

export function createAuthenticate(
  findSessionUser: SessionUserRepository,
): (req: Request, _res: Response, next: NextFunction) => Promise<void> {
  return (req, _res, next) =>
    resolveSession(req, findSessionUser).then(
      (session) => {
        req.user = session;
        next();
      },
      (error: unknown) => {
        next(error);
      },
    );
}

/**
 * Comprobación de sesión de todas las rutas protegidas: el token por sí solo no basta,
 * el usuario debe seguir existiendo, activo y con el mismo rol con el que se firmó.
 */
export const authenticate = createAuthenticate(findUserById);

export function requireRole(...roles: Array<AuthTokenPayload['role']>): (
  req: Request,
  _res: Response,
  next: NextFunction,
) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHORIZED', MISSING_CREDENTIALS_MESSAGE);
    }

    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, 'FORBIDDEN', 'No tienes permisos para esta acción.');
    }

    next();
  };
}
