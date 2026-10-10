export const DASHBOARD_DEFAULT_DAYS = 30;
export const DASHBOARD_MAX_DAYS = 366;

export type DashboardRange = {
  from: string;
  to: string;
};

export type DashboardQuery = {
  from: string;
  to: string;
  lowStockThreshold: number;
};

const LIMA_TIMEZONE = 'America/Lima';
const MS_PER_DAY = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function limaYmd(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LIMA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';

  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error('No se pudo leer la fecha en Lima.');
  }

  return { year, month, day };
}

function parseYmd(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const asDate = new Date(Date.UTC(year, month - 1, day));

  if (asDate.getUTCFullYear() !== year || asDate.getUTCMonth() !== month - 1 || asDate.getUTCDate() !== day) {
    return null;
  }

  return { year, month, day };
}

/** El rango de los últimos `days` días contando hoy (en Lima), "AAAA-MM-DD" en ambos extremos. */
export function lastDaysRange(days: number, now: Date): DashboardRange {
  const today = limaYmd(now);
  const todayMs = Date.UTC(today.year, today.month - 1, today.day);
  const fromDate = new Date(todayMs - (days - 1) * MS_PER_DAY);

  return {
    from: `${fromDate.getUTCFullYear()}-${pad(fromDate.getUTCMonth() + 1)}-${pad(fromDate.getUTCDate())}`,
    to: `${today.year}-${pad(today.month)}-${pad(today.day)}`,
  };
}

/** Rango por defecto del panel: los últimos DASHBOARD_DEFAULT_DAYS días contando hoy (en Lima). */
export function defaultDashboardRange(now: Date): DashboardRange {
  return lastDaysRange(DASHBOARD_DEFAULT_DAYS, now);
}

/** Días que abarca el rango, con los dos extremos incluidos; null si alguna fecha no es válida. */
export function daysInRange(from: string, to: string): number | null {
  const fromParts = parseYmd(from);
  const toParts = parseYmd(to);

  if (fromParts === null || toParts === null) {
    return null;
  }

  const fromMs = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);
  const toMs = Date.UTC(toParts.year, toParts.month - 1, toParts.day);

  return Math.round((toMs - fromMs) / MS_PER_DAY) + 1;
}

/** Escala de la barra de ventas: porcentaje del máximo, redondeado y acotado a 0–100. */
export function barHeight(value: number, maxValue: number): number {
  if (maxValue <= 0) {
    return 0;
  }

  const percent = Math.round((value / maxValue) * 100);

  return Math.max(0, Math.min(100, percent));
}

/** Etiqueta corta de un día "AAAA-MM-DD" para la tabla y el gráfico: "10/10". */
export function formatDayLabel(value: string): string {
  const parts = parseYmd(value);

  if (parts === null) {
    return value;
  }

  return `${pad(parts.day)}/${pad(parts.month)}`;
}

/** Porcentaje que ya entrega el servidor, solo con formato de presentación: "42%". */
export function formatPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}

/** Arma la consulta de GET /dashboard/summary con los tres parámetros en orden fijo. */
export function buildDashboardQuery(query: DashboardQuery): string {
  const params = new URLSearchParams();
  params.set('from', query.from);
  params.set('to', query.to);
  params.set('lowStockThreshold', String(query.lowStockThreshold));

  return `?${params.toString()}`;
}