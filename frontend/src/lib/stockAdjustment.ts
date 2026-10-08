/** RN-13: el motivo del ajuste va de 3 a 200 caracteres (igual que backend/src/domain/stock.ts). */
export const STOCK_REASON_MIN_LENGTH = 3;
export const STOCK_REASON_MAX_LENGTH = 200;

export type DeltaValidation =
  | { ok: true; value: number }
  | { ok: false; message: string };

export type ReasonValidation =
  | { ok: true; value: string }
  | { ok: false; message: string };

/** RN-13: la cantidad debe ser un entero distinto de 0; el signo indica si suma o resta. */
export function validateDelta(raw: string): DeltaValidation {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { ok: false, message: 'La cantidad del ajuste es obligatoria.' };
  }

  if (!/^[+-]?\d+$/.test(trimmed)) {
    return { ok: false, message: 'La cantidad debe ser un número entero.' };
  }

  const value = Number(trimmed);

  if (!Number.isSafeInteger(value)) {
    return { ok: false, message: 'La cantidad debe ser un número entero.' };
  }

  if (value === 0) {
    return { ok: false, message: 'La cantidad debe ser distinta de cero.' };
  }

  return { ok: true, value };
}

/** RN-13: motivo obligatorio, de 3 a 200 caracteres, sin los espacios sobrantes. */
export function validateReason(raw: string): ReasonValidation {
  const reason = raw.trim();

  if (reason.length === 0) {
    return { ok: false, message: 'El motivo del ajuste es obligatorio.' };
  }

  if (reason.length < STOCK_REASON_MIN_LENGTH) {
    return {
      ok: false,
      message: `El motivo debe tener al menos ${STOCK_REASON_MIN_LENGTH} caracteres.`,
    };
  }

  if (reason.length > STOCK_REASON_MAX_LENGTH) {
    return {
      ok: false,
      message: `El motivo no puede tener más de ${STOCK_REASON_MAX_LENGTH} caracteres.`,
    };
  }

  return { ok: true, value: reason };
}

/** Cuántas unidades quedarían tras aplicar el ajuste (RN-13). */
export function resultingStock(stock: number, delta: number): number {
  return stock + delta;
}

/** El stock nunca puede quedar en negativo: la API responde 409 OUT_OF_STOCK. */
export function wouldGoNegative(stock: number, delta: number): boolean {
  return resultingStock(stock, delta) < 0;
}

/** Cantidad con signo para el historial: "+5" suma y "−3" resta. */
export function formatSignedDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

/** Fecha corta de un ajuste en la zona horaria del navegador, por ejemplo "07/10/2026 14:30". */
export function formatAdjustmentDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}