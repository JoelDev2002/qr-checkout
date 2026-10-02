import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/infrastructure/prisma.js';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/health', () => {
  it('responde con el estado del servicio', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: 'ok' } });
  });
});

describe('base de datos de pruebas', () => {
  it('usa la base qrcheckout_test', async () => {
    const rows = await prisma.$queryRaw<Array<{ databaseName: string }>>`
      SELECT DATABASE() AS databaseName
    `;

    expect(rows[0]?.databaseName).toBe('qrcheckout_test');
  });
});