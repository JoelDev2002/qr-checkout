import { describe, expect, it } from 'vitest';
import { normalizeRuc, rucError } from './ruc';

describe('rucError', () => {
  it('acepta RUC válidos de persona jurídica y natural', () => {
    expect(rucError('20100047218')).toBeNull();
    expect(rucError('10467793549')).toBeNull();
  });

  it('acepta los casos en que el dígito verificador es 0 y 1', () => {
    expect(rucError('20600000030')).toBeNull();
    expect(rucError('20600000081')).toBeNull();
  });

  it('ignora los espacios', () => {
    expect(normalizeRuc(' 2010 0047 218 ')).toBe('20100047218');
    expect(rucError(' 2010 0047 218 ')).toBeNull();
  });

  it('explica qué está mal', () => {
    expect(rucError('123')).toBe('El RUC debe tener 11 dígitos.');
    expect(rucError('30100047218')).toBe('El RUC debe empezar con 10, 15, 16, 17 o 20.');
    expect(rucError('20100047219')).toBe('El RUC no es válido: revisa el último dígito.');
  });
});
