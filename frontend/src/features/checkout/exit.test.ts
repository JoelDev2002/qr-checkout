import { describe, expect, it } from 'vitest';
import { ApiError } from '../../services/api';
import { RATE_LIMITED_MESSAGE } from './checkout';
import {
  EXIT_ALREADY_DELIVERED_MESSAGE,
  EXIT_NOT_FOUND_MESSAGE,
  exitVerifyErrorMessage,
  isValidExitCode,
  normalizeExitCode,
} from './exit';

describe('código de salida', () => {
  it('deja el código en mayúsculas y sin espacios', () => {
    expect(normalizeExitCode(' o-8f3k2 ')).toBe('O-8F3K2');
    expect(normalizeExitCode('O - 8 F 3 K 2')).toBe('O-8F3K2');
  });

  it('valida el formato O-XXXXX con el alfabeto del backend', () => {
    expect(isValidExitCode('O-8F3K2')).toBe(true);
    expect(isValidExitCode('O-8F3K')).toBe(false);
    expect(isValidExitCode('O-8F3KO')).toBe(false);
    expect(isValidExitCode('C-8F3K2')).toBe(false);
    expect(isValidExitCode('')).toBe(false);
  });
});

describe('exitVerifyErrorMessage', () => {
  it('explica que la compra ya se entregó y que el código no existe', () => {
    expect(exitVerifyErrorMessage(new ApiError('ALREADY_DELIVERED', 'otro texto'))).toBe(
      EXIT_ALREADY_DELIVERED_MESSAGE,
    );
    expect(exitVerifyErrorMessage(new ApiError('NOT_FOUND', 'otro texto'))).toBe(EXIT_NOT_FOUND_MESSAGE);
  });

  it('avisa del límite de intentos', () => {
    expect(exitVerifyErrorMessage(new ApiError('TOO_MANY_REQUESTS', 'Demasiados intentos.'))).toBe(
      RATE_LIMITED_MESSAGE,
    );
  });

  it('un error desconocido no se muestra crudo', () => {
    expect(exitVerifyErrorMessage(new Error('boom'))).toBe(
      'Ocurrió un error inesperado. Inténtalo de nuevo.',
    );
  });
});
