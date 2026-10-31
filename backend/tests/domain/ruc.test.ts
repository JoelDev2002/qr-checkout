import { describe, expect, it } from 'vitest';
import { checkRuc, normalizeRuc, rucCheckDigit } from '../../src/domain/ruc.js';

describe('rucCheckDigit', () => {
  it('calcula el dígito verificador de RUC conocidos', () => {
    expect(rucCheckDigit('2010004721')).toBe(8);
    expect(rucCheckDigit('2013131295')).toBe(5);
    expect(rucCheckDigit('1046779354')).toBe(9);
  });

  it('usa 0 cuando el resultado es 10 y 1 cuando es 11', () => {
    // 2060000003: suma 34 → 11 − (34 % 11) = 10 → 0
    expect(rucCheckDigit('2060000003')).toBe(0);
    // 2060000008: suma 44 → 11 − (44 % 11) = 11 → 1
    expect(rucCheckDigit('2060000008')).toBe(1);
  });

  it('rechaza un cuerpo que no sean 10 dígitos', () => {
    expect(() => rucCheckDigit('123')).toThrow('10 dígitos');
    expect(() => rucCheckDigit('20100047a1')).toThrow('10 dígitos');
  });
});

describe('checkRuc', () => {
  it('acepta un RUC válido de persona jurídica y de persona natural', () => {
    expect(checkRuc('20100047218')).toEqual({ ok: true });
    expect(checkRuc('10467793549')).toEqual({ ok: true });
  });

  it('ignora los espacios pegados al copiar', () => {
    expect(normalizeRuc(' 201 000 47218 ')).toBe('20100047218');
    expect(checkRuc(' 20100047218 ')).toEqual({ ok: true });
  });

  it('rechaza un largo distinto de 11 o letras', () => {
    expect(checkRuc('2010004721')).toEqual({ ok: false, message: 'El RUC debe tener 11 dígitos.' });
    expect(checkRuc('2010004721A')).toEqual({ ok: false, message: 'El RUC debe tener 11 dígitos.' });
  });

  it('rechaza un prefijo que no existe', () => {
    expect(checkRuc('30100047218')).toEqual({
      ok: false,
      message: 'El RUC debe empezar con 10, 15, 16, 17 o 20.',
    });
  });

  it('rechaza un dígito verificador incorrecto', () => {
    expect(checkRuc('20100047219')).toEqual({
      ok: false,
      message: 'El RUC no es válido: revisa el último dígito.',
    });
  });
});
