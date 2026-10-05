import type { AuthRole } from '../../infrastructure/jwt.js';
import { prisma } from '../../infrastructure/prisma.js';

export type UserRecord = {
  id: number;
  email: string;
  name: string;
  role: AuthRole;
  passwordHash: string | null;
  active: boolean;
};

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({ where: { email } });
}

export async function findUserById(id: number): Promise<UserRecord | null> {
  return prisma.user.findUnique({ where: { id } });
}