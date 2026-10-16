import { Prisma, type PaymentAttemptStatus, type DocType } from '@prisma/client';
import { generateExitCode } from '../../domain/cartCode.js';
import { formatReceiptNumber } from '../../domain/document.js';
import { toExternalReference } from '../../domain/mpAmount.js';
import { prisma } from '../../infrastructure/prisma.js';
import {
  nextSeriesNumber,
  saleSelect,
  toSaleRecord,
  type CreatePaidSaleItem,
  type SaleRecord,
} from '../checkout/repository.js';

/** Lo que el servicio necesita saber de un intento de pago en línea (RN-28). */
export type PaymentAttemptRecord = {
  id: number;
  tokenHash: string;
  cartId: number;
  customerId: number;
  amountCents: number;
  status: PaymentAttemptStatus;
  mpOrderId: string | null;
  externalReference: string;
  failureCode: string | null;
};

const attemptSelect = {
  id: true,
  tokenHash: true,
  cartId: true,
  customerId: true,
  amountCents: true,
  status: true,
  mpOrderId: true,
  externalReference: true,
  failureCode: true,
} satisfies Prisma.PaymentAttemptSelect;

/**
 * Falla prevista al escribir la venta en línea. Se lanza dentro de la transacción para que Prisma
 * revierta carrito, stock y numeración; el servicio responde un 500 genérico sin reembolsar (T3.5d).
 */
export class OnlineSaleConflict extends Error {
  constructor(
    readonly reason: 'CART_NOT_OPEN' | 'OUT_OF_STOCK',
    /** Solo en OUT_OF_STOCK: qué producto no pudo descontarse. */
    readonly productName: string | null = null,
  ) {
    super(reason);
    this.name = 'OnlineSaleConflict';
  }
}

/** RN-28: un token solo se cobra una vez; el hash es lo único que se guarda. */
export async function findAttemptByTokenHash(tokenHash: string): Promise<PaymentAttemptRecord | null> {
  return prisma.paymentAttempt.findUnique({ where: { tokenHash }, select: attemptSelect });
}

/**
 * Crea el intento en CREATED. La `external_reference` se deriva del id, que recién existe al crear la
 * fila: por eso se escribe primero un valor provisional (el propio hash, ya único) y se reemplaza en
 * la misma transacción. Si otra petición con el mismo token ganó la carrera, se devuelve su intento.
 */
export async function createAttempt(input: {
  tokenHash: string;
  cartId: number;
  customerId: number;
  amountCents: number;
}): Promise<PaymentAttemptRecord> {
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.paymentAttempt.create({
        data: {
          tokenHash: input.tokenHash,
          cartId: input.cartId,
          customerId: input.customerId,
          amountCents: input.amountCents,
          externalReference: input.tokenHash,
        },
        select: { id: true },
      });

      return tx.paymentAttempt.update({
        where: { id: created.id },
        data: { externalReference: toExternalReference(created.id) },
        select: attemptSelect,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await findAttemptByTokenHash(input.tokenHash);
      if (existing) {
        return existing;
      }
    }

    throw error;
  }
}

/** El correo de la cuenta con la que paga el cliente: el cuerpo de la petición no lo manda. */
export async function findCustomerEmail(customerId: number): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: customerId }, select: { email: true } });

  return user?.email ?? null;
}

export async function setAttemptFailed(attemptId: number, failureCode: string | null): Promise<void> {
  await prisma.paymentAttempt.update({
    where: { id: attemptId },
    data: { status: 'FAILED', failureCode },
  });
}

export async function setAttemptUnknown(attemptId: number, failureCode: string | null): Promise<void> {
  await prisma.paymentAttempt.update({
    where: { id: attemptId },
    data: { status: 'UNKNOWN', failureCode },
  });
}

export async function setAttemptApproved(attemptId: number, mpOrderId: string): Promise<void> {
  await prisma.paymentAttempt.update({
    where: { id: attemptId },
    data: { status: 'APPROVED', mpOrderId },
  });
}

