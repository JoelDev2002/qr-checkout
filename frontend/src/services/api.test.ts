import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, get } from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('services/api', () => {
  it('devuelve los datos de una respuesta correcta', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { status: 'ok' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(get<{ status: string }>('/health')).resolves.toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('lanza ApiError con el código del servidor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos.' } }, 400),
      ),
    );

    await expect(get('/products')).rejects.toEqual(
      new ApiError('VALIDATION_ERROR', 'Datos inválidos.'),
    );
  });
});