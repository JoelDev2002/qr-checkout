import { clearSession, readSession, type SessionUser } from '../lib/session';

const baseUrl = import.meta.env.VITE_API_URL ?? '/api';

// Rutas públicas: un 401 aquí es una respuesta normal de la pantalla, no una sesión vencida.
const PUBLIC_PATHS = ['/auth/login', '/auth/google', '/auth/dev-login', '/health'];

type DataEnvelope<T> = { data: T };
type ErrorEnvelope = { error: { code: string; message: string } };

export type LoginResult = {
  token: string;
  user: SessionUser;
};

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler = () => {};

/** La app registra aquí qué hacer cuando el servidor responde 401 en una ruta protegida. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

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

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.includes(path);
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
  const session = readSession();
  const headers = new Headers(init?.headers);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (session !== null) {
    headers.set('Authorization', `Bearer ${session.token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'No pudimos conectar con el servidor.');
  }

  const body = await parseBody(response);

  if (response.status === 401 && !isPublicPath(path)) {
    clearSession();
    unauthorizedHandler();
  }

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

export function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function patch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function login(email: string, password: string): Promise<LoginResult> {
  return post<LoginResult>('/auth/login', { email, password });
}

export function getMe(): Promise<SessionUser> {
  return get<SessionUser>('/auth/me');
}