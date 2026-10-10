import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSession,
  homeFor,
  isTokenExpired,
  landingFor,
  readSession,
  saveSession,
  type Session,
} from './session';

class MemoryStorage {
  private readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  clear(): void {
    this.items.clear();
  }
}

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function tokenWith(payload: Record<string, unknown>): string {
  return `${base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64Url(
    JSON.stringify(payload),
  )}.firma-falsa`;
}

const adminSession: Session = {
  token: tokenWith({ sub: '7', role: 'ADMIN', exp: 4_102_444_800 }),
  user: { id: 7, email: 'ana@falabella.com', name: 'Ana Pérez', role: 'ADMIN' },
};

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('guardar, leer y borrar la sesión', () => {
  it('guarda el token y el usuario, y los vuelve a leer', () => {
    saveSession(adminSession);

    expect(readSession()).toEqual(adminSession);
  });

  it('no guarda nada cuando todavía no hay sesión', () => {
    expect(readSession()).toBeNull();
  });

  it('borra la sesión', () => {
    saveSession(adminSession);
    clearSession();

    expect(readSession()).toBeNull();
  });

  it('devuelve null si lo guardado no es una sesión válida', () => {
    localStorage.setItem(
      'qrcheckout.session',
      JSON.stringify({ token: 'abc', user: { id: '7', email: 'a@b.com', name: 'A', role: 'ADMIN' } }),
    );

    expect(readSession()).toBeNull();
  });

  it('devuelve null si lo guardado no es JSON', () => {
    localStorage.setItem('qrcheckout.session', 'no-es-json');

    expect(readSession()).toBeNull();
  });
});

describe('isTokenExpired', () => {
  const now = 1_700_000_000_000;

  it('dice que no está vencido cuando exp está en el futuro', () => {
    const token = tokenWith({ exp: Math.floor(now / 1000) + 60 });

    expect(isTokenExpired(token, now)).toBe(false);
  });

  it('dice que está vencido cuando exp ya pasó', () => {
    const token = tokenWith({ exp: Math.floor(now / 1000) - 60 });

    expect(isTokenExpired(token, now)).toBe(true);
  });

  it('trata como vencido un token mal formado', () => {
    expect(isTokenExpired('esto-no-es-un-jwt', now)).toBe(true);
    expect(isTokenExpired('a.b', now)).toBe(true);
    expect(isTokenExpired('', now)).toBe(true);
  });

  it('trata como vencido un token sin exp', () => {
    expect(isTokenExpired(tokenWith({ sub: '7', role: 'ADMIN' }), now)).toBe(true);
  });

  it('trata como vencido un token con exp que no es un número', () => {
    expect(isTokenExpired(tokenWith({ exp: 'mañana' }), now)).toBe(true);
  });

  it('lee un token con acentos en la carga', () => {
    const token = tokenWith({ name: 'Ana Pérez', exp: 4_102_444_800 });

    expect(isTokenExpired(token, now)).toBe(false);
  });
});

describe('homeFor', () => {
  it('lleva a cada rol a su pantalla', () => {
    expect(homeFor('ADMIN')).toBe('/admin');
    expect(homeFor('CASHIER')).toBe('/cashier');
    expect(homeFor('CUSTOMER')).toBe('/');
  });
});

describe('landingFor', () => {
  const customerSession: Session = {
    token: tokenWith({ sub: '9', role: 'CUSTOMER', exp: 4_102_444_800 }),
    user: { id: 9, email: 'luis@gmail.com', name: 'Luis', role: 'CUSTOMER' },
  };

  it('lleva a cada rol a su inicio cuando hay sesión válida', () => {
    expect(landingFor(adminSession)).toBe('/admin');
    expect(landingFor(customerSession)).toBe('/');
    expect(landingFor({ ...adminSession, user: { ...adminSession.user, role: 'CASHIER' } })).toBe(
      '/cashier',
    );
  });

  it('lleva al login cuando no hay sesión', () => {
    expect(landingFor(null)).toBe('/login');
  });

  it('lleva al login cuando la sesión está vencida', () => {
    const expired: Session = {
      token: tokenWith({ sub: '7', role: 'ADMIN', exp: 1 }),
      user: { id: 7, email: 'ana@falabella.com', name: 'Ana Pérez', role: 'ADMIN' },
    };

    expect(landingFor(expired)).toBe('/login');
  });
});