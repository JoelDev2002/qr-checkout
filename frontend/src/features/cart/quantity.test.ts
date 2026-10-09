import { describe, expect, it } from 'vitest';
import { normalizeQuantity, parseQuantityInput, stepQuantity } from './quantity';

describe('normalizeQuantity', () => {
  it('no baja de 1', () => {
    expect(normalizeQuantity(0, 10)).toBe(1);
    expect(normalizeQuantity(-5, 10)).toBe(1);
  });

  it('no supera el límite del producto', () => {
    expect(normalizeQuantity(11, 10)).toBe(10);
    expect(normalizeQuantity(3, 3)).toBe(3);
  });

  it('deja igual las cantidades válidas y trunca los decimales', () => {
    expect(normalizeQuantity(5, 10)).toBe(5);
    expect(normalizeQuantity(4.9, 10)).toBe(4);
  });

  it('cae en 1 si el valor o el límite no son números', () => {
    expect(normalizeQuantity(Number.NaN, 10)).toBe(1);
    expect(normalizeQuantity(3, Number.NaN)).toBe(1);
  });
});

describe('stepQuantity', () => {
  it('suma y resta dentro del rango', () => {
    expect(stepQuantity(4, 1, 10)).toBe(5);
    expect(stepQuantity(4, -1, 10)).toBe(3);
  });

  it('no pasa del máximo ni baja de 1', () => {
    expect(stepQuantity(10, 1, 10)).toBe(10);
    expect(stepQuantity(1, -1, 10)).toBe(1);
  });
});

describe('parseQuantityInput', () => {
  it('lee enteros de 1 en adelante', () => {
    expect(parseQuantityInput('3')).toBe(3);
    expect(parseQuantityInput(' 12 ')).toBe(12);
  });

  it('rechaza lo que no es un entero positivo', () => {
    expect(parseQuantityInput('')).toBeNull();
    expect(parseQuantityInput('0')).toBeNull();
    expect(parseQuantityInput('-2')).toBeNull();
    expect(parseQuantityInput('2.5')).toBeNull();
    expect(parseQuantityInput('abc')).toBeNull();
  });
});
