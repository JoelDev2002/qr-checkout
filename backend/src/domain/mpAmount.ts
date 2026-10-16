import { createHash } from 'node:crypto';

/**
 * Convierte céntimos enteros al monto que exige Orders API de Mercado Pago: una cadena con
 * dos decimales (MERCADOPAGO_REFERENCE.md §(b)). Solo aritmética entera, sin coma flotante.
 * Rechaza montos que no sean céntimos positivos.
 */
export function centsToMpAmount(cents: number): string {
  if (!Number.isInteger(cents) || cents <= 0) {
    throw new Error('El monto debe ser un entero de céntimos mayor que cero.');
  }

  const units = Math.floor(cents / 100);
  const decimals = cents % 100;

  return `${units}.${decimals.toString().padStart(2, '0')}`;
}

/**
 * `external_reference` solo admite mayúsculas alfanuméricas, sin guiones
 * (MERCADOPAGO_REFERENCE.md §(f) y §(g)). Es determinista a partir del id del intento.
 */
export function toExternalReference(attemptId: number): string {
  if (!Number.isInteger(attemptId) || attemptId <= 0) {
    throw new Error('El id del intento debe ser un entero positivo.');
  }

  return `QRC${attemptId.toString().padStart(10, '0')}`;
}

/** Clave de idempotencia estable por intento y operación; cada operación usa una distinta. */
export function idempotencyKeyFor(attemptId: number, operation: string): string {
  const normalized = operation.trim().toUpperCase();

  if (normalized === '') {
    throw new Error('La operación no puede estar vacía.');
  }

  return `${toExternalReference(attemptId)}-${normalized}`;
}

/** SHA-256 en hexadecimal; es lo único que se guarda del token de la tarjeta (RN-20, RN-28). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
