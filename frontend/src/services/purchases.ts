import type { PurchaseDetail, PurchaseList } from '../types/purchases';
import { get as apiGet } from './api';

export async function getPurchases(params: { page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams();
  if (params.page !== undefined) query.append('page', String(params.page));
  if (params.pageSize !== undefined) query.append('pageSize', String(params.pageSize));
  const qs = query.toString();
  const url = '/purchases' + (qs ? '?' + qs : '');
  return await apiGet<PurchaseList>(url);
}

export async function getPurchaseDetail(saleId: number) {
  return await apiGet<PurchaseDetail>('/purchases/' + saleId);
}
