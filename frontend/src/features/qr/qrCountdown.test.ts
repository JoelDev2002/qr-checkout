import { describe, expect, it } from 'vitest';
import { formatCountdown, isExpiringSoon, remainingMs, WARN_THRESHOLD_MS } from './qrCountdown';

describe('remainingMs', () => {
  const now = new Date('2026-10-08T12:00:00.000Z');

  it('resta la hora actual de la expiración', () => {
    const expiresAt = new Date(now.getTime() + 90_000).toISOString();

    expect(remainingMs(expiresAt, now)).toBe(90_000);
  });

  it('acepta también un Date', () => {
    expect(remainingMs(new Date(now.getTime() + 30_000), now)).toBe(30_000);
  });

  it('nunca es negativo aunque la hora ya pasó', () => {
    expect(remainingMs(new Date(now.getTime() - 5_000).toISOString(), now)).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('da 30:00 para la vigencia por defecto del QR (RN-05)', () => {
    expect(formatCountdown(30 * 60 * 1000)).toBe('30:00');
  });

  it('da mm:ss con minutos y segundos de dos cifras', () => {
    expect(formatCountdown(61_000)).toBe('01:01');
    expect(formatCountdown(4_010_000)).toBe('66:50');
  });

  it('redondea hacia arriba el segundo en curso', () => {
    expect(formatCountdown(500)).toBe('00:01');
  });

  it('un valor negativo o cero queda en 00:00', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-1)).toBe('00:00');
  });
});

describe('isExpiringSoon', () => {
  it('avisa con menos de dos minutos', () => {
    expect(isExpiringSoon(WARN_THRESHOLD_MS - 1)).toBe(true);
  });

  it('no avisa con exactamente dos minutos ni con más', () => {
    expect(isExpiringSoon(WARN_THRESHOLD_MS)).toBe(false);
    expect(isExpiringSoon(WARN_THRESHOLD_MS + 1)).toBe(false);
  });
});