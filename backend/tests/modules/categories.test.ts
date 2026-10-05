import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

type RoleToken = {
  userId: number;
  token: string;
};

type CategoryResponse = {
  id: number;
  name: string;
  active: boolean;
  fields: Array<{ id: number; key: string; active: boolean }>;
};

type FieldResponse = {
  id: number;
  categoryId: number;
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: string[] | null;
  unit: string | null;
  sortOrder: number;
  active: boolean;
};

// Las pruebas no hacen login por HTTP: el hash es un texto fijo porque aquí no se verifica contraseñas.
let emailCounter = 0;

async function createRoleToken(role: AuthRole): Promise<RoleToken> {
  emailCounter += 1;
  const email = `${role.toLowerCase()}-${emailCounter}@falabella.com`;
  const user = await getTestPrisma().user.create({
    data: { email, name: `Usuario ${role}`, role, passwordHash: 'hash-fijo-de-prueba' },
  });

  return { userId: user.id, token: signAuthToken({ sub: String(user.id), role, email }) };
}

function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

let app: Express;
let adminToken: string;
let cashierToken: string;
let customerToken: string;

async function postCategory(name: string): Promise<CategoryResponse> {
  const response = await request(app)
    .post('/api/categories')
    .set(...bearer(adminToken))
    .send({ name });

  expect(response.status).toBe(200);
  return response.body.data as CategoryResponse;
}

async function postField(
  categoryId: number,
  body: Record<string, unknown>,
): Promise<request.Response> {
  return request(app)
    .post(`/api/categories/${categoryId}/fields`)
    .set(...bearer(adminToken))
    .send(body);
}

async function createField(
  categoryId: number,
  body: Record<string, unknown>,
): Promise<FieldResponse> {
  const response = await postField(categoryId, body);

  expect(response.status).toBe(200);
  return response.body.data as FieldResponse;
}

async function patchCategoryActive(categoryId: number, active: boolean) {
  return request(app)
    .patch(`/api/categories/${categoryId}/active`)
    .set(...bearer(adminToken))
    .send({ active });
}

async function patchFieldActive(categoryId: number, fieldId: number, active: boolean) {
  return request(app)
    .patch(`/api/categories/${categoryId}/fields/${fieldId}/active`)
    .set(...bearer(adminToken))
    .send({ active });
}

