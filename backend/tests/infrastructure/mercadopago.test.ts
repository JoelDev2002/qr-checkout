import { describe, expect, it, vi } from 'vitest';
import {
  createMercadoPagoClient,
  MercadoPagoError,
  type FetchLike,
} from '../../src/infrastructure/mercadopago.js';

type Call = {
  url: string;
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
  };
};

function recordingFetch(
  responder: Response | (() => Promise<Response>),
): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return typeof responder === 'function' ? responder() : responder;
  };
  return { fetchImpl, calls };
}

const processedOrder = {
  id: 'ORD123',
  status: 'processed',
  status_detail: 'accredited',
  transactions: {
    payments: [{ id: 'PAY123', status: 'processed', status_detail: 'accredited' }],
  },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

const createInput = {
  cardToken: 'tok-de-prueba',
  paymentMethodId: 'master',
  paymentType: 'credit_card',
  installments: 1,
  payerEmail: 'test@testuser.com',
  amountCents: 1234,
  externalReference: 'QRC0000000001',
  idempotencyKey: 'QRC0000000001-CREATE',
};

describe('createMercadoPagoClient', () => {
  it('crea la order con cabecera de idempotencia, autorización y monto en texto', async () => {
    const { fetchImpl, calls } = recordingFetch(jsonResponse(processedOrder, 201));
    const client = createMercadoPagoClient({ accessToken: 'test-token', fetch: fetchImpl });

    const order = await client.createOrder(createInput);

    expect(order).toEqual({
      id: 'ORD123',
      status: 'processed',
      statusDetail: 'accredited',
      payments: [{ id: 'PAY123', status: 'processed', statusDetail: 'accredited' }],
    });

    const call = calls[0]!;
    expect(call.url).toBe('https://api.mercadopago.com/v1/orders');
    expect(call.init.method).toBe('POST');
    expect(call.init.headers.Authorization).toBe('Bearer test-token');
    expect(call.init.headers['X-Idempotency-Key']).toBe('QRC0000000001-CREATE');

    const body = JSON.parse(call.init.body ?? '{}') as {
      total_amount: string;
      external_reference: string;
      transactions: { payments: { amount: string; payment_method: Record<string, unknown> }[] };
    };
    expect(body.total_amount).toBe('12.34');
    expect(body.external_reference).toBe('QRC0000000001');
    expect(body.transactions.payments[0]?.amount).toBe('12.34');
    expect(body.transactions.payments[0]?.payment_method).toEqual({
      id: 'master',
      type: 'credit_card',
      token: 'tok-de-prueba',
      installments: 1,
    });
  });

  it('consulta una order con GET', async () => {
    const { fetchImpl, calls } = recordingFetch(jsonResponse(processedOrder));
    const client = createMercadoPagoClient({ accessToken: 'test-token', fetch: fetchImpl });

    await client.getOrder('ORD123');

    expect(calls[0]!.url).toBe('https://api.mercadopago.com/v1/orders/ORD123');
    expect(calls[0]!.init.method).toBe('GET');
  });

  it('cancela una order sin cabecera de idempotencia', async () => {
    const { fetchImpl, calls } = recordingFetch(
      jsonResponse({ id: 'ORD123', status: 'canceled', status_detail: 'canceled' }),
    );
    const client = createMercadoPagoClient({ accessToken: 'test-token', fetch: fetchImpl });

    const order = await client.cancelOrder('ORD123');

    expect(order.status).toBe('canceled');
    expect(calls[0]!.url).toBe('https://api.mercadopago.com/v1/orders/ORD123/cancel');
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.headers['X-Idempotency-Key']).toBeUndefined();
  });

  it('reembolsa el total con cuerpo vacío y cabecera de idempotencia', async () => {
    const { fetchImpl, calls } = recordingFetch(
      jsonResponse({ id: 'ORD123', status: 'processed', status_detail: 'refunded' }),
    );
    const client = createMercadoPagoClient({ accessToken: 'test-token', fetch: fetchImpl });

    await client.refundOrder({ orderId: 'ORD123', idempotencyKey: 'QRC0000000001-REFUND' });

    const call = calls[0]!;
    expect(call.url).toBe('https://api.mercadopago.com/v1/orders/ORD123/refund');
    expect(call.init.headers['X-Idempotency-Key']).toBe('QRC0000000001-REFUND');
    expect(JSON.parse(call.init.body ?? 'null')).toEqual({});
  });

  it('reembolsa parcialmente con el id de la transacción y el monto', async () => {
    const { fetchImpl, calls } = recordingFetch(
      jsonResponse({ id: 'ORD123', status: 'processed', status_detail: 'partially_refunded' }),
    );
    const client = createMercadoPagoClient({ accessToken: 'test-token', fetch: fetchImpl });

    await client.refundOrder({
      orderId: 'ORD123',
      idempotencyKey: 'QRC0000000001-REFUND',
      amountCents: 500,
      transactionId: 'PAY123',
    });

    expect(JSON.parse(calls[0]!.init.body ?? 'null')).toEqual({
      transactions: [{ id: 'PAY123', amount: '5.00' }],
    });
  });
});

