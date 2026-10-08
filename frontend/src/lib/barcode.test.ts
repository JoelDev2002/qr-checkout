import { describe, expect, it } from 'vitest';
import { ean13CheckDigit, generateInternalBarcode, isValidEan13 } from './barcode';

describe('ean13CheckDigit', () => {
  it('calcula el dígito verificador de un código conocido', () => {
    expect(ean13CheckDigit('400638133393')).toBe(1);
    expect(ean13CheckDigit('200000000001')).toBe(5);
    expect(ean13CheckDigit('036000291452')).toBe(2);
  });

  it('rechaza textos que no tienen 12 dígitos', () => {
    expect(() => ean13CheckDigit('40063813339')).toThrow();
    expect(() => ean13CheckDigit('4006381333931')).toThrow();
    expect(() => ean13CheckDigit('40063813339a')).toThrow();
  });
});

describe('isValidEan13', () => {
  it('acepta los códigos válidos conocidos', () => {
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('2000000000015')).toBe(true);
    expect(isValidEan13('7501031311309')).toBe(true);
  });

  it('rechaza el dígito verificador equivocado', () => {
    expect(isValidEan13('4006381333932')).toBe(false);
    expect(isValidEan13('4006381333930')).toBe(false);
  });

  it('rechaza códigos que no son 13 dígitos', () => {
    expect(isValidEan13('')).toBe(false);
    expect(isValidEan13('400638133393')).toBe(false);
    expect(isValidEan13('40063813339311')).toBe(false);
    expect(isValidEan13('400638133393a')).toBe(false);
    expect(isValidEan13('40063813339 1')).toBe(false);
  });
});

describe('generateInternalBarcode', () => {
  it('genera EAN-13 con prefijo 200–299 que pasan la validación', () => {
    for (let index = 0; index < 50; index += 1) {
      const barcode = generateInternalBarcode();

      expect(barcode).toMatch(/^2\d{12}$/);
      expect(Number(barcode.slice(0, 3))).toBeGreaterThanOrEqual(200);
      expect(Number(barcode.slice(0, 3))).toBeLessThanOrEqual(299);
      expect(isValidEan13(barcode)).toBe(true);
    }
  });

  it('usa el mismo dígito verificador que la fórmula', () => {
    const barcode = generateInternalBarcode();
    const body = barcode.slice(0, 12);

    expect(barcode.slice(12)).toBe(String(ean13CheckDigit(body)));
  });
});
