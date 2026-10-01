const baseUrl = import.meta.env.VITE_API_URL ?? '/api';

type DataEnvelope<T> = { data: T };
type ErrorEnvelope = { error: { code: string; message: string } };

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  return typeof body === 'object' && body !== null && 'error' in body;
}

function isDataEnvelope<T>(body: unknown): body is DataEnvelope<T> {
  return typeof body === 'object' && body !== null && 'data' in body;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text === '') {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      response.ok ? 'INVALID_RESPONSE' : 'NETWORK_ERROR',
      response.ok
        ? 'La respuesta del servidor no se pudo leer.'
        : 'No pudimos conectar con el servidor.',
    );
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'No pudimos conectar con el servidor.');
  }

  const body = await parseBody(response);

  if (isErrorEnvelope(body)) {
    throw new ApiError(body.error.code, body.error.message);
  }

  if (!isDataEnvelope<T>(body)) {
    throw new ApiError('INVALID_RESPONSE', 'La respuesta del servidor no tiene el formato esperado.');
  }

  return body.data;
}

export function get<T>(path: string): Promise<T> {
  return request<T>(path);
}