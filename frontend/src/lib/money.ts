const wholeCentsFormatter = new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true,
});

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '− ' : '';
  const absoluteCents = Math.abs(cents);
  const whole = wholeCentsFormatter.format(Math.trunc(absoluteCents / 100));
  const decimals = (absoluteCents % 100).toString().padStart(2, '0');

  return `${sign}S/ ${whole}.${decimals}`;
}