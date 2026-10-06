import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;
export const PASSWORD_TOO_LONG_MESSAGE = 'La contraseña es demasiado larga.';

/**
 * El correo se guarda siempre en minúsculas y sin espacios sobrantes: como es único en la base,
 * normalizar evita que dos usuarios distintos ocupen el mismo correo por escribirlo distinto.
 */
export function emailField(requiredMessage: string, invalidMessage: string) {
  return z.string({ required_error: requiredMessage }).trim().toLowerCase().email(invalidMessage);
}

/** El mismo mínimo en todos lados: una contraseña corta no se acepta en ninguna parte. */
export function passwordField(requiredMessage: string, tooShortMessage: string) {
  return z
    .string({ required_error: requiredMessage })
    .min(PASSWORD_MIN_LENGTH, tooShortMessage)
    .max(PASSWORD_MAX_LENGTH, PASSWORD_TOO_LONG_MESSAGE);
}