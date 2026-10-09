export type PaymentMethodLabel = 'Efectivo' | 'Tarjeta CMR' | 'Otra tarjeta' | 'En l�nea';

export function paymentMethodLabel(method: string): PaymentMethodLabel {
  const normalized = method.toUpperCase();

  if (normalized === 'CASH') return 'Efectivo';
  if (normalized === 'CMR') return 'Tarjeta CMR';
  if (normalized === 'CARD') return 'Otra tarjeta';
  if (normalized === 'ONLINE') return 'En l�nea';

  return 'Otra tarjeta';
}

