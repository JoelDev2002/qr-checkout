import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScanGate, SCAN_PAUSE_MS } from './scanGate';

describe('createScanGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('la pausa dura 1 segundo', () => {
    expect(SCAN_PAUSE_MS).toBe(1000);
  });

  it('acepta la primera lectura y bloquea las siguientes durante la pausa', () => {
    const gate = createScanGate();

    expect(gate.tryAccept()).toBe(true);
    expect(gate.tryAccept()).toBe(false);

    vi.advanceTimersByTime(SCAN_PAUSE_MS - 1);
    expect(gate.tryAccept()).toBe(false);

    vi.advanceTimersByTime(1);
    expect(gate.tryAccept()).toBe(true);
    expect(gate.tryAccept()).toBe(false);
  });

  it('cada lectura aceptada reinicia la pausa completa', () => {
    const gate = createScanGate();

    expect(gate.tryAccept()).toBe(true);
    vi.advanceTimersByTime(SCAN_PAUSE_MS - 1);
    expect(gate.tryAccept()).toBe(false);

    vi.advanceTimersByTime(1);
    expect(gate.tryAccept()).toBe(true);

    vi.advanceTimersByTime(SCAN_PAUSE_MS - 1);
    expect(gate.tryAccept()).toBe(false);
  });

  it('respeta una pausa distinta si se pasa otra', () => {
    const gate = createScanGate(250);

    expect(gate.tryAccept()).toBe(true);
    vi.advanceTimersByTime(249);
    expect(gate.tryAccept()).toBe(false);

    vi.advanceTimersByTime(1);
    expect(gate.tryAccept()).toBe(true);
  });

  it('dispose limpia la pausa pendiente', () => {
    const gate = createScanGate();

    expect(gate.tryAccept()).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    gate.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(gate.tryAccept()).toBe(true);
  });
});
