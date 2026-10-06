import { ApiError } from '../../middlewares/errorHandler.js';
import {
  findPurchaseByIdForCustomer,
  findPurchasesByCustomer,
  type PurchaseDetail,
  type PurchaseList,
} from './repository.js';
import type { PurchasesQuery } from './schemas.js';
import {
  PURCHASES_DEFAULT_PAGE,
  PURCHASES_DEFAULT_PAGE_SIZE,
} from './schemas.js';

export async function getCustomerPurchases(
  customerId: number,
  query: PurchasesQuery,
): Promise<PurchaseList> {
  const page = query.page ?? PURCHASES_DEFAULT_PAGE;
  const pageSize = query.pageSize ?? PURCHASES_DEFAULT_PAGE_SIZE;

  return findPurchasesByCustomer(customerId, page, pageSize);
}

export async function getCustomerPurchase(
  customerId: number,
  saleId: number,
): Promise<PurchaseDetail> {
  const purchase = await findPurchaseByIdForCustomer(customerId, saleId);
  if (!purchase) {
    throw new ApiError(404, 'NOT_FOUND', 'Compra no encontrada');
  }
  return purchase;
}
