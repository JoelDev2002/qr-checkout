import { z } from 'zod';
import { emailField, PASSWORD_MIN_LENGTH, passwordField } from '../../domain/credentials.js';

export const USER_NAME_MAX_LENGTH = 80;

const cashierName = z
  .string({ required_error: 'El nombre del cajero es obligatorio.' })
  .trim()
  .min(1, 'El nombre del cajero no puede estar vacío.')
  .max(USER_NAME_MAX_LENGTH, `El nombre no puede tener más de ${USER_NAME_MAX_LENGTH} caracteres.`);

/**
 * El rol no se acepta: aquí solo se crean cajeros (RN-14), y el esquema es estricto para que
 * un `role` en el cuerpo se explique en español en lugar del mensaje de Zod.
 */
export const createCashierSchema = z
  .object({
    name: cashierName,
    email: emailField('El correo del cajero es obligatorio.', 'Escribe un correo válido.'),
    password: passwordField(
      'La contraseña es obligatoria.',
      `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    ),
  })
  .strict();

export const setCashierActiveSchema = z
  .object({
    active: z.boolean({ invalid_type_error: 'Indica si el cajero queda activo.' }),
  })
  .strict();

export const listCashiersQuerySchema = z.object({
  active: z
    .enum(['true', 'false', '1', '0'], {
      errorMap: () => ({ message: 'El filtro de estado debe ser true o false.' }),
    })
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true' || value === '1')),
});

export const userIdParamSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: 'El identificador debe ser un número.' })
    .int('El identificador debe ser un número entero.')
    .positive('El identificador debe ser mayor que cero.'),
});

export type CreateCashierInput = z.infer<typeof createCashierSchema>;
export type ListCashiersQuery = z.infer<typeof listCashiersQuerySchema>;