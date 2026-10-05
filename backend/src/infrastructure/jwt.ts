import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export type AuthRole = 'CUSTOMER' | 'CASHIER' | 'ADMIN';

export type AuthTokenPayload = {
  sub: string;
  role: AuthRole;
  email?: string;
} & JwtPayload;

export function signAuthToken(payload: AuthTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };

  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
  return decoded;
}