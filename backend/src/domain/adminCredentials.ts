import { z } from 'zod';

export const ADMIN_PASSWORD_MIN_LENGTH = 8;

export const adminCredentialsSchema = z.object({
  email: z
    .string({ required_error: 'Falta ADMIN_EMAIL: indica el correo del admin inicial.' })
    .trim()
    .toLowerCase()
    .email('ADMIN_EMAIL no es un correo válido.'),
  password: z
    .string({ required_error: 'Falta ADMIN_PASSWORD: indica la contraseña del admin inicial.' })
    .min(
      ADMIN_PASSWORD_MIN_LENGTH,
      `ADMIN_PASSWORD debe tener al menos ${ADMIN_PASSWORD_MIN_LENGTH} caracteres.`,
    )
    .max(200, 'La contraseña es demasiado larga.'),
});

export type AdminCredentials = z.infer<typeof adminCredentialsSchema>;
