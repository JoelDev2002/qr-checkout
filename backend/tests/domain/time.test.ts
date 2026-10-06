import { describe, expect, it } from 'vitest';
import { startOfDayLima } from '../../src/domain/time.js';

describe('startOfDayLima', () => {
  it('devuelve el inicio del día de Lima para una fecha dada', () => {
    const result = startOfDayLima(new Date('2026-10-15T12:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-10-15T05:00:00.000Z');
  });

  it('devuelve el inicio correcto para medianoche Lima', () => {
    const result = startOfDayLima(new Date('2026-10-16T05:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-10-16T05:00:00.000Z');
  });

  it('maneja el borde antes de medianoche Lima', () => {
    const result = startOfDayLima(new Date('2026-10-16T04:59:59.999Z'));
    expect(result.toISOString()).toBe('2026-10-15T05:00:00.000Z');
  });
});
