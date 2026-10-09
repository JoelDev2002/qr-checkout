/** A la cuenta regresiva le faltan menos de dos minutos: pasa a color warn (DESIGN §3). */
export const WARN_THRESHOLD_MS = 2 * 60 * 1000;

/** Milisegundos que quedan hasta `expiresAt` contados desde `now`; nunca negativo. */
export function remainingMs(expiresAt: string | Date, now: Date): number {
  const expires = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);

  return Math.max(0, expires.getTime() - now.getTime());
}

/** Formatea milisegundos como mm:ss redondeando hacia arriba para no llegar a 00:00 antes de tiempo. */
export function formatCountdown(remaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** true cuando al QR le quedan menos de dos minutos (el umbral es estricto). */
export function isExpiringSoon(remaining: number): boolean {
  return remaining < WARN_THRESHOLD_MS;
}
