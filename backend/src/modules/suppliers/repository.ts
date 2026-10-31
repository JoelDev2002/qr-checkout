import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma.js';

export type SupplierRecord = {
  id: number;
  ruc: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SupplierData = {
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

const supplierOrderBy = [
  { businessName: 'asc' },
  { id: 'asc' },
] satisfies Prisma.SupplierOrderByWithRelationInput[];

export async function listSuppliers(filters: {
  search?: string;
  active?: boolean;
}): Promise<SupplierRecord[]> {
  const where: Prisma.SupplierWhereInput = {
    ...(filters.active === undefined ? {} : { active: filters.active }),
    ...(filters.search === undefined
      ? {}
      : { OR: [{ businessName: { contains: filters.search } }, { ruc: { contains: filters.search } }] }),
  };

  return prisma.supplier.findMany({ where, orderBy: supplierOrderBy });
}

export async function findSupplierById(id: number): Promise<SupplierRecord | null> {
  return prisma.supplier.findUnique({ where: { id } });
}

export async function findSupplierByRuc(ruc: string): Promise<SupplierRecord | null> {
  return prisma.supplier.findUnique({ where: { ruc } });
}

export async function createSupplier(data: SupplierData & { ruc: string }): Promise<SupplierRecord> {
  return prisma.supplier.create({ data: { ...data, active: true } });
}

export async function updateSupplier(id: number, data: SupplierData): Promise<SupplierRecord> {
  return prisma.supplier.update({ where: { id }, data });
}

export async function setSupplierActive(id: number, active: boolean): Promise<SupplierRecord> {
  return prisma.supplier.update({ where: { id }, data: { active } });
}

/** Traduce el error de unicidad de Prisma (P2002) para que el servicio responda CONFLICT. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
