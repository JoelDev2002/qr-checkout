import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/infrastructure/prisma.js';
import { findAttemptsForReconciliation } from '../../src/modules/payments/repository.js';
import {
  RECONCILE_AFTER_MINUTES,
  formatReconcileReport,
  reconcileCutoff,
  type ReconcileRow,
} from '../../scripts/payments-reconcile-format.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

/**
 * El script `npm run payments:reconcile` lista, sin modificar nada, los intentos de pago que
 * quedaron en un estado revisable hace más de 10 minutos (T3.5d).
 */

const NOW = new Date('2026-10-16T12:00:00.000Z');
const OLD = new Date(NOW.getTime() - 11 * 60_000);
const RECENT = new Date(NOW.getTime() - 5 * 60_000);

let emailCounter = 0;

async function seedAttempt(data: {
  status: 'CREATED' | 'APPROVED' | 'UNKNOWN' | 'REFUND_FAILED' | 'REFUNDED' | 'SALE_CREATED' | 'FAILED';
  createdAt: Date;
  mpOrderId?: string | null;
  amountCents?: number;
}): Promise<{ id: number; email: string }> {
  emailCounter += 1;
  const email = `conciliacion-${emailCounter}@falabella.com`;
  const customer = await getTestPrisma().user.create({
    data: { email, name: 'Cliente Conciliación', role: 'CUSTOMER' },
    select: { id: true },
  });
  const cart = await getTestPrisma().cart.create({
    data: { customerId: customer.id },
    select: { id: true },
  });

  const attempt = await getTestPrisma().paymentAttempt.create({
    data: {
      tokenHash: `hash-${emailCounter}`,
      cartId: cart.id,
      customerId: customer.id,
      amountCents: data.amountCents ?? 3990,
      status: data.status,
      mpOrderId: data.mpOrderId ?? null,
      externalReference: `QRC${String(emailCounter).padStart(10, '0')}`,
      createdAt: data.createdAt,
    },
    select: { id: true },
  });

  return { id: attempt.id, email };
}

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('reconcileCutoff', () => {
  it('retrocede 10 minutos por defecto', () => {
    expect(RECONCILE_AFTER_MINUTES).toBe(10);
    expect(reconcileCutoff(NOW).toISOString()).toBe('2026-10-16T11:50:00.000Z');
  });
});

describe('formatReconcileReport', () => {
  const row: ReconcileRow = {
    attemptId: 7,
    mpOrderId: 'MP-ORDER-7',
    amountCents: 3990,
    customerEmail: 'cliente@falabella.com',
    status: 'UNKNOWN',
    createdAt: OLD,
  };

  it('arma una línea con attemptId, order, monto, cliente, estado y fecha', () => {
    expect(formatReconcileReport([row])).toBe(
      `attemptId=7 | mpOrderId=MP-ORDER-7 | monto=3990 | cliente=cliente@falabella.com | estado=UNKNOWN | fecha=${OLD.toISOString()}`,
    );
  });

  it('avisa cuando no hay nada que conciliar', () => {
    expect(formatReconcileReport([])).toBe('No hay intentos de pago pendientes de conciliación.');
  });
});

describe('findAttemptsForReconciliation', () => {
  it('lista solo los estados revisables creados hace más de 10 minutos', async () => {
    const created = await seedAttempt({ status: 'CREATED', createdAt: OLD });
    const approved = await seedAttempt({ status: 'APPROVED', createdAt: OLD, mpOrderId: 'MP-A' });
    const unknown = await seedAttempt({ status: 'UNKNOWN', createdAt: OLD, mpOrderId: 'MP-U' });
    const refundFailed = await seedAttempt({
      status: 'REFUND_FAILED',
      createdAt: OLD,
      mpOrderId: 'MP-R',
    });
    const saleCreated = await seedAttempt({ status: 'SALE_CREATED', createdAt: OLD });
    const refunded = await seedAttempt({ status: 'REFUNDED', createdAt: OLD });
    const failed = await seedAttempt({ status: 'FAILED', createdAt: OLD });
    const recent = await seedAttempt({ status: 'CREATED', createdAt: RECENT });

    const rows = await findAttemptsForReconciliation(reconcileCutoff(NOW));
    const report = formatReconcileReport(rows);

    const included = [created, approved, unknown, refundFailed];

    for (const attempt of included) {
      expect(report).toContain(`attemptId=${attempt.id}`);
      expect(report).toContain(attempt.email);
    }

    for (const attempt of [saleCreated, refunded, failed, recent]) {
      expect(report).not.toContain(`attemptId=${attempt.id}`);
    }

    expect(rows).toHaveLength(included.length);
  });

  it('no modifica nada: los intentos quedan igual tras listarlos', async () => {
    const attempt = await seedAttempt({ status: 'APPROVED', createdAt: OLD, mpOrderId: 'MP-KEEP' });

    await findAttemptsForReconciliation(reconcileCutoff(NOW));

    const guardado = await getTestPrisma().paymentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });

    expect(guardado.status).toBe('APPROVED');
    expect(guardado.mpOrderId).toBe('MP-KEEP');
    expect(guardado.createdAt.toISOString()).toBe(OLD.toISOString());
  });
});