/** La venta de un intento ya cobrado, para devolverla sin volver a cobrar (RN-28). */
export async function findSaleByCartId(cartId: number): Promise<SaleRecord | null> {
  const row = await prisma.sale.findUnique({ where: { cartId }, select: saleSelect });

  return row ? toSaleRecord(row) : null;
}

/** RN-23: el código `O-XXXXX` es único; se reintenta si ya existe. */
export async function generateUniqueExitCode(): Promise<string> {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const code = generateExitCode();
    const existing = await prisma.sale.findUnique({ where: { code }, select: { id: true } });

    if (!existing) {
      return code;
    }
  }

  throw new Error('No se pudo generar un código de salida único.');
}

export type CreateOnlinePaidSaleInput = {
  attemptId: number;
  /** Código de salida `O-XXXXX` de la venta (RN-23). */
  code: string;
  /** T001, B001 o F001, según el comprobante (RN-23). */
  series: string;
  cartId: number;
  customerId: number;
  originalTotalCents: number;
  offerTotalCents: number;
  cmrTotalCents: number;
  totalCents: number;
  docType: DocType;
  buyerDocType: string | null;
  buyerDocNumber: string | null;
  buyerName: string | null;
  buyerEmail: string;
  cardBrand: string;
  cardLast4: string | null;
  items: CreatePaidSaleItem[];
};

/**
 * ARCHITECTURE.md §7: una sola transacción para la venta en línea. El carrito pasa de OPEN a PAID con
 * una actualización condicionada, cada ítem baja su stock condicionado a la cantidad, y solo entonces
 * se numera el comprobante, se crea la venta y el intento queda en SALE_CREATED. Si algo falla, la
 * excepción revierte todo y el intento sigue APPROVED para la conciliación de T3.5d.
 */
export async function createOnlinePaidSale(input: CreateOnlinePaidSaleInput): Promise<SaleRecord> {
  return prisma.$transaction(
    async (tx) => {
      const paid = await tx.cart.updateMany({
        where: { id: input.cartId, status: 'OPEN' },
        data: { status: 'PAID' },
      });

      if (paid.count === 0) {
        throw new OnlineSaleConflict('CART_NOT_OPEN');
      }

      for (const item of input.items) {
        const updated = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });

        if (updated.count === 0) {
          throw new OnlineSaleConflict('OUT_OF_STOCK', item.name);
        }
      }

      const receiptNumber = formatReceiptNumber(input.series, await nextSeriesNumber(tx, input.series));

      const row = await tx.sale.create({
        data: {
          code: input.code,
          receiptNumber,
          cartId: input.cartId,
          customerId: input.customerId,
          cashierId: null,
          paymentMethod: 'ONLINE',
          priceApplied: 'NORMAL',
          originalTotalCents: input.originalTotalCents,
          offerTotalCents: input.offerTotalCents,
          cmrTotalCents: input.cmrTotalCents,
          totalCents: input.totalCents,
          docType: input.docType,
          buyerDocType: input.buyerDocType,
          buyerDocNumber: input.buyerDocNumber,
          buyerName: input.buyerName,
          buyerEmail: input.buyerEmail,
          cardBrand: input.cardBrand,
          cardLast4: input.cardLast4,
          items: {
            create: input.items.map((item) => ({
              productId: item.productId,
              barcode: item.barcode,
              name: item.name,
              quantity: item.quantity,
              originalPriceCents: item.originalPriceCents,
              normalPriceCents: item.normalPriceCents,
              cmrPriceCents: item.cmrPriceCents,
              paidPriceCents: item.paidPriceCents,
              subtotalCents: item.subtotalCents,
              campaignName: item.campaignName,
            })),
          },
        },
        select: saleSelect,
      });

      await tx.paymentAttempt.update({
        where: { id: input.attemptId },
        data: { status: 'SALE_CREATED' },
      });

      return toSaleRecord(row);
    },
    { timeout: 10_000 },
  );
}
