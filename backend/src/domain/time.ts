import { formatLimaDate, limaDayToPeriod } from './campaigns.js';

export function startOfDayLima(now: Date): Date {
  const limaDay = formatLimaDate(now);
  const period = limaDayToPeriod(limaDay);
  if (!period) {
    throw new Error('Invalid Lima day');
  }
  return period.startsAt;
}
