export type PaymentMethodLabel = 'Efectivo' | 'Tarjeta CMR' | 'Otra tarjeta' | 'En línea';
export function paymentMethodLabel(method: string): PaymentMethodLabel {
  const normalized = method.toUpperCase();
  if (normalized === 'CASH') return 'Efectivo';
  if (normalized === 'CMR_CARD') return 'Tarjeta CMR';
  if (normalized === 'CMR') return 'Tarjeta CMR';
  if (normalized === 'OTHER_CARD') return 'Otra tarjeta';
  if (normalized === 'CARD') return 'Otra tarjeta';
  if (normalized === 'ONLINE') return 'En línea';
  return 'Otra tarjeta';
}
