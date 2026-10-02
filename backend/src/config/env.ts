import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const envFilePath = fileURLToPath(new URL('../../.env', import.meta.url));

try {
  process.loadEnvFile(envFilePath);
} catch {
  // Sin .env se usan solo las variables de la sesión actual.
}

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_URL: z.string().url(),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith('mysql://'), {
    message: 'Debe empezar con mysql://',
  }),
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