/**
 * RN-18: el servidor entrega el porcentaje ya redondeado a entero. Aquí solo se le da formato de
 * presentación (`−58%`); nunca se recalcula a partir de precios en el navegador.
 */
export function formatDiscountPercent(percent: number | null | undefined): string | null {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) {
    return null;
  }

  const rounded = Math.round(percent);

  return rounded > 0 ? `\u2212${rounded}%` : null;
}
