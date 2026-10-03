import { describe, expect, it } from 'vitest';
import { parseInstallmentOptions } from '../src/config/env.js';
import { getInstallments, type InstallmentsConfig } from '../src/domain/installments.js';

const config: InstallmentsConfig = { options: [3, 6, 12], minTotalCents: 30000 };

describe('getInstallments', () => {
  it('ofrece 3, 6 y 12 cuotas de un total que no se divide exacto', () => {
    // Total con CMR del caso de referencia de DESIGN.md §3.
    expect(getInstallments(947290, config)).toEqual([
      { count: 3, installmentCents: 315763, firstInstallmentCents: 315764 },
      { count: 6, installmentCents: 157881, firstInstallmentCents: 157885 },
      { count: 12, installmentCents: 78940, firstInstallmentCents: 78950 },
    ]);
  });

  it('la primera cuota absorbe los céntimos sobrantes y la suma da el total', () => {
    for (const totalCents of [30001, 33333, 947290, 999999]) {
      for (const option of getInstallments(totalCents, config)) {
        const sum = option.firstInstallmentCents + option.installmentCents * (option.count - 1);

        expect(sum).toBe(totalCents);
        expect(option.firstInstallmentCents).toBeGreaterThanOrEqual(option.installmentCents);
        expect(option.firstInstallmentCents - option.installmentCents).toBeLessThan(option.count);
      }
    }
  });

  it('con un total que se divide exacto todas las cuotas quedan iguales', () => {
    expect(getInstallments(30000, config)).toEqual([
      { count: 3, installmentCents: 10000, firstInstallmentCents: 10000 },
      { count: 6, installmentCents: 5000, firstInstallmentCents: 5000 },
      { count: 12, installmentCents: 2500, firstInstallmentCents: 2500 },
    ]);
  });

  it('no ofrece cuotas si el total está por debajo del mínimo', () => {
    expect(getInstallments(29999, config)).toEqual([]);
    expect(getInstallments(0, config)).toEqual([]);
  });

  it('ofrece cuotas justo en el total mínimo', () => {
    expect(getInstallments(30000, config)).toHaveLength(3);
  });

  it('no ofrece cuotas si no hay opciones configuradas', () => {
    expect(getInstallments(947290, { options: [], minTotalCents: 30000 })).toEqual([]);
  });

  it('ordena las cuotas de menor a mayor y no repite cantidades', () => {
    const options = getInstallments(947290, { options: [12, 3, 6, 3], minTotalCents: 30000 });

    expect(options.map((option) => option.count)).toEqual([3, 6, 12]);
  });

  it('descarta cantidades que no son enteras positivas', () => {
    expect(getInstallments(947290, { options: [0, -6, 2.5], minTotalCents: 30000 })).toEqual([]);
  });
});

describe('parseInstallmentOptions', () => {
  it('convierte la lista de .env en cantidades', () => {
    expect(parseInstallmentOptions('3,6,12')).toEqual([3, 6, 12]);
    expect(parseInstallmentOptions(' 3 , 6 , 12 ')).toEqual([3, 6, 12]);
    expect(parseInstallmentOptions('6')).toEqual([6]);
  });

  it('descarta lo que no es una cantidad válida', () => {
    expect(parseInstallmentOptions('3,abc,0,-12,4')).toEqual([3, 4]);
    expect(parseInstallmentOptions('')).toEqual([]);
  });
});
