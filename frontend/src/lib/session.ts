export type Role = 'CUSTOMER' | 'CASHIER' | 'ADMIN';

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
};

export type Session = {
  token: string;
  user: SessionUser;
};

// Decisión de prototipo: la sesión vive en localStorage para no montar un servidor
// de sesión en el MVP. La firma del token la verifica el backend, nunca el navegador.
const STORAGE_KEY = 'qrcheckout.session';

const ROLES: Role[] = ['CUSTOMER', 'CASHIER', 'ADMIN'];

function storage(): Storage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role);
}

function toSession(value: unknown): Session | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const { token, user } = value as { token?: unknown; user?: unknown };

  if (typeof token !== 'string' || token === '') {
    return null;
  }

  if (typeof user !== 'object' || user === null) {
    return null;
  }

  const { id, email, name, role } = user as Record<string, unknown>;

  if (typeof id !== 'number' || typeof email !== 'string' || typeof name !== 'string') {
    return null;
  }

  if (!isRole(role)) {
    return null;
  }

  return { token, user: { id, email, name, role } };
}

export function saveSession(session: Session): void {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function readSession(): Session | null {
  const raw = storage()?.getItem(STORAGE_KEY);

  if (raw === null || raw === undefined || raw === '') {
    return null;
  }

  try {
    return toSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearSession(): void {
  storage()?.removeItem(STORAGE_KEY);
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

function readExpiry(token: string): number | null {
  const parts = token.split('.');

  if (parts.length !== 3) {
    return null;
  }

  const payload = parts[1];

  if (payload === undefined || payload === '') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(payload));

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const exp = (parsed as { exp?: unknown }).exp;

    return typeof exp === 'number' && Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

/** Solo lee `exp` para no dejar pasar una sesión vencida; si el token no se puede leer, cuenta como vencido. */
export function isTokenExpired(token: string, nowMs: number = Date.now()): boolean {
  const exp = readExpiry(token);

  return exp === null || exp * 1000 <= nowMs;
}

export function homeFor(role: Role): string {
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'CASHIER':
      return '/cashier';
    case 'CUSTOMER':
      return '/';
  }
}