import { describe, expect, it } from 'vitest';
import {
  campaignStatus,
  formatLimaDate,
  limaDayToPeriod,
  parseLimaDate,
} from '../src/domain/campaigns.js';

type Period = { startsAt: Date; endsAt: Date };

const campaignIn = (period: Period, active: boolean) => ({
  active,
  startsAt: period.startsAt,
  endsAt: period.endsAt,
});

describe('limaDayToPeriod', () => {
  it('guarda el inicio del día de Lima en UTC', () => {
    const period = limaDayToPeriod('2026-10-10');

    expect(period?.startsAt.toISOString()).toBe('2026-10-10T05:00:00.000Z');
  });

  it('guarda el último milisegundo del día de Lima en UTC', () => {
    const period = limaDayToPeriod('2026-10-12');

    expect(period?.endsAt.toISOString()).toBe('2026-10-13T04:59:59.999Z');
  });

  it('usa el mismo desfase el 1 de enero y el 31 de diciembre', () => {
    expect(limaDayToPeriod('2026-01-01')).toEqual({
      startsAt: new Date('2026-01-01T05:00:00.000Z'),
      endsAt: new Date('2026-01-02T04:59:59.999Z'),
    });

    expect(limaDayToPeriod('2026-12-31')).toEqual({
      startsAt: new Date('2026-12-31T05:00:00.000Z'),
      endsAt: new Date('2027-01-01T04:59:59.999Z'),
    });
  });

  it('devuelve null para fechas que el calendario no tiene o no viene en AAAA-MM-DD', () => {
    const invalidas = ['2026-02-30', '2026-13-01', '2026-00-10', '2026-10-32', '10-10-2026', '2026-10-5', '2026-1-05', '', 'ayer'];

    for (const fecha of invalidas) {
      expect(limaDayToPeriod(fecha), fecha).toBeNull();
    }
  });
});

describe('parseLimaDate', () => {
  it('descompone el año, el mes y el día', () => {
    expect(parseLimaDate('2026-10-05')).toEqual({ year: 2026, month: 10, day: 5 });
  });

  it('acepta el 29 de febrero de un año bisiesto', () => {
    expect(parseLimaDate('2028-02-29')).not.toBeNull();
    expect(parseLimaDate('2026-02-29')).toBeNull();
  });
});

describe('formatLimaDate', () => {
  it('devuelve el día de Lima de un instante guardado en UTC', () => {
    expect(formatLimaDate(new Date('2026-10-05T05:00:00.000Z'))).toBe('2026-10-05');
    expect(formatLimaDate(new Date('2026-10-06T04:59:59.999Z'))).toBe('2026-10-05');
  });

  it('descuenta el día cuando en Lima todavía es el anterior', () => {
    expect(formatLimaDate(new Date('2026-10-05T02:30:00.000Z'))).toBe('2026-10-04');
  });

  it('vuelve del instante guardado al mismo día que escribió el admin', () => {
    const period = limaDayToPeriod('2026-07-20');

    expect(formatLimaDate(period?.startsAt ?? new Date(0))).toBe('2026-07-20');
    expect(formatLimaDate(period?.endsAt ?? new Date(0))).toBe('2026-07-20');
  });
});

describe('campaignStatus', () => {
  const periodo = limaDayToPeriod('2026-10-15');

  function statusAt(iso: string, active = true): string {
    const periodoDePrueba = periodo ?? { startsAt: new Date(0), endsAt: new Date(0) };

    return campaignStatus(campaignIn(periodoDePrueba, active), new Date(iso));
  }

  it('es INACTIVE aunque las fechas la cubran, si el interruptor está apagado', () => {
    expect(statusAt('2026-10-15T10:00:00.000Z', false)).toBe('INACTIVE');
  });

  it('es SCHEDULED un milisegundo antes de empezar', () => {
    expect(statusAt('2026-10-15T04:59:59.999Z')).toBe('SCHEDULED');
  });

  it('es ACTIVE justo en el instante en que empieza', () => {
    expect(statusAt('2026-10-15T05:00:00.000Z')).toBe('ACTIVE');
  });

  it('es ACTIVE a media campaña', () => {
    expect(statusAt('2026-10-15T18:00:00.000Z')).toBe('ACTIVE');
  });

  it('es ACTIVE en el último milisegundo del día final, porque el día entero cuenta', () => {
    expect(statusAt('2026-10-16T04:59:59.999Z')).toBe('ACTIVE');
  });

  it('es EXPIRED un milisegundo después de terminar', () => {
    expect(statusAt('2026-10-16T05:00:00.000Z')).toBe('EXPIRED');
  });
});
