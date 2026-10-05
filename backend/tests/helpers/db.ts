import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

// El esquema no cambia durante una corrida, así que la lista se resuelve una sola vez por proceso.
let tableNames: string[] | null = null;

async function listTables(client: PrismaClient): Promise<string[]> {
  if (tableNames) {
    return tableNames;
  }

  const result = await client.$queryRaw<Array<{ TABLE_NAME: string }>>`
    SELECT TABLE_NAME
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME <> '_prisma_migrations'
  `;

  tableNames = result.map((tabla) => tabla.TABLE_NAME);
  return tableNames;
}

export async function cleanDatabase(): Promise<void> {
  const client = getTestPrisma();
  const tables = await listTables(client);

  if (tables.length === 0) {
    return;
  }

  // La transacción fija una sola conexión, así que los SET y los DELETE van por la misma sesión.
  // DELETE vacía las tablas sin reconstruir cada una como hace TRUNCATE, que es lo que cuesta ~2 s.
  await client.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');

      try {
        for (const table of tables) {
          // Los nombres salen de information_schema de la propia base, no de entrada externa.
          await tx.$executeRawUnsafe(`DELETE FROM \`${table}\``);
        }
      } finally {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
      }
    },
    { timeout: 30_000 },
  );
}