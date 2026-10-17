// Lógica pura del script de conciliación de pagos (T3.5d). Sin base de datos ni red:
// solo el corte de tiempo y el formateo, para poder probarlo con Vitest.

export const RECONCILE_AFTER_MINUTES = 10;

/** Una fila revisable del intento de pago: sin datos de tarjeta. */
export type ReconcileRow = {
  attemptId: number;
  mpOrderId: string | null;
  amountCents: number;
  customerEmail: string;
  status: string;
  createdAt: Date;
};

/** Un intento se revisa cuando pasó más de RECONCILE_AFTER_MINUTES desde su creación. */
export function reconcileCutoff(now: Date, minutes: number = RECONCILE_AFTER_MINUTES): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

export function formatReconcileRow(row: ReconcileRow): string {
  const order = row.mpOrderId ?? '(sin order)';

  return [
    `attemptId=${row.attemptId}`,
    `mpOrderId=${order}`,
    `monto=${row.amountCents}`,
    `cliente=${row.customerEmail}`,
    `estado=${row.status}`,
    `fecha=${row.createdAt.toISOString()}`,
  ].join(' | ');
}

export function formatReconcileReport(rows: readonly ReconcileRow[]): string {
  if (rows.length === 0) {
    return 'No hay intentos de pago pendientes de conciliación.';
  }

  return rows.map(formatReconcileRow).join('\n');
}
