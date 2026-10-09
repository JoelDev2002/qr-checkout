/** Reglas del contador de cantidad del cliente (RN-04, RN-19). Lógica pura, sin React. */

/** La cantidad nunca baja de 1 ni supera el límite del producto (menor entre máximo y stock). */
export function normalizeQuantity(value: number, maxQuantity: number): number {
  const max = Math.max(1, Math.trunc(Number.isFinite(maxQuantity) ? maxQuantity : 1));
  const base = Number.isFinite(value) ? Math.trunc(value) : 1;

  return Math.min(max, Math.max(1, base));
}

/** Cuánto queda al pulsar − o +, sin salir de [1, maxQuantity]. */
export function stepQuantity(value: number, delta: number, maxQuantity: number): number {
  return normalizeQuantity(value + delta, maxQuantity);
}

/** Interpreta lo escrito en el número: null si no es un entero de 1 en adelante. */
export function parseQuantityInput(raw: string): number | null {
  const text = raw.trim();

  if (!/^\d+$/.test(text)) {
    return null;
  }

  const value = Number(text);

  return value >= 1 ? value : null;
}
