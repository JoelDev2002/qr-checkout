// Script de solo lectura (T3.5d): lista los PaymentAttempt que quedaron en un estado
// revisable (CREATED, APPROVED, UNKNOWN o REFUND_FAILED) hace más de 10 minutos, para
// conciliarlos a mano. No modifica nada y nunca llama a Mercado Pago.
// Uso: npm run payments:reconcile

import { prisma } from '../src/infrastructure/prisma.js';
import { findAttemptsForReconciliation } from '../src/modules/payments/repository.js';
import { formatReconcileReport, reconcileCutoff } from './payments-reconcile-format.js';

async function main(): Promise<void> {
  const cutoff = reconcileCutoff(new Date());
  const rows = await findAttemptsForReconciliation(cutoff);

  console.log(formatReconcileReport(rows));
}

main()
  .catch((error: unknown) => {
    console.error(
      'No se pudo completar la conciliación:',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
