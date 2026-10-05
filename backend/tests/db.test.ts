import { describe, expect, it, beforeEach } from 'vitest';
import { getTestPrisma, cleanDatabase } from './helpers/db.js';

describe('db helper', () => {
  const prisma = getTestPrisma();

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('conecta a qrcheckout_test y limpia User', async () => {
    const [dbNameRow] = await prisma.$queryRaw<Array<{ db: string }>>`
      SELECT DATABASE() as db
    `;
    expect(dbNameRow?.db).toBe('qrcheckout_test');

    await prisma.user.create({
      data: {
        email: 'test@local',
        name: 'Test',
        role: 'CUSTOMER',
      },
    });

    const countBefore = await prisma.user.count();
    expect(countBefore).toBe(1);

    await cleanDatabase();

    const countAfter = await prisma.user.count();
    expect(countAfter).toBe(0);
  });
});
