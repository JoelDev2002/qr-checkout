import { describe, expect, it } from 'vitest';
import {
  cmrSalesPercent,
  DASHBOARD_DEFAULT_DAYS,
  DASHBOARD_MAX_DAYS,
  dashboardPeriod,
  daysInRange,
  defaultDashboardRange,
  fillDaySeries,
} from '../../src/domain/dashboard.js';

describe('defaultDashboardRange', () => {
  it('cubre los últimos 30 días contando hoy', () => {
    const range = defaultDashboardRange(new Date('2026-06-15T15:00:00.000Z'));

    expect(range.to).toBe('2026-06-15');
    expect(range.from).toBe('2026-05-17');
  });

  it('usa el día de Lima aunque ahora sea de madrugada en UTC', () => {
    const range = defaultDashboardRange(new Date('2026-06-01T04:30:00.000Z'));

    // 04:30 UTC es todavía 2026-05-31 en Lima (UTC-5).
    expect(range.to).toBe('2026-05-31');
    expect(range.from).toBe('2026-05-02');
  });
});

describe('dashboardPeriod', () => {
  it('devuelve el primer y el último milisegundo del día de Lima', () => {
    const period = dashboardPeriod('2026-06-14', '2026-06-15');

    expect(period.startsAt.toISOString()).toBe('2026-06-14T05:00:00.000Z');
    expect(period.endsAt.toISOString()).toBe('2026-06-16T04:59:59.999Z');
  });
});

describe('daysInRange', () => {
  it('cuenta un solo día y el máximo permitido', () => {
    expect(daysInRange('2026-06-15', '2026-06-15')).toBe(1);
    expect(daysInRange('2026-06-14', '2026-06-15')).toBe(2);
  });

  it('acepta hasta DASHBOARD_MAX_DAYS días', () => {
    const from = '2025-06-15';
    const to = '2026-06-15';

    expect(daysInRange(from, to)).toBe(DASHBOARD_MAX_DAYS);
    expect(DASHBOARD_DEFAULT_DAYS).toBe(30);
  });
});

describe('fillDaySeries', () => {
  it('completa con ceros los días sin ventas y mantiene el orden', () => {
    const series = fillDaySeries(
      '2026-06-08',
      '2026-06-12',
      [{ date: '2026-06-10', salesCount: 2, totalCents: 5000 }],
    );

    expect(series).toEqual([
      { date: '2026-06-08', salesCount: 0, totalCents: 0 },
      { date: '2026-06-09', salesCount: 0, totalCents: 0 },
      { date: '2026-06-10', salesCount: 2, totalCents: 5000 },
      { date: '2026-06-11', salesCount: 0, totalCents: 0 },
      { date: '2026-06-12', salesCount: 0, totalCents: 0 },
    ]);
  });

  it('atraviesa el cambio de mes', () => {
    const series = fillDaySeries('2026-01-30', '2026-02-01', []);

    expect(series.map((entry) => entry.date)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01']);
    expect(series.every((entry) => entry.salesCount === 0)).toBe(true);
  });
});

describe('cmrSalesPercent', () => {
  it('redondea a entero', () => {
    expect(cmrSalesPercent(3, 4)).toBe(75);
    expect(cmrSalesPercent(1, 3)).toBe(33);
  });

  it('devuelve 0 si no hay ventas', () => {
    expect(cmrSalesPercent(0, 0)).toBe(0);
  });
});