import { fileURLToPath } from 'node:url';

const envFilePath = fileURLToPath(new URL('../.env', import.meta.url));

try {
  process.loadEnvFile(envFilePath);
} catch {
  // Sin .env se usan solo las variables de la sesión actual.
}

const databaseUrlTest = process.env.DATABASE_URL_TEST;

if (!databaseUrlTest) {
  throw new Error('Falta DATABASE_URL_TEST en backend/.env para correr las pruebas.');
}

// loadEnvFile no pisa variables ya definidas, así que config/env.ts seguirá viendo esta URL.
process.env.DATABASE_URL = databaseUrlTest;