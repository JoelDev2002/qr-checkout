import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function globalSetup(): void {
  const envFilePath = fileURLToPath(new URL('../.env', import.meta.url));

  try {
    process.loadEnvFile(envFilePath);
  } catch {
    // Sin .env se usan solo las variables de la sesión actual.
  }

  const databaseUrl = process.env.DATABASE_URL ?? '';
  const databaseUrlTest = process.env.DATABASE_URL_TEST ?? '';

  if (!databaseUrlTest) {
    throw new Error('Falta DATABASE_URL_TEST en backend/.env para correr las pruebas.');
  }

  function extractDbName(url: string): string | null {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname || '';
      // pathname empieza con /dbname
      const name = pathname.replace(/^\//, '');
      return name || null;
    } catch {
      return null;
    }
  }

  const dbName = extractDbName(databaseUrl);
  const dbNameTest = extractDbName(databaseUrlTest);

  if (!dbNameTest || !dbNameTest.endsWith('_test')) {
    throw new Error('El nombre de la base de DATABASE_URL_TEST debe terminar en "_test".');
  }

  if (dbName && dbName === dbNameTest) {
    throw new Error('DATABASE_URL_TEST debe apuntar a una base distinta de DATABASE_URL.');
  }

  // Aplica migraciones solo a la base de pruebas
  execSync('npx prisma migrate deploy', {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrlTest },
  });
}
