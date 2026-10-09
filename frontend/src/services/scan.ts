import type { ScannedProduct } from '../types/product';
import { get } from './api';

/**
 * GET /products/barcode/:barcode: el producto activo con sus precios calculados, sus detalles y su
 * límite de compra (RN-04). El navegador nunca calcula los precios.
 */
export function getProductByBarcode(barcode: string): Promise<ScannedProduct> {
  return get<ScannedProduct>(`/products/barcode/${encodeURIComponent(barcode)}`);
}
