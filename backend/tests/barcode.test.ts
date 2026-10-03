import { describe, expect, it } from 'vitest';
import { ean13CheckDigit, generateInternalBarcode, isValidEan13 } from '../src/domain/barcode.js';

describe('ean13CheckDigit', () => {
  it('calcula el dígito verificador de un EAN-13 conocido', () => {
    expect(ean13CheckDigit('400638133393')).toBe(1);
    expect(ean13CheckDigit('590123412345')).toBe(7);
    expect(ean13CheckDigit('978020137962')).toBe(4);
  });

  it('devuelve 0 cuando la suma ya es múltiplo de 10', () => {
    expect(ean13CheckDigit('000000000000')).toBe(0);
  });

  it('rechaza un cuerpo que no sean 12 dígitos', () => {
    expect(() => ean13CheckDigit('12345')).toThrow('12 dígitos');
    expect(() => ean13CheckDigit('40063813339a')).toThrow('12 dígitos');
  });
});

describe('isValidEan13', () => {
  it('acepta códigos válidos', () => {
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('5901234123457')).toBe(true);
    expect(isValidEan13('9780201379624')).toBe(true);
  });

  it('rechaza un dígito verificador incorrecto', () => {
    expect(isValidEan13('4006381333930')).toBe(false);
  });

  it('rechaza longitudes que no son 13', () => {
    expect(isValidEan13('')).toBe(false);
    expect(isValidEan13('400638133393')).toBe(false);
    expect(isValidEan13('40063813339311')).toBe(false);
  });

  it('rechaza letras, espacios y el código de carrito', () => {
    expect(isValidEan13('400638133393A')).toBe(false);
    expect(isValidEan13(' 4006381333931')).toBe(false);
    expect(isValidEan13('C-8F3K2')).toBe(false);
  });
});

describe('generateInternalBarcode', () => {
  it('genera códigos válidos con prefijo entre 200 y 299', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = generateInternalBarcode();
      const prefix = Number(code.slice(0, 3));

      expect(code).toHaveLength(13);
      expect(prefix).toBeGreaterThanOrEqual(200);
      expect(prefix).toBeLessThanOrEqual(299);
      expect(isValidEan13(code)).toBe(true);
    }
  });

  it('no repite el código anterior', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateInternalBarcode()));

    expect(codes.size).toBe(200);
  });
});
