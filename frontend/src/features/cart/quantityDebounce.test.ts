import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuantityDebouncer, QUANTITY_DEBOUNCE_MS } from './quantityDebounce';

describe('createQuantityDebouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('espera 400 ms antes de enviar', () => {
    expect(QUANTITY_DEBOUNCE_MS).toBe(400);
  });

  it('envía una sola vez lo último programado', () => {
    const sent: number[] = [];
    const debouncer = createQuantityDebouncer((value: number) => sent.push(value));

    debouncer.schedule(2);
    vi.advanceTimersByTime(200);
    debouncer.schedule(3);
    vi.advanceTimersByTime(QUANTITY_DEBOUNCE_MS - 1);
    expect(sent).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(sent).toEqual([3]);
  });

  it('flush envía ya lo pendiente y no lo repite', () => {
    const sent: number[] = [];
    const debouncer = createQuantityDebouncer((value: number) => sent.push(value));

    debouncer.schedule(5);
    debouncer.flush();
    expect(sent).toEqual([5]);

    vi.advanceTimersByTime(QUANTITY_DEBOUNCE_MS);
    expect(sent).toEqual([5]);
  });

  it('cancel descarta lo pendiente', () => {
    const sent: number[] = [];
    const debouncer = createQuantityDebouncer((value: number) => sent.push(value));

    debouncer.schedule(7);
    debouncer.cancel();
    vi.advanceTimersByTime(QUANTITY_DEBOUNCE_MS);
    expect(sent).toEqual([]);
  });

  it('no envía nada si nunca se programó', () => {
    const sent: number[] = [];
    const debouncer = createQuantityDebouncer((value: number) => sent.push(value));

    debouncer.flush();
    debouncer.cancel();
    vi.advanceTimersByTime(QUANTITY_DEBOUNCE_MS);
    expect(sent).toEqual([]);
  });
});
