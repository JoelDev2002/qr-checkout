import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { PASSWORD_MIN_LENGTH } from '../../src/domain/credentials.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import { verifyPassword } from '../../src/infrastructure/password.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

const PASSWORD = 'ClaveSegura123';

type CashierResponse = {
  id: number;
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
};

type RoleUser = {
  userId: number;
  email: string;
  token: string;
};

// Estas pruebas no hacen login para obtener el token del admin: el hash es un texto fijo,
// porque aquí lo que se prueba es la gestión de cajeros, no el acceso.
let emailCounter = 0;

async function createRoleUser(role: AuthRole): Promise<RoleUser> {
  emailCounter += 1;
  const email = `${role.toLowerCase()}-${emailCounter}@falabella.com`;
  const user = await getTestPrisma().user.create({
    data: { email, name: `Usuario ${role}`, role, passwordHash: 'hash-fijo-de-prueba' },
  });

  return { userId: user.id, email, token: signAuthToken({ sub: String(user.id), role, email }) };
}

function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

let app: Express;
let admin: RoleUser;
let cashier: RoleUser;
let customer: RoleUser;
let cashierEmailCounter = 0;

function cashierBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  cashierEmailCounter += 1;

  return {
    name: 'Carla Cashier',
    email: `cajero-${cashierEmailCounter}@falabella.com`,
    password: PASSWORD,
    ...overrides,
  };
}

async function postCashier(overrides: Record<string, unknown> = {}): Promise<CashierResponse> {
  const response = await request(app)
    .post('/api/users')
    .set(...bearer(admin.token))
    .send(cashierBody(overrides));

  expect(response.status).toBe(200);

  return response.body.data as CashierResponse;
}

async function setActive(id: number, active: boolean): Promise<request.Response> {
  return request(app).patch(`/api/users/${id}/active`).set(...bearer(admin.token)).send({ active });
}

async function setActiveWithToken(
  id: number,
  active: boolean,
  token: string,
): Promise<request.Response> {
  return request(app).patch(`/api/users/${id}/active`).set(...bearer(token)).send({ active });
}

async function listCashiers(query = ''): Promise<CashierResponse[]> {
  const response = await request(app).get(`/api/users${query}`).set(...bearer(admin.token));

  expect(response.status).toBe(200);

  return response.body.data as CashierResponse[];
}

