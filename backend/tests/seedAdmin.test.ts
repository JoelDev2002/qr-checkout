import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ADMIN_PASSWORD_MIN_LENGTH } from '../src/domain/adminCredentials.js';
import { hashPassword, verifyPassword } from '../src/infrastructure/password.js';
import { prisma } from '../src/infrastructure/prisma.js';
import { seedAdmin } from '../src/modules/users/service.js';
import { cleanDatabase, getTestPrisma } from './helpers/db.js';

const PASSWORD = 'ClaveSegura123';

let app: Express;

beforeEach(async () => {
  await cleanDatabase();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('seedAdmin', () => {
  it('crea el admin activo con el correo normalizado y la contraseña cifrada', async () => {
    const resultado = await seedAdmin(getTestPrisma(), '  Admin@Falabella.COM  ', PASSWORD);

    expect(resultado.created).toBe(true);

    const admin = await getTestPrisma().user.findUnique({ where: { email: 'admin@falabella.com' } });

    expect(admin?.role).toBe('ADMIN');
    expect(admin?.active).toBe(true);
    expect(admin?.name).toBeTruthy();
    expect(admin?.passwordHash).not.toBeNull();
    expect(admin?.passwordHash).not.toBe(PASSWORD);
    expect(await verifyPassword(PASSWORD, admin?.passwordHash ?? '')).toBe(true);
  });

  it('no duplica ni cambia la contraseña si se ejecuta otra vez', async () => {
    const primera = await seedAdmin(getTestPrisma(), 'admin@falabella.com', PASSWORD);
    const hashInicial = (
      await getTestPrisma().user.findUnique({ where: { email: 'admin@falabella.com' } })
    )?.passwordHash;

    const segunda = await seedAdmin(getTestPrisma(), '  ADMIN@falabella.com  ', 'OtraClaveDistinta9');

    expect(segunda.created).toBe(false);
    expect(segunda.userId).toBe(primera.userId);

    const usuarios = await getTestPrisma().user.findMany({ where: { email: 'admin@falabella.com' } });
    expect(usuarios).toHaveLength(1);
    expect(usuarios[0]?.passwordHash).toBe(hashInicial);
    expect(await verifyPassword(PASSWORD, usuarios[0]?.passwordHash ?? '')).toBe(true);
  });

  it('falla si el correo ya existe con otro rol y no lo modifica', async () => {
    const hashCajero = await hashPassword(PASSWORD);
    await getTestPrisma().user.create({
      data: {
        email: 'cajero@falabella.com',
        name: 'Carla Cashier',
        role: 'CASHIER',
        passwordHash: hashCajero,
      },
    });

    await expect(seedAdmin(getTestPrisma(), 'cajero@falabella.com', PASSWORD)).rejects.toThrow(
      /Ya existe un usuario con el correo cajero@falabella\.com y su rol es CASHIER/,
    );

    const cajero = await getTestPrisma().user.findUnique({ where: { email: 'cajero@falabella.com' } });
    expect(cajero?.role).toBe('CASHIER');
    expect(cajero?.passwordHash).toBe(hashCajero);
    expect(await getTestPrisma().user.count()).toBe(1);
  });

  it('rechaza una contraseña de menos de 8 caracteres sin imprimirla', async () => {
    const corta = 'Corta12';

    const error = await seedAdmin(getTestPrisma(), 'admin@falabella.com', corta).catch(
      (fallo: unknown) => fallo,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(`al menos ${ADMIN_PASSWORD_MIN_LENGTH} caracteres`);
    expect((error as Error).message).not.toContain(corta);
    expect(await getTestPrisma().user.count()).toBe(0);
  });

  it('rechaza que falte el correo, la contraseña o que el correo no sea válido', async () => {
    await expect(seedAdmin(getTestPrisma(), '', PASSWORD)).rejects.toThrow(/correo/i);
    await expect(seedAdmin(getTestPrisma(), 'no-es-un-correo', PASSWORD)).rejects.toThrow(
      /no es un correo válido/,
    );
    await expect(
      seedAdmin(getTestPrisma(), 'admin@falabella.com', undefined as unknown as string),
    ).rejects.toThrow(/Falta ADMIN_PASSWORD/);
    expect(await getTestPrisma().user.count()).toBe(0);
  });
});

describe('admin sembrado', () => {
  it('puede iniciar sesión en POST /api/auth/login', async () => {
    await seedAdmin(getTestPrisma(), 'Admin@Falabella.com', PASSWORD);

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@falabella.com', password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({
      email: 'admin@falabella.com',
      role: 'ADMIN',
    });
    expect(typeof response.body.data.token).toBe('string');
  });
});
