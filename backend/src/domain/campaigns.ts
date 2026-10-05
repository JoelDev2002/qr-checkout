const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** Lima es UTC-5 todo el año: no cambia con el horario de verano. */
export const LIMA_UTC_OFFSET_HOURS = -5;

export type CampaignStatus = 'INACTIVE' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED';

export type CampaignPeriod = {
  /** Inicio del día en Lima, guardado en UTC. */
  startsAt: Date;
  /** Último milisegundo del día en Lima, guardado en UTC. */
  endsAt: Date;
};

type StatusInput = {
  active: boolean;
  startsAt: Date;
  endsAt: Date;
};

const LIMA_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Estado de una campaña frente a una hora dada. La hora llega por parámetro para poder probarla. */
export function campaignStatus(campaign: StatusInput, now: Date): CampaignStatus {
  if (!campaign.active) {
    return 'INACTIVE';
  }

  const nowMs = now.getTime();

  if (nowMs < campaign.startsAt.getTime()) {
    return 'SCHEDULED';
  }

  if (nowMs > campaign.endsAt.getTime()) {
    return 'EXPIRED';
  }

  return 'ACTIVE';
}

/** Descompone una fecha "AAAA-MM-DD" de Lima, o null si el formato no sirve o el día no existe. */
export function parseLimaDate(value: string): { year: number; month: number; day: number } | null {
  const match = LIMA_DATE_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const asDate = new Date(Date.UTC(year, month - 1, day));

  // Descarta fechas que el calendario no tiene, como el 30 de febrero.
  if (
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() !== month - 1 ||
    asDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/**
 * Convierte el día que escribe el admin en el intervalo que se guarda:
 * el inicio del día en Lima y su último milisegundo (la fecha final incluye todo el día).
 */
export function limaDayToPeriod(value: string): CampaignPeriod | null {
  const parts = parseLimaDate(value);

  if (!parts) {
    return null;
  }

  const startOfDay = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    -LIMA_UTC_OFFSET_HOURS,
    0,
    0,
    0,
  );

  return {
    startsAt: new Date(startOfDay),
    endsAt: new Date(startOfDay + MS_PER_DAY - 1),
  };
}

/** Vuelve de un instante guardado en UTC a su día de Lima, como "AAAA-MM-DD". */
export function formatLimaDate(value: Date): string {
  // Lima va cinco horas detrás de UTC, así que el día local se lee restando ese desfase.
  const shifted = new Date(value.getTime() + LIMA_UTC_OFFSET_HOURS * MS_PER_HOUR);

  return shifted.toISOString().slice(0, 10);
}
