import { ApiError } from '../../middlewares/errorHandler.js';
import {
  createSupplier as createSupplierRecord,
  findSupplierById,
  findSupplierByRuc,
  isUniqueViolation,
  listSuppliers as listSupplierRecords,
  setSupplierActive as setSupplierActiveRecord,
  updateSupplier as updateSupplierRecord,
  type SupplierRecord,
} from './repository.js';
import type { CreateSupplierInput, ListSuppliersQuery, UpdateSupplierInput } from './schemas.js';

const SUPPLIER_NOT_FOUND_MESSAGE = 'El proveedor no existe.';

export type SupplierView = {
  id: number;
  ruc: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function toSupplierView(supplier: SupplierRecord): SupplierView {
  return {
    id: supplier.id,
    ruc: supplier.ruc,
    businessName: supplier.businessName,
    contactName: supplier.contactName,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    active: supplier.active,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}

function duplicateRucMessage(ruc: string): string {
  return `Ya existe un proveedor con el RUC ${ruc}.`;
}

async function requireSupplier(id: number): Promise<SupplierRecord> {
  const supplier = await findSupplierById(id);

  if (!supplier) {
    throw new ApiError(404, 'NOT_FOUND', SUPPLIER_NOT_FOUND_MESSAGE);
  }

  return supplier;
}

/** En orden por razón social. Los proveedores no se borran: se desactivan. */
export async function listSuppliers(query: ListSuppliersQuery): Promise<SupplierView[]> {
  return (await listSupplierRecords(query)).map(toSupplierView);
}

export async function getSupplier(id: number): Promise<SupplierView> {
  return toSupplierView(await requireSupplier(id));
}

/** El RUC es único: si ya existe (activo o no), responde 409. */
export async function createSupplier(input: CreateSupplierInput): Promise<SupplierView> {
  if (await findSupplierByRuc(input.ruc)) {
    throw new ApiError(409, 'CONFLICT', duplicateRucMessage(input.ruc));
  }

  try {
    return toSupplierView(await createSupplierRecord(input));
  } catch (error) {
    // El preaviso cubre el caso normal; esto cubre dos altas simultáneas del mismo RUC.
    if (isUniqueViolation(error)) {
      throw new ApiError(409, 'CONFLICT', duplicateRucMessage(input.ruc));
    }

    throw error;
  }
}

export async function updateSupplier(id: number, input: UpdateSupplierInput): Promise<SupplierView> {
  await requireSupplier(id);

  return toSupplierView(await updateSupplierRecord(id, input));
}

export async function setSupplierActive(id: number, active: boolean): Promise<SupplierView> {
  await requireSupplier(id);

  return toSupplierView(await setSupplierActiveRecord(id, active));
}
