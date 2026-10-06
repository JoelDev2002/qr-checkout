import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { loadCatalog } from '../src/seed/catalog.js';
import { readSeedData } from '../src/seed/files.js';
import { seedAdmin } from '../src/modules/users/service.js';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  // Sin backend/.env se usan solo las variables de la sesión actual.
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === '') {
    throw new Error(`falta ${name} en backend/.env: es obligatorio para crear el admin inicial.`);
  }

  return value;
}

const prisma = new PrismaClient();

try {
  const resultado = await seedAdmin(prisma, requireEnv('ADMIN_EMAIL'), requireEnv('ADMIN_PASSWORD'));

  console.log(
    resultado.created
      ? `Admin creado: ${resultado.email} (rol ADMIN).`
      : `El admin ${resultado.email} ya existía: no se creó de nuevo ni se cambió su contraseña.`,
  );

  const directorio = fileURLToPath(new URL('./seed-data/', import.meta.url));
  const catalogo = await loadCatalog(prisma, readSeedData(directorio));

  console.log(
    `Catálogo: ${catalogo.categoriesCreated} categorías y ${catalogo.fieldsCreated} campos nuevos, ` +
      `${catalogo.campaignsCreated} campañas creadas y ${catalogo.campaignsUpdated} actualizadas, ` +
      `${catalogo.productsCreated} productos creados y ${catalogo.productsSkipped} que ya existían.`,
  );
} catch (error) {
  const mensaje = error instanceof Error ? error.message : 'error desconocido.';
  console.error(`No se pudo completar la semilla: ${mensaje}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
