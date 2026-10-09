const LIMA_TIMEZONE = 'America/Lima';

const DATE_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  timeZone: LIMA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  timeZone: LIMA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function formatDateLima(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return DATE_FORMATTER.format(d);
}

export function formatDateTimeLima(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return DATE_TIME_FORMATTER.format(d);
}

