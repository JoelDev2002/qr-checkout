import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export type AuthRole = 'CUSTOMER' | 'CASHIER' | 'ADMIN';

export type AuthTokenPayload = {
  sub: string;
  role: AuthRole;
  email?: string;
} & JwtPayload;

/** Único algoritmo admitido: se fija al firmar y al verificar para no aceptar ninguno otro. */
const ALGORITHM = 'HS256';

export function signAuthToken(payload: AuthTokenPayload): string {
  const options: SignOptions = {
    algorithm: ALGORITHM,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };

  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] }) as AuthTokenPayload;
  return decoded;
}
