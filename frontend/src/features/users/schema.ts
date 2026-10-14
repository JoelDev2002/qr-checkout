import { z } from 'zod';

export const USER_NAME_MAX_LENGTH = 80;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

const cashierName = z
  .string({ required_error: 'El nombre del cajero es obligatorio.' })
  .trim()
  .min(1, 'El nombre del cajero no puede estar vacío.')
  .max(USER_NAME_MAX_LENGTH, `El nombre no puede tener más de ${USER_NAME_MAX_LENGTH} caracteres.`);

/** El correo se guarda en minúsculas, igual que en el servidor (domain/credentials.ts). */
const cashierEmail = z
  .string({ required_error: 'El correo del cajero es obligatorio.' })
  .trim()
  .toLowerCase()
  .email('Escribe un correo válido.');

const cashierPassword = z
  .string({ required_error: 'La contraseña es obligatoria.' })
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(PASSWORD_MAX_LENGTH, 'La contraseña es demasiado larga.');

export const cashierFormSchema = z.object({
  name: cashierName,
  email: cashierEmail,
  password: cashierPassword,
});

export type CashierFormValues = z.infer<typeof cashierFormSchema>;
