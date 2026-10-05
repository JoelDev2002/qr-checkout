import type { PrismaClient, Role } from '@prisma/client';

export type SeedUserRecord = {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
};

export async function findUserByEmail(
  client: PrismaClient,
  email: string,
): Promise<SeedUserRecord | null> {
  return client.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
}

export async function createAdminUser(
  client: PrismaClient,
  data: { email: string; name: string; passwordHash: string },
): Promise<SeedUserRecord> {
  return client.user.create({
    data: { ...data, role: 'ADMIN', active: true },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
}
