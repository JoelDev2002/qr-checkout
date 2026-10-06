import { Prisma, type PrismaClient, type Role } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma.js';

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

export type CashierRecord = {
  id: number;
  name: string;
  email: string;
  active: boolean;
  createdAt: Date;
};

/** El hash nunca sale de aquí: el select es la única forma de leer un cajero. */
const cashierSelect = {
  id: true,
  name: true,
  email: true,
  active: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const cashierOrderBy = [{ name: 'asc' }, { id: 'asc' }] satisfies Prisma.UserOrderByWithRelationInput[];

export async function listCashiers(active?: boolean): Promise<CashierRecord[]> {
  return prisma.user.findMany({
    where: { role: 'CASHIER', ...(active === undefined ? {} : { active }) },
    select: cashierSelect,
    orderBy: cashierOrderBy,
  });
}

export async function findCashierById(id: number): Promise<CashierRecord | null> {
  return prisma.user.findFirst({ where: { id, role: 'CASHIER' }, select: cashierSelect });
}

export async function findUserWithEmail(email: string): Promise<{ id: number; role: Role } | null> {
  return prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
}

export async function createCashier(data: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<CashierRecord> {
  return prisma.user.create({
    data: { ...data, role: 'CASHIER', active: true },
    select: cashierSelect,
  });
}

export async function setCashierActive(id: number, active: boolean): Promise<CashierRecord> {
  return prisma.user.update({ where: { id }, data: { active }, select: cashierSelect });
}

/** Traduce el error de unicidad de Prisma (P2002) para que el servicio responda CONFLICT. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}