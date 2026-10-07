import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'El correo es obligatorio.' })
    .trim()
    .toLowerCase()
    .email('Escribe un correo válido.'),
  password: z
    .string({ required_error: 'La contraseña es obligatoria.' })
    .min(1, 'La contraseña es obligatoria.')
    .max(200, 'La contraseña es demasiado larga.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const googleLoginSchema = z.object({
  credential: z.string({ required_error: 'Falta el token de Google.' }).min(1, 'Falta el token de Google.'),
});

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;

/** dev-login no recibe datos: acepta un cuerpo vacío presente o ausente. */
export const devLoginSchema = z.preprocess((value) => value ?? {}, z.object({}).passthrough());