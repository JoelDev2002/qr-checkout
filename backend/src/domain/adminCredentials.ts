import { z } from 'zod';
import { emailField, PASSWORD_MIN_LENGTH, passwordField } from './credentials.js';

export const ADMIN_PASSWORD_MIN_LENGTH = PASSWORD_MIN_LENGTH;

export const adminCredentialsSchema = z.object({
  email: emailField(
    'Falta ADMIN_EMAIL: indica el correo del admin inicial.',
    'ADMIN_EMAIL no es un correo válido.',
  ),
  password: passwordField(
    'Falta ADMIN_PASSWORD: indica la contraseña del admin inicial.',
    `ADMIN_PASSWORD debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  ),
});

export type AdminCredentials = z.infer<typeof adminCredentialsSchema>;