beforeEach(async () => {
  await cleanDatabase();
  app = createApp();
  adminToken = (await createRoleToken('ADMIN')).token;
  cashierToken = (await createRoleToken('CASHIER')).token;
  customerToken = (await createRoleToken('CUSTOMER')).token;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/categories', () => {
  it('devuelve las categorías activas con sus campos activos en orden de sortOrder', async () => {
    const categoria = await postCategory('Audífonos');

    await createField(categoria.id, { key: 'conectividad', label: 'Conexión', type: 'TEXT', sortOrder: 3 });
    await createField(categoria.id, {
      key: 'color_disponible',
      label: 'Color',
      type: 'SELECT',
      options: ['Negro', 'Blanco'],
      sortOrder: 1,
    });
    await createField(categoria.id, { key: 'bateria_horas', label: 'Batería', type: 'NUMBER', unit: 'horas', sortOrder: 2 });

    const response = await request(app).get('/api/categories').set(...bearer(customerToken));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);

    const categoriaDevuelta = response.body.data[0] as CategoryResponse;
    expect(categoriaDevuelta.id).toBe(categoria.id);
    expect(categoriaDevuelta.name).toBe('Audífonos');
    expect(categoriaDevuelta.active).toBe(true);
    expect(categoriaDevuelta.fields.map((campo) => campo.key)).toEqual([
      'color_disponible',
      'bateria_horas',
      'conectividad',
    ]);
  });

  it('responde 401 sin token', async () => {
    const response = await request(app).get('/api/categories');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /api/categories', () => {
  it('crea la categoría y guarda el nombre sin espacios sobrantes', async () => {
    const response = await request(app)
      .post('/api/categories')
      .set(...bearer(adminToken))
      .send({ name: '  Audífonos   Inalámbricos  ' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: expect.any(Number),
      name: 'Audífonos Inalámbricos',
      active: true,
      fields: [],
    });
  });

  it('rechaza con 400 un nombre vacío', async () => {
    const response = await request(app)
      .post('/api/categories')
      .set(...bearer(adminToken))
      .send({ name: '   ' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('no puede estar vacío');
  });

  it('responde 409 con CONFLICT si el nombre ya existe', async () => {
    await postCategory('Audífonos');

    const response = await request(app)
      .post('/api/categories')
      .set(...bearer(adminToken))
      .send({ name: 'Audífonos' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');

    const guardadas = await getTestPrisma().category.count();
    expect(guardadas).toBe(1);
  });

  it('responde 403 a un cajero y a un cliente, y 401 sin token', async () => {
    const cuerpo = { name: 'Camas' };

    const cajero = await request(app)
      .post('/api/categories')
      .set(...bearer(cashierToken))
      .send(cuerpo);
    const cliente = await request(app)
      .post('/api/categories')
      .set(...bearer(customerToken))
      .send(cuerpo);
    const sinToken = await request(app).post('/api/categories').send(cuerpo);

    expect(cajero.status).toBe(403);
    expect(cajero.body.error.code).toBe('FORBIDDEN');
    expect(cliente.status).toBe(403);
    expect(cliente.body.error.code).toBe('FORBIDDEN');
    expect(sinToken.status).toBe(401);
    expect(sinToken.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('PUT /api/categories/:id', () => {
  it('renombra la categoría', async () => {
    const categoria = await postCategory('Audífonos');

    const response = await request(app)
      .put(`/api/categories/${categoria.id}`)
      .set(...bearer(adminToken))
      .send({ name: '  Audífonos  y  Cascos ' });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('Audífonos y Cascos');
  });

  it('responde 409 con CONFLICT si el nuevo nombre ya existe', async () => {
    await postCategory('Audífonos');
    const otra = await postCategory('Camas');

    const response = await request(app)
      .put(`/api/categories/${otra.id}`)
      .set(...bearer(adminToken))
      .send({ name: 'Audífonos' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('responde 404 si la categoría no existe', async () => {
    const response = await request(app)
      .put('/api/categories/999')
      .set(...bearer(adminToken))
      .send({ name: 'Camas' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('responde 403 a un cajero y 401 sin token', async () => {
    const categoria = await postCategory('Camas');

    const cajero = await request(app)
      .put(`/api/categories/${categoria.id}`)
      .set(...bearer(cashierToken))
      .send({ name: 'Camas y colchones' });
    const sinToken = await request(app)
      .put(`/api/categories/${categoria.id}`)
      .send({ name: 'Camas y colchones' });

    expect(cajero.status).toBe(403);
    expect(sinToken.status).toBe(401);
  });
});

describe('PATCH /api/categories/:id/active', () => {
  it('desactiva y reactiva la categoría sin borrarla', async () => {
    const categoria = await postCategory('Audífonos');

    const desactivada = await patchCategoryActive(categoria.id, false);
    expect(desactivada.status).toBe(200);
    expect(desactivada.body.data.active).toBe(false);

    const fila = await getTestPrisma().category.findUnique({ where: { id: categoria.id } });
    expect(fila).not.toBeNull();

    const reactivada = await patchCategoryActive(categoria.id, true);
    expect(reactivada.status).toBe(200);
    expect(reactivada.body.data.active).toBe(true);
  });

  it('responde 404 si la categoría no existe', async () => {
    const response = await patchCategoryActive(999, false);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('responde 403 a un cliente y 401 sin token', async () => {
    const categoria = await postCategory('Camas');

    const cliente = await request(app)
      .patch(`/api/categories/${categoria.id}/active`)
      .set(...bearer(customerToken))
      .send({ active: false });
    const sinToken = await request(app)
      .patch(`/api/categories/${categoria.id}/active`)
      .send({ active: false });

    expect(cliente.status).toBe(403);
    expect(sinToken.status).toBe(401);
  });
});

describe('POST /api/categories/:id/fields', () => {
  it('crea campos de los cuatro tipos', async () => {
    const categoria = await postCategory('Audífonos');

    const texto = await createField(categoria.id, {
      key: 'conectividad',
      label: 'Conexión',
      type: 'TEXT',
    });
    expect(texto).toEqual({
      id: expect.any(Number),
      categoryId: categoria.id,
      key: 'conectividad',
      label: 'Conexión',
      type: 'TEXT',
      required: false,
      options: null,
      unit: null,
      sortOrder: 0,
      active: true,
    });

    const numero = await createField(categoria.id, {
      key: 'bateria_horas',
      label: 'Batería',
      type: 'NUMBER',
      unit: 'horas',
      required: true,
      sortOrder: 2,
    });
    expect(numero).toMatchObject({
      type: 'NUMBER',
      unit: 'horas',
      required: true,
      sortOrder: 2,
    });

    const lista = await createField(categoria.id, {
      key: 'color_disponible',
      label: 'Color disponible',
      type: 'SELECT',
      options: ['Negro', 'Blanco'],
      sortOrder: 1,
    });
    expect(lista).toMatchObject({ type: 'SELECT', options: ['Negro', 'Blanco'] });

    const booleano = await createField(categoria.id, {
      key: 'resistente_al_agua',
      label: 'Resistente al agua',
      type: 'BOOLEAN',
    });
    expect(booleano).toMatchObject({ type: 'BOOLEAN', required: false, options: null, unit: null });
  });

  it('rechaza con 400 una lista con menos de dos opciones', async () => {
    const categoria = await postCategory('Audífonos');

    const response = await postField(categoria.id, {
      key: 'color_disponible',
      label: 'Color disponible',
      type: 'SELECT',
      options: ['Negro'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('al menos 2 opciones distintas');
  });

  it('rechaza con 400 opciones en un campo que no es lista', async () => {
    const categoria = await postCategory('Audífonos');

    const response = await postField(categoria.id, {
      key: 'conectividad',
      label: 'Conexión',
      type: 'TEXT',
      options: ['Bluetooth', 'Wired'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza con 400 una unidad en un campo que no es número', async () => {
    const categoria = await postCategory('Audífonos');

    const response = await postField(categoria.id, {
      key: 'conectividad',
      label: 'Conexión',
      type: 'TEXT',
      unit: 'metros',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('responde 409 con CONFLICT si la clave ya existe en la categoría', async () => {
    const categoria = await postCategory('Audífonos');
    await createField(categoria.id, { key: 'conectividad', label: 'Conexión', type: 'TEXT' });

    const response = await postField(categoria.id, {
      key: 'conectividad',
      label: 'Otra conexión',
      type: 'TEXT',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');

    const guardados = await getTestPrisma().categoryField.count({ where: { categoryId: categoria.id } });
    expect(guardados).toBe(1);
  });

  it('permite la misma clave en otra categoría', async () => {
    const audifonos = await postCategory('Audífonos');
    const camas = await postCategory('Camas');

    await createField(audifonos.id, { key: 'material', label: 'Material', type: 'TEXT' });
    const enCamas = await createField(camas.id, { key: 'material', label: 'Material', type: 'TEXT' });

    expect(enCamas.key).toBe('material');
    expect(enCamas.categoryId).toBe(camas.id);
  });

  it('responde 404 si la categoría no existe', async () => {
    const response = await postField(999, { key: 'conectividad', label: 'Conexión', type: 'TEXT' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('responde 403 a un cajero y a un cliente, y 401 sin token', async () => {
    const categoria = await postCategory('Audífonos');
    const cuerpo = { key: 'conectividad', label: 'Conexión', type: 'TEXT' };

    const cajero = await request(app)
      .post(`/api/categories/${categoria.id}/fields`)
      .set(...bearer(cashierToken))
      .send(cuerpo);
    const cliente = await request(app)
      .post(`/api/categories/${categoria.id}/fields`)
      .set(...bearer(customerToken))
      .send(cuerpo);
    const sinToken = await request(app).post(`/api/categories/${categoria.id}/fields`).send(cuerpo);

    expect(cajero.status).toBe(403);
    expect(cliente.status).toBe(403);
    expect(sinToken.status).toBe(401);
  });
});

describe('PUT /api/categories/:id/fields/:fieldId', () => {
  it('cambia label, required, options y sortOrder', async () => {
    const categoria = await postCategory('Audífonos');
    const campo = await createField(categoria.id, {
      key: 'color_disponible',
      label: 'Color',
      type: 'SELECT',
      options: ['Negro', 'Blanco'],
      sortOrder: 1,
    });

    const response = await request(app)
      .put(`/api/categories/${categoria.id}/fields/${campo.id}`)
      .set(...bearer(adminToken))
      .send({
        label: 'Color disponible en tienda',
        required: true,
        options: ['Negro', 'Blanco', 'Rojo'],
        sortOrder: 5,
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: campo.id,
      categoryId: categoria.id,
      key: 'color_disponible',
      label: 'Color disponible en tienda',
      type: 'SELECT',
      required: true,
      options: ['Negro', 'Blanco', 'Rojo'],
      unit: null,
      sortOrder: 5,
      active: true,
    });
  });

  it('cambia la unidad de un campo numérico', async () => {
    const categoria = await postCategory('Audífonos');
    const campo = await createField(categoria.id, {
      key: 'bateria_horas',
      label: 'Batería',
      type: 'NUMBER',
      unit: 'horas',
    });

    const response = await request(app)
      .put(`/api/categories/${categoria.id}/fields/${campo.id}`)
      .set(...bearer(adminToken))
      .send({ unit: 'minutos', required: true });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ unit: 'minutos', required: true, type: 'NUMBER' });
  });

  it('rechaza con 400 cambiar la clave', async () => {
    const categoria = await postCategory('Audífonos');
    const campo = await createField(categoria.id, { key: 'conectividad', label: 'Conexión', type: 'TEXT' });

    const response = await request(app)
      .put(`/api/categories/${categoria.id}/fields/${campo.id}`)
      .set(...bearer(adminToken))
      .send({ key: 'otra_clave' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');

    const fila = await getTestPrisma().categoryField.findUnique({ where: { id: campo.id } });
    expect(fila?.key).toBe('conectividad');
  });

  it('rechaza con 400 cambiar el tipo', async () => {
    const categoria = await postCategory('Audífonos');
    const campo = await createField(categoria.id, { key: 'conectividad', label: 'Conexión', type: 'TEXT' });

    const response = await request(app)
      .put(`/api/categories/${categoria.id}/fields/${campo.id}`)
      .set(...bearer(adminToken))
      .send({ type: 'NUMBER' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');

    const fila = await getTestPrisma().categoryField.findUnique({ where: { id: campo.id } });
    expect(fila?.type).toBe('TEXT');
  });

  it('rechaza con 400 dejar la lista con menos de dos opciones', async () => {
    const categoria = await postCategory('Audífonos');
    const campo = await createField(categoria.id, {
      key: 'color_disponible',
      label: 'Color',
      type: 'SELECT',
      options: ['Negro', 'Blanco'],
    });

    const response = await request(app)
      .put(`/api/categories/${categoria.id}/fields/${campo.id}`)
      .set(...bearer(adminToken))
      .send({ options: ['Negro'] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('responde 404 si el campo no existe en la categoría', async () => {
    const categoria = await postCategory('Audífonos');
    const otra = await postCategory('Camas');
    const campo = await createField(otra.id, { key: 'material', label: 'Material', type: 'TEXT' });

    const deOtraCategoria = await request(app)
      .put(`/api/categories/${categoria.id}/fields/${campo.id}`)
      .set(...bearer(adminToken))
      .send({ label: 'Otro material' });

    expect(deOtraCategoria.status).toBe(404);
    expect(deOtraCategoria.body.error.code).toBe('NOT_FOUND');

    const inexistente = await request(app)
      .put(`/api/categories/${categoria.id}/fields/999`)
      .set(...bearer(adminToken))
      .send({ label: 'Otro material' });

    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.code).toBe('NOT_FOUND');
  });

  it('responde 403 a un cajero y 401 sin token', async () => {
    const categoria = await postCategory('Audífonos');
    const campo = await createField(categoria.id, { key: 'conectividad', label: 'Conexión', type: 'TEXT' });

    const cajero = await request(app)
      .put(`/api/categories/${categoria.id}/fields/${campo.id}`)
      .set(...bearer(cashierToken))
      .send({ label: 'Otra conexión' });
    const sinToken = await request(app)
      .put(`/api/categories/${categoria.id}/fields/${campo.id}`)
      .send({ label: 'Otra conexión' });

    expect(cajero.status).toBe(403);
    expect(sinToken.status).toBe(401);
  });
});

describe('PATCH /api/categories/:id/fields/:fieldId/active', () => {
  it('desactiva y reactiva el campo sin borrarlo', async () => {
    const categoria = await postCategory('Audífonos');
    const campo = await createField(categoria.id, { key: 'conectividad', label: 'Conexión', type: 'TEXT' });

    const desactivado = await patchFieldActive(categoria.id, campo.id, false);
    expect(desactivado.status).toBe(200);
    expect(desactivado.body.data.active).toBe(false);

    const fila = await getTestPrisma().categoryField.findUnique({ where: { id: campo.id } });
    expect(fila).not.toBeNull();
    expect(fila?.active).toBe(false);

    const reactivado = await patchFieldActive(categoria.id, campo.id, true);
    expect(reactivado.status).toBe(200);
    expect(reactivado.body.data.active).toBe(true);
  });

  it('responde 404 si el campo no existe', async () => {
    const categoria = await postCategory('Audífonos');

    const response = await patchFieldActive(categoria.id, 999, false);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('responde 403 a un cliente y 401 sin token', async () => {
    const categoria = await postCategory('Audífonos');
    const campo = await createField(categoria.id, { key: 'conectividad', label: 'Conexión', type: 'TEXT' });

    const cliente = await request(app)
      .patch(`/api/categories/${categoria.id}/fields/${campo.id}/active`)
      .set(...bearer(customerToken))
      .send({ active: false });
    const sinToken = await request(app)
      .patch(`/api/categories/${categoria.id}/fields/${campo.id}/active`)
      .send({ active: false });

    expect(cliente.status).toBe(403);
    expect(sinToken.status).toBe(401);
  });
});

describe('categorías inactivas y campos inactivos en el listado', () => {
  it('el cliente y el cajero solo ven lo activo aunque pidan includeInactive', async () => {
    const activa = await postCategory('Audífonos');
    const inactiva = await postCategory('Camas');
    const campoActivo = await createField(activa.id, {
      key: 'conectividad',
      label: 'Conexión',
      type: 'TEXT',
    });
    const campoInactivo = await createField(activa.id, {
      key: 'resistente_al_agua',
      label: 'Resistente al agua',
      type: 'BOOLEAN',
    });

    await patchCategoryActive(inactiva.id, false);
    await patchFieldActive(activa.id, campoInactivo.id, false);

    for (const token of [customerToken, cashierToken]) {
      const response = await request(app)
        .get('/api/categories?includeInactive=true')
        .set(...bearer(token));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(activa.id);
      expect(
        (response.body.data[0] as CategoryResponse).fields.map((campo) => campo.id),
      ).toEqual([campoActivo.id]);
    }
  });

  it('el admin sin parámetro solo ve lo activo y con includeInactive ve todo', async () => {
    const activa = await postCategory('Audífonos');
    const inactiva = await postCategory('Camas');
    const campoActivo = await createField(activa.id, {
      key: 'conectividad',
      label: 'Conexión',
      type: 'TEXT',
      sortOrder: 2,
    });
    const campoInactivo = await createField(activa.id, {
      key: 'resistente_al_agua',
      label: 'Resistente al agua',
      type: 'BOOLEAN',
      sortOrder: 1,
    });

    await patchCategoryActive(inactiva.id, false);
    await patchFieldActive(activa.id, campoInactivo.id, false);

    const soloActivas = await request(app).get('/api/categories').set(...bearer(adminToken));

    expect(soloActivas.status).toBe(200);
    expect(soloActivas.body.data).toHaveLength(1);
    expect(
      (soloActivas.body.data[0] as CategoryResponse).fields.map((campo) => campo.id),
    ).toEqual([campoActivo.id]);

    const conInactivas = await request(app)
      .get('/api/categories?includeInactive=true')
      .set(...bearer(adminToken));

    expect(conInactivas.status).toBe(200);
    expect(conInactivas.body.data.map((categoria: CategoryResponse) => categoria.name)).toEqual([
      'Audífonos',
      'Camas',
    ]);

    const primera = conInactivas.body.data[0] as CategoryResponse;
    expect(primera.fields.map((campo) => campo.key)).toEqual([
      'resistente_al_agua',
      'conectividad',
    ]);
    expect(primera.fields.every((campo) => campo.active === true || campo.active === false)).toBe(true);
    expect(primera.fields[0]?.active).toBe(false);
  });

  it('rechaza con 400 un includeInactive que no sea booleano', async () => {
    const response = await request(app)
      .get('/api/categories?includeInactive=todo')
      .set(...bearer(adminToken));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});