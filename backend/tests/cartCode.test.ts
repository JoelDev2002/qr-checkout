import { describe, expect, it } from 'vitest';
import {
  CART_CODE_ALPHABET,
  generateCartCode,
  generateExitCode,
  isValidCartCode,
  isValidExitCode,
} from '../src/domain/cartCode.js';

describe('generateCartCode', () => {
  it('genera códigos con el formato C-XXXXX y solo caracteres no ambiguos', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = generateCartCode();

      expect(code).toMatch(/^C-[A-Z2-9]{5}$/);
      expect(code.slice(2)).not.toMatch(/[0O1IL]/);
      expect(isValidCartCode(code)).toBe(true);
    }
  });

  it('usa el alfabeto sin 0, O, 1, I ni L', () => {
    expect(CART_CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789');
  });

  it('no repite códigos', () => {
    const codes = new Set(Array.from({ length: 300 }, () => generateCartCode()));

    expect(codes.size).toBe(300);
  });
});

describe('isValidCartCode', () => {
  it('acepta un código con el formato esperado', () => {
    expect(isValidCartCode('C-8F3K2')).toBe(true);
    expect(isValidCartCode('C-HJKMN')).toBe(true);
    expect(isValidCartCode('C-23456')).toBe(true);
  });

  it('rechaza longitudes incorrectas y el prefijo equivocado', () => {
    expect(isValidCartCode('C-8F3K')).toBe(false);
    expect(isValidCartCode('C-8F3K22')).toBe(false);
    expect(isValidCartCode('8F3K2')).toBe(false);
    expect(isValidCartCode('O-8F3K2')).toBe(false);
    expect(isValidCartCode('c-8f3k2')).toBe(false);
    expect(isValidCartCode('C_8F3K2')).toBe(false);
    expect(isValidCartCode('')).toBe(false);
  });

  it('rechaza caracteres ambiguos que no están en el alfabeto', () => {
    expect(isValidCartCode('C-8F3KI')).toBe(false);
    expect(isValidCartCode('C-8F3K1')).toBe(false);
    expect(isValidCartCode('C-8F3KO')).toBe(false);
    expect(isValidCartCode('C-8F3KL')).toBe(false);
    expect(isValidCartCode('C-8F3K0')).toBe(false);
  });

  it('no acepta un código de barras', () => {
    expect(isValidCartCode('4006381333931')).toBe(false);
  });
});

describe('código de salida de una compra en línea (RN-23)', () => {
  it('genera códigos con el formato O-XXXXX y el mismo alfabeto sin ambigüedades', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = generateExitCode();

      expect(code).toMatch(/^O-[A-Z2-9]{5}$/);
      expect(code.slice(2)).not.toMatch(/[0O1IL]/);
      expect(isValidExitCode(code)).toBe(true);
    }
  });

  it('acepta un código de salida con el formato esperado', () => {
    expect(isValidExitCode('O-8F3K2')).toBe(true);
    expect(isValidExitCode('O-23456')).toBe(true);
  });

  it('no confunde un código de salida con uno de carrito', () => {
    expect(isValidExitCode('C-8F3K2')).toBe(false);
    expect(isValidCartCode('O-8F3K2')).toBe(false);
    expect(isValidExitCode('O-8F3K')).toBe(false);
    expect(isValidExitCode('o-8f3k2')).toBe(false);
  });
});
