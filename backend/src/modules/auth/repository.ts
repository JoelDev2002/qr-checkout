import type { AuthRole } from '../../infrastructure/jwt.js';
import { prisma } from '../../infrastructure/prisma.js';

export type UserRecord = {
  id: number;
  email: string;
  name: string;
  role: AuthRole;
  googleId: string | null;
  passwordHash: string | null;
  active: boolean;
};

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({ where: { email } });
}

export async function findUserById(id: number): Promise<UserRecord | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function findUserByGoogleId(googleId: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({ where: { googleId } });
}

export async function linkGoogleId(userId: number, googleId: string): Promise<UserRecord> {
  return prisma.user.update({ where: { id: userId }, data: { googleId } });
}

export async function createCustomer(data: {
  email: string;
  name: string;
  googleId?: string | null;
}): Promise<UserRecord> {
  return prisma.user.create({
    data: { email: data.email, name: data.name, role: 'CUSTOMER', googleId: data.googleId ?? null },
  });
}

/** Contrato mínimo que el servicio necesita: permite pruebas con un falsificador de Prisma. */
export type AuthRepository = {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserByGoogleId(googleId: string): Promise<UserRecord | null>;
  linkGoogleId(userId: number, googleId: string): Promise<UserRecord>;
  createCustomer(data: { email: string; name: string; googleId?: string | null }): Promise<UserRecord>;
};