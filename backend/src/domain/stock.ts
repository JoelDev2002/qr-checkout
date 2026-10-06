/** RN-13: todo ajuste manual de stock exige un motivo. */
export const STOCK_REASON_MIN_LENGTH = 3;
export const STOCK_REASON_MAX_LENGTH = 200;

/** Los espacios sobrantes no se guardan: ni al principio ni al final ni entre palabras. */
export function normalizeStockReason(reason: string): string {
  return reason.trim().replace(/\s+/g, ' ');
}
