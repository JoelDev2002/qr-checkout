import { centsToMpAmount } from '../domain/mpAmount.js';

/**
 * Cliente HTTP de bajo nivel para la Orders API de Mercado Pago, sin SDK
 * (MERCADOPAGO_REFERENCE.md §(b) y §(c)). Nunca registra el access token, el token de la
 * tarjeta ni las respuestas completas: los errores que expone solo llevan un código.
 */

export type MercadoPagoErrorKind = 'REJECTED' | 'NETWORK' | 'UNKNOWN_STATUS' | 'OTHER';

export class MercadoPagoError extends Error {
  constructor(
    readonly kind: MercadoPagoErrorKind,
    message: string,
    readonly failureCode: string | null = null,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = 'MercadoPagoError';
  }
}

export type MpOrderPayment = {
  id: string;
  status: string;
  statusDetail: string | null;
};

export type MpOrder = {
  id: string;
  status: string;
  statusDetail: string | null;
  payments: MpOrderPayment[];
};

export type CreateOrderInput = {
  /** Token de un solo uso que entrega el Brick; nunca se guarda en claro. */
  cardToken: string;
  /** `transactions.payments[].payment_method.id`. */
  paymentMethodId: string;
  /** `transactions.payments[].payment_method.type` (`credit_card` o `debit_card`). */
  paymentType: string;
  installments: number;
  payerEmail: string;
  amountCents: number;
  externalReference: string;
  idempotencyKey: string;
};

export type RefundOrderInput = {
  orderId: string;
  idempotencyKey: string;
  /** Sin `amountCents` el reembolso es total; con monto exige `transactionId` (parcial). */
  amountCents?: number;
  transactionId?: string;
};

export type MercadoPagoClient = {
  createOrder(input: CreateOrderInput): Promise<MpOrder>;
  getOrder(orderId: string): Promise<MpOrder>;
  cancelOrder(orderId: string): Promise<MpOrder>;
  refundOrder(input: RefundOrderInput): Promise<MpOrder>;
};

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
  },
) => Promise<Response>;

export type MercadoPagoClientConfig = {
  accessToken: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: FetchLike;
};

const DEFAULT_BASE_URL = 'https://api.mercadopago.com';
const DEFAULT_TIMEOUT_MS = 15000;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function extractFailureCode(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.status_detail === 'string') {
    return record.status_detail;
  }

  if (typeof record.error === 'string') {
    return record.error;
  }

  if (typeof record.error === 'object' && record.error !== null) {
    const code = (record.error as Record<string, unknown>).code;
    if (typeof code === 'string') {
      return code;
    }
  }

  return null;
}

function parsePayments(transactions: unknown): MpOrderPayment[] {
  if (typeof transactions !== 'object' || transactions === null) {
    return [];
  }

  const payments = (transactions as Record<string, unknown>).payments;
  if (!Array.isArray(payments)) {
    return [];
  }

  return payments.flatMap((payment): MpOrderPayment[] => {
    if (typeof payment !== 'object' || payment === null) {
      return [];
    }

    const record = payment as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.status !== 'string') {
      return [];
    }

    return [
      {
        id: record.id,
        status: record.status,
        statusDetail: typeof record.status_detail === 'string' ? record.status_detail : null,
      },
    ];
  });
}

function parseOrder(payload: unknown): MpOrder {
  if (typeof payload !== 'object' || payload === null) {
    throw new MercadoPagoError('UNKNOWN_STATUS', 'Mercado Pago no devolvió una order válida.');
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.status !== 'string') {
    throw new MercadoPagoError('UNKNOWN_STATUS', 'Mercado Pago no devolvió una order válida.');
  }

  return {
    id: record.id,
    status: record.status,
    statusDetail: typeof record.status_detail === 'string' ? record.status_detail : null,
    payments: parsePayments(record.transactions),
  };
}

export function createMercadoPagoClient(config: MercadoPagoClientConfig): MercadoPagoClient {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = config.fetch ?? (fetch as FetchLike);

  async function send(
    method: string,
    path: string,
    body: unknown | null,
    idempotencyKey: string | null,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    };
    if (idempotencyKey !== null) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }

    try {
      let response: Response;
      try {
        response = await doFetch(`${baseUrl}${path}`, {
          method,
          headers,
          body: body === null ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        if (isAbortError(error)) {
          throw new MercadoPagoError(
            'NETWORK',
            'La petición a Mercado Pago agotó el tiempo de espera.',
          );
        }
        throw new MercadoPagoError('NETWORK', 'No se pudo conectar con Mercado Pago.');
      }

      const text = await response.text();
      let payload: unknown = null;
      if (text !== '') {
        try {
          payload = JSON.parse(text) as unknown;
        } catch {
          throw new MercadoPagoError(
            'UNKNOWN_STATUS',
            'Mercado Pago devolvió una respuesta que no se pudo interpretar.',
            null,
            response.status,
          );
        }
      }

      if (!response.ok) {
        // POST /v1/orders responde 402 cuando la order se creó pero la transacción falló.
        if (response.status === 402) {
          throw new MercadoPagoError(
            'REJECTED',
            'Mercado Pago rechazó el pago.',
            extractFailureCode(payload),
            response.status,
          );
        }

        throw new MercadoPagoError(
          'OTHER',
          'Mercado Pago respondió con un error.',
          extractFailureCode(payload),
          response.status,
        );
      }

      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async createOrder(input) {
      const amount = centsToMpAmount(input.amountCents);
      const body = {
        type: 'online',
        processing_mode: 'automatic',
        total_amount: amount,
        external_reference: input.externalReference,
        payer: { email: input.payerEmail },
        transactions: {
          payments: [
            {
              amount,
              payment_method: {
                id: input.paymentMethodId,
                type: input.paymentType,
                token: input.cardToken,
                installments: input.installments,
              },
            },
          ],
        },
      };

      const order = parseOrder(await send('POST', '/v1/orders', body, input.idempotencyKey));

      if (order.status === 'failed') {
        throw new MercadoPagoError(
          'REJECTED',
          'Mercado Pago rechazó el pago.',
          order.statusDetail,
        );
      }

      return order;
    },

    async getOrder(orderId) {
      return parseOrder(await send('GET', `/v1/orders/${encodeURIComponent(orderId)}`, null, null));
    },

    async cancelOrder(orderId) {
      return parseOrder(
        await send('POST', `/v1/orders/${encodeURIComponent(orderId)}/cancel`, null, null),
      );
    },

    async refundOrder(input) {
      let body: unknown = {};

      if (input.amountCents !== undefined) {
        if (input.transactionId === undefined) {
          throw new Error('El reembolso parcial exige el id de la transacción.');
        }
        body = {
          transactions: [
            { id: input.transactionId, amount: centsToMpAmount(input.amountCents) },
          ],
        };
      }

      return parseOrder(
        await send(
          'POST',
          `/v1/orders/${encodeURIComponent(input.orderId)}/refund`,
          body,
          input.idempotencyKey,
        ),
      );
    },
  };
}