describe('createMercadoPagoClient: errores', () => {
  it('mapea un 402 a un rechazo con el código de fallo', async () => {
    const { fetchImpl } = recordingFetch(
      jsonResponse({ id: 'ORD123', status: 'failed', status_detail: 'insufficient_amount' }, 402),
    );
    const client = createMercadoPagoClient({ accessToken: 'test-token', fetch: fetchImpl });

    await expect(client.createOrder(createInput)).rejects.toMatchObject({
      name: 'MercadoPagoError',
      kind: 'REJECTED',
      failureCode: 'insufficient_amount',
      httpStatus: 402,
    });
  });

  it('trata una order con estado failed como rechazo', async () => {
    const { fetchImpl } = recordingFetch(
      jsonResponse({ id: 'ORD123', status: 'failed', status_detail: 'rejected_by_issuer' }, 201),
    );
    const client = createMercadoPagoClient({ accessToken: 'test-token', fetch: fetchImpl });

    await expect(client.createOrder(createInput)).rejects.toMatchObject({
      kind: 'REJECTED',
      failureCode: 'rejected_by_issuer',
    });
  });

  it('mapea otros errores HTTP a un error genérico', async () => {
    const { fetchImpl } = recordingFetch(jsonResponse({ error: 'internal_error' }, 500));
    const client = createMercadoPagoClient({ accessToken: 'test-token', fetch: fetchImpl });

    await expect(client.getOrder('ORD123')).rejects.toMatchObject({
      kind: 'OTHER',
      failureCode: 'internal_error',
      httpStatus: 500,
    });
  });

  it('marca una respuesta ilegible como estado desconocido', async () => {
    const { fetchImpl } = recordingFetch(new Response('no es json', { status: 200 }));
    const client = createMercadoPagoClient({ accessToken: 'test-token', fetch: fetchImpl });

    await expect(client.getOrder('ORD123')).rejects.toMatchObject({ kind: 'UNKNOWN_STATUS' });
  });

  it('marca una order sin id como estado desconocido', async () => {
    const { fetchImpl } = recordingFetch(jsonResponse({ status: 'processed' }));
    const client = createMercadoPagoClient({ accessToken: 'test-token', fetch: fetchImpl });

    await expect(client.getOrder('ORD123')).rejects.toMatchObject({ kind: 'UNKNOWN_STATUS' });
  });

  it('mapea un error de red a NETWORK', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('fetch failed');
    };
    const client = createMercadoPagoClient({ accessToken: 'test-token', fetch: fetchImpl });

    await expect(client.getOrder('ORD123')).rejects.toBeInstanceOf(MercadoPagoError);
    await expect(client.getOrder('ORD123')).rejects.toMatchObject({ kind: 'NETWORK' });
  });

  it('mapea un tiempo agotado a NETWORK', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl: FetchLike = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      const client = createMercadoPagoClient({
        accessToken: 'test-token',
        fetch: fetchImpl,
        timeoutMs: 15000,
      });

      const promise = client.getOrder('ORD123');
      const assertion = expect(promise).rejects.toMatchObject({ kind: 'NETWORK' });
      await vi.advanceTimersByTimeAsync(15000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
