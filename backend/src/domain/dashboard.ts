import { formatLimaDate, limaDayToPeriod, parseLimaDate } from './campaigns.js';
import { startOfDayLima } from './time.js';

const MS_PER_DAY = 86_400_000;

export const DASHBOARD_DEFAULT_DAYS = 30;
export const DASHBOARD_MAX_DAYS = 366;

export type DashboardRange = {
  from: string;
  to: string;
};

/** El intervalo de un día de Lima guardado en UTC: del primer al último milisegundo del día. */
export type DashboardPeriod = {
  startsAt: Date;
  endsAt: Date;
};

export type DaySaleAggregate = {
  date: string;
  salesCount: number;
  totalCents: number;
};

/** Rango por defecto del panel: los últimos DASHBOARD_DEFAULT_DAYS días contando hoy. */
export function defaultDashboardRange(now: Date): DashboardRange {
  const to = formatLimaDate(now);
  const todayStart = startOfDayLima(now);
  const from = formatLimaDate(new Date(todayStart.getTime() - (DASHBOARD_DEFAULT_DAYS - 1) * MS_PER_DAY));

  return { from, to };
}

/** Convierte el rango de días de Lima (YYYY-MM-DD) en el intervalo UTC firme de la consulta. */
export function dashboardPeriod(from: string, to: string): DashboardPeriod {
  const fromPeriod = limaDayToPeriod(from);
  const toPeriod = limaDayToPeriod(to);

  if (!fromPeriod || !toPeriod) {
    throw new Error(`Rango inválido: ${from} a ${to}`);
  }

  return { startsAt: fromPeriod.startsAt, endsAt: toPeriod.endsAt };
}

/** Días que abarca el rango, con los dos extremos incluidos. */
export function daysInRange(from: string, to: string): number {
  const fromPeriod = limaDayToPeriod(from);
  const toPeriod = limaDayToPeriod(to);

  if (!fromPeriod || !toPeriod) {
    throw new Error(`Rango inválido: ${from} a ${to}`);
  }

  return Math.round((toPeriod.startsAt.getTime() - fromPeriod.startsAt.getTime()) / MS_PER_DAY) + 1;
}

/** Completa el rango día por día: los días sin ventas van con ceros, en orden. */
export function fillDaySeries(from: string, to: string, rows: readonly DaySaleAggregate[]): DaySaleAggregate[] {
  const fromParts = parseLimaDate(from);
  const toParts = parseLimaDate(to);

  if (!fromParts || !toParts) {
    throw new Error(`Rango inválido: ${from} a ${to}`);
  }

  const byDate = new Map(rows.map((row) => [row.date, row]));
  const series: DaySaleAggregate[] = [];
  const cursor = new Date(Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day));
  const end = new Date(Date.UTC(toParts.year, toParts.month - 1, toParts.day));

  while (cursor.getTime() <= end.getTime()) {
    const date = cursor.toISOString().slice(0, 10);
    series.push(byDate.get(date) ?? { date, salesCount: 0, totalCents: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return series;
}

/** Porcentaje de ventas CMR sobre el total, redondeado a entero; 0 si no hay ventas. */
export function cmrSalesPercent(cmrSalesCount: number, salesCount: number): number {
  if (salesCount <= 0) {
    return 0;
  }

  return Math.round((cmrSalesCount / salesCount) * 100);
}