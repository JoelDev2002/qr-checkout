import { describe, expect, it } from 'vitest';
import { normalizeScanText } from './normalize';

// Caracteres con String.fromCharCode para no depender de escapes en el archivo.
const BEL = String.fromCharCode(7);
const US = String.fromCharCode(31);
const DEL = String.fromCharCode(127);
const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const NBSP = String.fromCharCode(160);

describe('normalizeScanText', () => {
  it('quita espacios al inicio y al final', () => {
    expect(normalizeScanText('  7501025001043  ')).toBe('7501025001043');
    expect(normalizeScanText(`${LF}${TAB}C-8F3K2${CR}${LF}`)).toBe('C-8F3K2');
  });

  it('quita los espacios que quedan dentro del código', () => {
    expect(normalizeScanText('7501 0250 01043')).toBe('7501025001043');
    expect(normalizeScanText('C - 8F3K2')).toBe('C-8F3K2');
  });

  it('quita los caracteres de control', () => {
    expect(normalizeScanText(`${BEL}C-8F3K2${BEL}`)).toBe('C-8F3K2');
    expect(normalizeScanText(`C-8F3K2${US}`)).toBe('C-8F3K2');
    expect(normalizeScanText(`${DEL}C-8F3K2`)).toBe('C-8F3K2');
  });

  it('deja los códigos en mayúsculas', () => {
    expect(normalizeScanText('c-8f3k2')).toBe('C-8F3K2');
    expect(normalizeScanText('abc')).toBe('ABC');
  });

  it('devuelve vacío si no queda ningún código', () => {
    expect(normalizeScanText('')).toBe('');
    expect(normalizeScanText(`   ${LF}${TAB} `)).toBe('');
    expect(normalizeScanText(NBSP)).toBe('');
  });

  it('no cambia un código que ya está bien', () => {
    expect(normalizeScanText('7501025001043')).toBe('7501025001043');
    expect(normalizeScanText('C-8F3K2')).toBe('C-8F3K2');
    expect(normalizeScanText('20012345678905')).toBe('20012345678905');
  });
});
