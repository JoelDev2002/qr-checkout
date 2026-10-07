import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { InstallmentsConfig } from '../domain/installments.js';

const envFilePath = fileURLToPath(new URL('../../.env', import.meta.url));

try {
  process.loadEnvFile(envFilePath);
} catch {
  // Sin .env se usan solo las variables de la sesión actual.
}

export function parseInstallmentOptions(value: string): number[] {
  return value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((count) => Number.isInteger(count) && count > 0);
}

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_URL: z.string().url(),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith('mysql://'), {
    message: 'Debe empezar con mysql://',
  }),
  INSTALLMENTS_OPTIONS: z
    .string()
    .default('3,6,12')
    .transform(parseInstallmentOptions)
    .refine((options) => options.length > 0, {
      message: 'Debe tener al menos una cantidad de cuotas, por ejemplo 3,6,12',
    }),
  INSTALLMENTS_MIN_TOTAL_CENTS: z.coerce.number().int().positive().default(30000),
  /** Vigencia del QR del carrito (RN-05). */
  CART_QR_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  JWT_SECRET: z.string().min(32, {
    message: 'Debe tener al menos 32 caracteres',
  }),
  JWT_EXPIRES_IN: z.string().default('1h'),
  /** ID de cliente OAuth de Google; si no se configura, /auth/google responde 503. */
  GOOGLE_CLIENT_ID: z.string().trim().default(''),
  /** Solo con "true" y NODE_ENV=development se registra POST /auth/dev-login. */
  DEV_LOGIN: z
    .string()
    .default('')
    .transform((value) => value.trim().toLowerCase() === 'true'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))].sort();
  console.error(
    `No se pudo iniciar la API: falta o es inválida ${names.length === 1 ? 'la variable' : 'las variables'} de entorno ${names.join(', ')}. Revisa backend/.env.`,
  );
  process.exit(1);
}

export const env = parsed.data;

export const installmentsConfig: InstallmentsConfig = {
  options: env.INSTALLMENTS_OPTIONS,
  minTotalCents: env.INSTALLMENTS_MIN_TOTAL_CENTS,
};