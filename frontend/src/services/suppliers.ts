import type {
  CreateSupplierInput,
  SetSupplierActiveInput,
  Supplier,
  SupplierFields,
} from '../types/supplier';
import { get, patch, post, put } from './api';

export function listSuppliers(search?: string): Promise<Supplier[]> {
  const query = search === undefined || search.trim() === '' ? '' : `?search=${encodeURIComponent(search.trim())}`;
  return get<Supplier[]>(`/suppliers${query}`);
}

export function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  return post<Supplier>('/suppliers', input);
}

/** El RUC no se envía: identifica al proveedor y no se cambia. */
export function updateSupplier(id: number, input: SupplierFields): Promise<Supplier> {
  return put<Supplier>(`/suppliers/${id}`, input);
}

export function setSupplierActive(id: number, input: SetSupplierActiveInput): Promise<Supplier> {
  return patch<Supplier>(`/suppliers/${id}/active`, input);
}
