import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export async function cleanDatabase(): Promise<void> {
  const client = getTestPrisma();

  const tablesResult = await client.$queryRaw<Array<{ TABLE_NAME: string }>>`
    SELECT TABLE_NAME
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME <> '_prisma_migrations'
  `;

  const tables = tablesResult.map((t) => t.TABLE_NAME);

  if (tables.length === 0) {
    return;
  }

  await client.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');

  try {
    for (const table of tables) {
      // Usamos query parametrizada por nombre de tabla via string literal seguro (nombres internos de DB)
      await client.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
    }
  } finally {
    await client.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  }
}