beforeEach(async () => {
  await cleanDatabase();
  app = createApp();

  admin = await createRoleUser('ADMIN');
  cashier = await createRoleUser('CASHIER');
  customer = await createRoleUser('CUSTOMER');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/users', () => {
  it('crea un cajero activo con el correo normalizado y la contraseña cifrada', async () => {
    const response = await request(app)
      .post('/api/users')
      .set(...bearer(admin.token))
      .send(cashierBody({ name: '  Carla Cashier  ', email: '  Carla.Cashier@Falabella.COM ' }));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: expect.any(Number),
      name: 'Carla Cashier',
      email: 'carla.cashier@falabella.com',
      active: true,
      createdAt: expect.any(String),
    });

    const fila = await getTestPrisma().user.findUnique({
      where: { id: (response.body.data as CashierResponse).id },
    });

    expect(fila?.role).toBe('CASHIER');
    expect(fila?.active).toBe(true);
    expect(fila?.passwordHash).not.toBeNull();
    expect(fila?.passwordHash).not.toBe(PASSWORD);
    expect(await verifyPassword(PASSWORD, fila?.passwordHash ?? '')).toBe(true);
  });

  it('el cajero creado puede iniciar sesión', async () => {
    const creado = await postCashier({ email: 'nuevo@falabella.com' });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nuevo@falabella.com', password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual({
      id: creado.id,
      name: 'Carla Cashier',
      email: 'nuevo@falabella.com',
      role: 'CASHIER',
    });
  });

  it('responde 409 CONFLICT con un correo duplicado escrito con otras mayúsculas', async () => {
    await postCashier({ email: 'carla@falabella.com' });

    const response = await request(app)
      .post('/api/users')
      .set(...bearer(admin.token))
      .send(cashierBody({ email: '  CARLA@Falabella.com  ' }));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
    expect(response.body.error.message).toContain('carla@falabella.com');
    expect(await getTestPrisma().user.count({ where: { role: 'CASHIER' } })).toBe(2);
  });

  it('responde 409 CONFLICT si el correo ya existe con otro rol', async () => {
    const response = await request(app)
      .post('/api/users')
      .set(...bearer(admin.token))
      .send(cashierBody({ email: admin.email }));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('rechaza con 400 una contraseña de menos de 8 caracteres, sin guardar nada', async () => {
    const corta = 'Corta12';

    const response = await request(app)
      .post('/api/users')
      .set(...bearer(admin.token))
      .send(cashierBody({ password: corta }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain(`${PASSWORD_MIN_LENGTH} caracteres`);
    expect(response.body.error.message).not.toContain(corta);
    expect(await getTestPrisma().user.count({ where: { role: 'CASHIER' } })).toBe(1);
  });

  it('rechaza con 400 un role en el cuerpo: aquí solo se crean cajeros', async () => {
    const adminRole = await request(app)
      .post('/api/users')
      .set(...bearer(admin.token))
      .send(cashierBody({ role: 'ADMIN' }));
    const clienteRole = await request(app)
      .post('/api/users')
      .set(...bearer(admin.token))
      .send(cashierBody({ role: 'CUSTOMER' }));

    expect(adminRole.status).toBe(400);
    expect(adminRole.body.error.code).toBe('VALIDATION_ERROR');
    expect(adminRole.body.error.message).toContain('role');
    expect(clienteRole.status).toBe(400);
    expect(await getTestPrisma().user.count({ where: { role: 'CASHIER' } })).toBe(1);
  });

  it('valida el cuerpo con Zod: correo inválido y nombre vacío', async () => {
    const correo = await request(app)
      .post('/api/users')
      .set(...bearer(admin.token))
      .send(cashierBody({ email: 'no-es-un-correo' }));
    const nombre = await request(app)
      .post('/api/users')
      .set(...bearer(admin.token))
      .send(cashierBody({ name: '   ' }));

    expect(correo.status).toBe(400);
    expect(correo.body.error.message).toContain('Escribe un correo válido.');
    expect(nombre.status).toBe(400);
    expect(nombre.body.error.message).toContain('no puede estar vacío');
  });

  it('responde 403 a un cajero y a un cliente, y 401 sin token', async () => {
    const cuerpo = cashierBody();

    const comoCajero = await request(app).post('/api/users').set(...bearer(cashier.token)).send(cuerpo);
    const comoCliente = await request(app).post('/api/users').set(...bearer(customer.token)).send(cuerpo);
    const sinToken = await request(app).post('/api/users').send(cuerpo);

    expect(comoCajero.status).toBe(403);
    expect(comoCajero.body.error.code).toBe('FORBIDDEN');
    expect(comoCliente.status).toBe(403);
    expect(comoCliente.body.error.code).toBe('FORBIDDEN');
    expect(sinToken.status).toBe(401);
    expect(sinToken.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/users', () => {
  it('lista solo los cajeros, ordenados por nombre', async () => {
    await postCashier({ name: 'Zoraida Cajera', email: 'zoraida@falabella.com' });
    await postCashier({ name: 'Beto Cajero', email: 'beto@falabella.com' });
    await postCashier({ name: 'Ana Cajera', email: 'ana@falabella.com' });

    const listado = await listCashiers();

    // El cajero que creó el token también es un cajero, así que aparece; el admin y la cliente, no.
    expect(listado.map((fila) => fila.name)).toEqual([
      'Ana Cajera',
      'Beto Cajero',
      'Usuario CASHIER',
      'Zoraida Cajera',
    ]);
    expect(listado.map((fila) => fila.email)).toEqual([
      'ana@falabella.com',
      'beto@falabella.com',
      cashier.email,
      'zoraida@falabella.com',
    ]);
    expect(listado[0]).toEqual({
      id: expect.any(Number),
      name: 'Ana Cajera',
      email: 'ana@falabella.com',
      active: true,
      createdAt: expect.any(String),
    });
  });

  it('filtra por active y trae también los desactivados cuando se piden', async () => {
    const activo = await postCashier({ name: 'Activo Cajero', email: 'activo@falabella.com' });
    const desactivado = await postCashier({ name: 'Inactivo Cajero', email: 'inactivo@falabella.com' });

    // El cajero que creó el token también se apaga, para que el filtro se lea sin ruido.
    expect((await setActive(cashier.userId, false)).status).toBe(200);
    expect((await setActive(desactivado.id, false)).status).toBe(200);

    const soloActivos = await listCashiers('?active=true');
    const soloInactivos = await listCashiers('?active=false');
    const sinFiltro = await listCashiers();

    expect(soloActivos.map((fila) => fila.id)).toEqual([activo.id]);
    expect(soloInactivos.map((fila) => fila.id)).toEqual([desactivado.id, cashier.userId]);
    expect(soloInactivos[0]?.active).toBe(false);
    // Sin filtro vienen los tres, y el orden sigue siendo por nombre: Activo, Inactivo y Usuario.
    expect(sinFiltro.map((fila) => fila.id)).toEqual([activo.id, desactivado.id, cashier.userId]);
  });

  it('acepta el filtro con 1 y 0 y rechaza con 400 cualquier otro valor', async () => {
    const creado = await postCashier();

    const conUno = await request(app).get('/api/users?active=1').set(...bearer(admin.token));
    const conCero = await request(app).get('/api/users?active=0').set(...bearer(admin.token));
    const invalido = await request(app).get('/api/users?active=si').set(...bearer(admin.token));

    expect(conUno.status).toBe(200);
    expect((conUno.body.data as CashierResponse[]).map((fila) => fila.id)).toContain(creado.id);
    expect((conUno.body.data as CashierResponse[]).every((fila) => fila.active)).toBe(true);
    expect(conCero.status).toBe(200);
    expect(conCero.body.data).toEqual([]);
    expect(invalido.status).toBe(400);
    expect(invalido.body.error.code).toBe('VALIDATION_ERROR');
    expect(invalido.body.error.message).toContain('true o false');
  });

  it('responde 403 a un cajero y a un cliente, y 401 sin token', async () => {
    await postCashier();

    const comoCajero = await request(app).get('/api/users').set(...bearer(cashier.token));
    const comoCliente = await request(app).get('/api/users').set(...bearer(customer.token));
    const sinToken = await request(app).get('/api/users');

    expect(comoCajero.status).toBe(403);
    expect(comoCajero.body.error.code).toBe('FORBIDDEN');
    expect(comoCliente.status).toBe(403);
    expect(comoCliente.body.error.code).toBe('FORBIDDEN');
    expect(sinToken.status).toBe(401);
    expect(sinToken.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('PATCH /api/users/:id/active', () => {
  it('desactiva y reactiva un cajero sin borrarlo', async () => {
    const creado = await postCashier({ email: 'carla@falabella.com' });

    const desactivada = await setActive(creado.id, false);

    expect(desactivada.status).toBe(200);
    expect(desactivada.body.data).toEqual({ ...creado, active: false });

    const fila = await getTestPrisma().user.findUnique({ where: { id: creado.id } });
    expect(fila).not.toBeNull();
    expect(fila?.active).toBe(false);
    expect(fila?.email).toBe('carla@falabella.com');

    const reactivada = await setActive(creado.id, true);

    expect(reactivada.status).toBe(200);
    expect(reactivada.body.data.active).toBe(true);
    expect((await getTestPrisma().user.findUnique({ where: { id: creado.id } }))?.active).toBe(true);
  });

  it('responde 404 con el id de un admin o de un cliente y no los toca', async () => {
    const conAdmin = await setActive(admin.userId, false);
    const conCliente = await setActive(customer.userId, false);
    const inexistente = await setActive(987654, false);

    expect(conAdmin.status).toBe(404);
    expect(conAdmin.body.error.code).toBe('NOT_FOUND');
    expect(conCliente.status).toBe(404);
    expect(inexistente.status).toBe(404);

    const adminRow = await getTestPrisma().user.findUnique({ where: { id: admin.userId } });
    const clienteRow = await getTestPrisma().user.findUnique({ where: { id: customer.userId } });

    expect(adminRow?.active).toBe(true);
    expect(adminRow?.role).toBe('ADMIN');
    expect(clienteRow?.active).toBe(true);
    expect(clienteRow?.role).toBe('CUSTOMER');
  });

  it('rechaza con 400 un active que no es booleano y con 400 un id que no es número', async () => {
    const creado = await postCashier();

    const active = await request(app)
      .patch(`/api/users/${creado.id}/active`)
      .set(...bearer(admin.token))
      .send({ active: 'no' });
    const id = await request(app)
      .patch('/api/users/abc/active')
      .set(...bearer(admin.token))
      .send({ active: false });

    expect(active.status).toBe(400);
    expect(active.body.error.code).toBe('VALIDATION_ERROR');
    expect(id.status).toBe(400);
    expect(id.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('responde 403 a un cajero y a un cliente, y 401 sin token', async () => {
    const creado = await postCashier();

    const comoCajero = await setActiveWithToken(creado.id, false, cashier.token);
    const comoCliente = await setActiveWithToken(creado.id, false, customer.token);
    const sinToken = await request(app)
      .patch(`/api/users/${creado.id}/active`)
      .send({ active: false });

    expect(comoCajero.status).toBe(403);
    expect(comoCajero.body.error.code).toBe('FORBIDDEN');
    expect(comoCliente.status).toBe(403);
    expect(comoCliente.body.error.code).toBe('FORBIDDEN');
    expect(sinToken.status).toBe(401);
    expect(sinToken.body.error.code).toBe('UNAUTHORIZED');
    expect((await getTestPrisma().user.findUnique({ where: { id: creado.id } }))?.active).toBe(true);
  });
});

describe('un cajero desactivado ya no puede entrar (RN-14)', () => {
  it('rechaza el login y anula el token que ya tenía', async () => {
    const creado = await postCashier({ name: 'Carla Cashier', email: 'carla@falabella.com' });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'carla@falabella.com', password: PASSWORD });

    expect(login.status).toBe(200);
    const token: string = login.body.data.token;

    expect((await setActive(creado.id, false)).status).toBe(200);

    const loginDesactivado = await request(app)
      .post('/api/auth/login')
      .send({ email: 'carla@falabella.com', password: PASSWORD });
    const meConTokenViejo = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(loginDesactivado.status).toBe(401);
    expect(loginDesactivado.body.error.code).toBe('UNAUTHORIZED');
    expect(meConTokenViejo.status).toBe(401);
    expect(meConTokenViejo.body.error.code).toBe('UNAUTHORIZED');
  });

  it('vuelve a entrar al reactivarlo', async () => {
    const creado = await postCashier({ email: 'carla@falabella.com' });

    await setActive(creado.id, false);
    await setActive(creado.id, true);

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'carla@falabella.com', password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.user.id).toBe(creado.id);
  });
});

describe('el hash de la contraseña nunca sale de la API', () => {
  it('no aparece en el alta, ni en el listado, ni al activar o desactivar', async () => {
    const creado = await postCashier({ email: 'carla@falabella.com' });

    const respuestas = [
      await request(app).post('/api/users').set(...bearer(admin.token)).send(cashierBody()),
      await request(app).get('/api/users').set(...bearer(admin.token)),
      await request(app).get('/api/users?active=true').set(...bearer(admin.token)),
      await setActive(creado.id, false),
      await setActive(creado.id, true),
    ];

    for (const respuesta of respuestas) {
      const cuerpo = JSON.stringify(respuesta.body);
      expect(cuerpo).not.toContain('passwordHash');
      expect(cuerpo).not.toContain('$2');
      expect(cuerpo).not.toContain(PASSWORD);
    }
  });
});