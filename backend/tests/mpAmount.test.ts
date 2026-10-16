import { describe, expect, it } from 'vitest';
import {
  centsToMpAmount,
  hashToken,
  idempotencyKeyFor,
  toExternalReference,
} from '../src/domain/mpAmount.js';

describe('centsToMpAmount', () => {
  it('formatea céntimos como texto con dos decimales', () => {
    expect(centsToMpAmount(5)).toBe('0.05');
    expect(centsToMpAmount(99)).toBe('0.99');
    expect(centsToMpAmount(100)).toBe('1.00');
    expect(centsToMpAmount(1234)).toBe('12.34');
    expect(centsToMpAmount(100000)).toBe('1000.00');
  });

  it('formatea enteros grandes sin notación científica', () => {
    expect(centsToMpAmount(99999999)).toBe('999999.99');
    expect(centsToMpAmount(1_000_000_000)).toBe('10000000.00');
  });

  it('rechaza cero, negativos y valores no enteros', () => {
    expect(() => centsToMpAmount(0)).toThrow();
    expect(() => centsToMpAmount(-1)).toThrow();
    expect(() => centsToMpAmount(-1234)).toThrow();
    expect(() => centsToMpAmount(12.5)).toThrow();
    expect(() => centsToMpAmount(Number.NaN)).toThrow();
    expect(() => centsToMpAmount(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('toExternalReference', () => {
  it('solo usa mayúsculas y dígitos, sin guiones', () => {
    const reference = toExternalReference(42);
    expect(reference).toMatch(/^[A-Z0-9]+$/);
    expect(reference).toContain('42');
  });

  it('es determinista para el mismo id y distinto para ids distintos', () => {
    expect(toExternalReference(7)).toBe(toExternalReference(7));
    expect(toExternalReference(7)).not.toBe(toExternalReference(8));
  });

  it('rechaza ids que no sean enteros positivos', () => {
    expect(() => toExternalReference(0)).toThrow();
    expect(() => toExternalReference(-3)).toThrow();
    expect(() => toExternalReference(1.5)).toThrow();
  });
});

describe('idempotencyKeyFor', () => {
  it('es estable para el mismo intento y operación', () => {
    expect(idempotencyKeyFor(3, 'create')).toBe(idempotencyKeyFor(3, 'create'));
  });

  it('usa una clave distinta por operación', () => {
    expect(idempotencyKeyFor(3, 'create')).not.toBe(idempotencyKeyFor(3, 'refund'));
  });

  it('usa una clave distinta por intento', () => {
    expect(idempotencyKeyFor(3, 'create')).not.toBe(idempotencyKeyFor(4, 'create'));
  });

  it('rechaza una operación vacía', () => {
    expect(() => idempotencyKeyFor(3, '   ')).toThrow();
  });
});

describe('hashToken', () => {
  it('devuelve el SHA-256 en hexadecimal', () => {
    // Valor de referencia conocido de SHA-256("abc").
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('es estable y no reversible a simple vista', () => {
    const token = 'token-de-prueba-123';
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });
});
