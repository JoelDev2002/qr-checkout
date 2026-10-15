import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_DEFAULT_DAYS,
  DASHBOARD_MAX_DAYS,
  barHeight,
  buildDashboardQuery,
  daysInRange,
  defaultDashboardRange,
  formatDayLabel,
  formatPercent,
  lastDaysRange,
} from './dashboard';

describe('lastDaysRange', () => {
  it('cuenta el día de hoy y los previos en Lima', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(lastDaysRange(7, now)).toEqual({ from: '2026-10-04', to: '2026-10-10' });
    expect(lastDaysRange(1, now)).toEqual({ from: '2026-10-10', to: '2026-10-10' });
  });
});

describe('defaultDashboardRange', () => {
  it('cuenta el día de hoy en Lima y empieza hace DASHBOARD_DEFAULT_DAYS menos uno', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(defaultDashboardRange(now)).toEqual({ from: '2026-10-04', to: '2026-10-10' });
    expect(DASHBOARD_DEFAULT_DAYS).toBe(7);
  });

  it('agrega un día cuando Lima ya está en la fecha siguiente', () => {
    const now = new Date('2026-10-10T23:30:00Z');
    expect(defaultDashboardRange(now).to).toBe('2026-10-10');
  });
});

describe('daysInRange', () => {
  it('cuenta con los dos extremos incluidos', () => {
    expect(daysInRange('2026-10-01', '2026-10-10')).toBe(10);
  });

  it('devuelve null si alguna fecha no es válida', () => {
    expect(daysInRange('2026-13-01', '2026-10-10')).toBeNull();
    expect(daysInRange('2026-02-30', '2026-10-10')).toBeNull();
  });

  it('el máximo permitido por el servidor es DASHBOARD_MAX_DAYS', () => {
    expect(daysInRange('2026-01-01', '2027-01-01')).toBe(DASHBOARD_MAX_DAYS);
  });
});

describe('barHeight', () => {
  it('da 0 cuando no hay máximo y 100 cuando el valor es el máximo', () => {
    expect(barHeight(0, 10)).toBe(0);
    expect(barHeight(10, 10)).toBe(100);
  });

  it('interpola y redondea al entero más cercano', () => {
    expect(barHeight(5, 10)).toBe(50);
    expect(barHeight(1, 3)).toBe(33);
  });

  it('acota el resultado a 0–100', () => {
    expect(barHeight(20, 10)).toBe(100);
    expect(barHeight(-1, 10)).toBe(0);
  });
});

describe('formatDayLabel', () => {
  it('convierte AAAA-MM-DD en DD/MM', () => {
    expect(formatDayLabel('2026-10-05')).toBe('05/10');
  });

  it('devuelve el texto tal cual si no parece una fecha', () => {
    expect(formatDayLabel('odd')).toBe('odd');
  });
});

describe('formatPercent', () => {
  it('redondea y agrega el símbolo', () => {
    expect(formatPercent(42.4)).toBe('42%');
    expect(formatPercent(42.6)).toBe('43%');
  });
});

describe('buildDashboardQuery', () => {
  it('arma siempre los tres parámetros en el mismo orden', () => {
    expect(
      buildDashboardQuery({ from: '2026-10-01', to: '2026-10-10', lowStockThreshold: 3 }),
    ).toBe('?from=2026-10-01&to=2026-10-10&lowStockThreshold=3');
  });
});