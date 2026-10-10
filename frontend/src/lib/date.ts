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

const TIME_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  timeZone: LIMA_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatDateLima(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return DATE_FORMATTER.format(d);
}

export function formatDateTimeLima(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return DATE_TIME_FORMATTER.format(d);
}

/** Solo la hora (HH:mm) de un cobro en el huso de Lima, para la lista de cobros del cajero. */
export function formatTimeLima(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return TIME_FORMATTER.format(d);
}