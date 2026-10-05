import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { resolvePrices, type PricedProduct } from '../../src/domain/pricing.js';
import { signAuthToken, type AuthRole } from '../../src/infrastructure/jwt.js';
import { prisma } from '../../src/infrastructure/prisma.js';
import { findActive } from '../../src/modules/campaigns/repository.js';
import { cleanDatabase, getTestPrisma } from '../helpers/db.js';

type RoleToken = {
  userId: number;
  token: string;
};

type CampaignResponse = {
  id: number;
  name: string;
  scope: string;
  discountType: string;
  discountValue: number;
  priority: number;
  startsAt: string;
  endsAt: string;
  startDate: string;
  endDate: string;
  active: boolean;
  status: string;
  affectedProducts: number;
  productIds: number[];
  categoryIds: number[];
};

/**
 * Momento fijo de las pruebas: el último milisegundo del 2026-10-15 en Lima.
 * Desde ahí los dos bordes están a un milisegundo: el fin del 2026-10-15 y el inicio del 2026-10-16.
 */
const AHORA = new Date('2026-10-16T04:59:59.999Z');
const UN_MILISEGUNDO_DESPUES = new Date('2026-10-16T05:00:00.000Z');

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

async function createCategory(name: string): Promise<{ id: number }> {
  return getTestPrisma().category.create({ data: { name } });
}

let barcodeCounter = 0;

async function createProduct(
  categoryId: number,
  name: string,
  originalPriceCents: number,
  options: { active?: boolean } = {},
): Promise<{ id: number; categoryId: number; originalPriceCents: number; active: boolean }> {
  barcodeCounter += 1;

  return getTestPrisma().product.create({
    data: {
      barcode: `TEST${String(barcodeCounter).padStart(9, '0')}`,
      name,
      brand: 'Falabella',
      categoryId,
      originalPriceCents,
      stock: 10,
      active: options.active ?? true,
    },
  });
}

function campaignBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Semana de descuentos',
    scope: 'STORE',
    discountType: 'PERCENT',
    discountValue: 2000,
    startsAt: '2026-10-01',
    endsAt: '2026-10-31',
    ...overrides,
  };
}

let app: Express;
let adminToken: string;
let cashierToken: string;
let customerToken: string;
let audifonos: { id: number };
let camas: { id: number };
let audifonoA: { id: number; categoryId: number; originalPriceCents: number; active: boolean };
let audifonoB: { id: number; categoryId: number; originalPriceCents: number; active: boolean };
let audifonoInactivo: { id: number; categoryId: number; originalPriceCents: number; active: boolean };
let camaA: { id: number; categoryId: number; originalPriceCents: number; active: boolean };

async function postCampaign(body: Record<string, unknown>): Promise<CampaignResponse> {
  const response = await request(app)
    .post('/api/campaigns')
    .set(...bearer(adminToken))
    .send(body);

  expect(response.status).toBe(200);

  return response.body.data as CampaignResponse;
}

async function patchActive(id: number, active: boolean): Promise<request.Response> {
  return request(app).patch(`/api/campaigns/${id}/active`).set(...bearer(adminToken)).send({ active });
}

/** Los productos de prueba no tienen descuento CMR: solo importa lo que resuelve la campaña. */
function asPriced(product: { id: number; categoryId: number; originalPriceCents: number }): PricedProduct {
  return { ...product, hasCmrDiscount: false, cmrDiscountBps: 0 };
}

beforeEach(async () => {
  // La hora se controla para poder comprobar los bordes exactos de las fechas.
  // Los tokens se firman con la hora fija, así que no vencen al mover el reloj un milisegundo.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);

  await cleanDatabase();
  app = createApp();

  adminToken = (await createRoleToken('ADMIN')).token;
  cashierToken = (await createRoleToken('CASHIER')).token;
  customerToken = (await createRoleToken('CUSTOMER')).token;

  audifonos = await createCategory('Audífonos');
  camas = await createCategory('Camas');

  audifonoA = await createProduct(audifonos.id, 'Audífono A', 10000);
  audifonoB = await createProduct(audifonos.id, 'Audífono B', 20000);
  audifonoInactivo = await createProduct(audifonos.id, 'Audífono retirado', 30000, { active: false });
  camaA = await createProduct(camas.id, 'Cama A', 50000);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/campaigns', () => {
  it('crea una campaña para toda la tienda con descuento en porcentaje', async () => {
    const response = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ name: '  Semana   de  descuentos  ' }));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: expect.any(Number),
      name: 'Semana de descuentos',
      scope: 'STORE',
      discountType: 'PERCENT',
      discountValue: 2000,
      priority: 0,
      startsAt: '2026-10-01T05:00:00.000Z',
      endsAt: '2026-11-01T04:59:59.999Z',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      active: true,
      status: 'ACTIVE',
      affectedProducts: 3,
      productIds: [],
      categoryIds: [],
    });
  });

  it('crea una campaña con alcance de productos y guarda sus ids', async () => {
    const campana = await postCampaign(
      campaignBody({
        name: 'Oferta audífonos',
        scope: 'PRODUCTS',
        productIds: [audifonoB.id, audifonoA.id, audifonoA.id, audifonoInactivo.id],
        priority: 5,
      }),
    );

    expect(campana.scope).toBe('PRODUCTS');
    expect(campana.priority).toBe(5);
    // Los ids repetidos se guardan una vez y el producto inactivo no cuenta como afectado.
    expect(campana.productIds).toEqual([audifonoA.id, audifonoB.id, audifonoInactivo.id]);
    expect(campana.categoryIds).toEqual([]);
    expect(campana.affectedProducts).toBe(2);
  });

  it('crea una campaña con alcance de categorías y cuenta solo los productos activos', async () => {
    const campana = await postCampaign(
      campaignBody({
        name: 'Temporada de camas',
        scope: 'CATEGORIES',
        categoryIds: [camas.id],
        discountType: 'FIXED',
        discountValue: 1500,
      }),
    );

    expect(campana.scope).toBe('CATEGORIES');
    expect(campana.discountType).toBe('FIXED');
    expect(campana.discountValue).toBe(1500);
    expect(campana.categoryIds).toEqual([camas.id]);
    expect(campana.productIds).toEqual([]);
    expect(campana.affectedProducts).toBe(1);
  });

  it('guarda la regla del descuento sin convertirla y cuenta solo los productos activos', async () => {
    const campana = await postCampaign(
      campaignBody({ scope: 'CATEGORIES', categoryIds: [audifonos.id], discountValue: 2850 }),
    );

    expect(campana.discountValue).toBe(2850);

    const fila = await getTestPrisma().campaign.findUnique({ where: { id: campana.id } });

    expect(fila?.discountValue).toBe(2850);
    expect(fila?.discountType).toBe('PERCENT');
    // El producto inactivo de la categoría no cuenta.
    expect(campana.affectedProducts).toBe(2);
  });

  it('acepta una campaña creada como inactiva con prioridad 0', async () => {
    const campana = await postCampaign(campaignBody({ active: false }));

    expect(campana.active).toBe(false);
    expect(campana.status).toBe('INACTIVE');
  });

  it('guarda las fechas de Lima como el inicio y el último milisegundo de cada día', async () => {
    const campana = await postCampaign(campaignBody({ startsAt: '2026-01-01', endsAt: '2026-01-01' }));

    const fila = await getTestPrisma().campaign.findUnique({ where: { id: campana.id } });

    expect(fila?.startsAt.toISOString()).toBe('2026-01-01T05:00:00.000Z');
    expect(fila?.endsAt.toISOString()).toBe('2026-01-02T04:59:59.999Z');
    expect(campana.startDate).toBe('2026-01-01');
    expect(campana.endDate).toBe('2026-01-01');
  });

  it('rechaza con 400 un nombre vacío o de más de 100 caracteres', async () => {
    const vacio = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ name: '   ' }));
    const largo = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ name: 'a'.repeat(101) }));

    expect(vacio.status).toBe(400);
    expect(vacio.body.error.code).toBe('VALIDATION_ERROR');
    expect(vacio.body.error.message).toContain('no puede estar vacío');
    expect(largo.status).toBe(400);
    expect(largo.body.error.message).toContain('100');
  });

  it('rechaza con 400 un alcance o un tipo de descuento desconocidos', async () => {
    const alcance = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ scope: 'TODO' }));
    const tipo = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ discountType: 'HALF' }));

    expect(alcance.status).toBe(400);
    expect(alcance.body.error.message).toContain('PRODUCTS, CATEGORIES o STORE');
    expect(tipo.status).toBe(400);
    expect(tipo.body.error.message).toContain('PERCENT o FIXED');
  });

  it('rechaza con 400 un porcentaje que no llega al 1 ni pasa del 90 %', async () => {
    const cero = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ discountValue: 0 }));
    const demais = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ discountValue: 9001 }));
    const maximo = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ discountValue: 9000 }));

    expect(cero.status).toBe(400);
    expect(cero.body.error.code).toBe('VALIDATION_ERROR');
    expect(demais.status).toBe(400);
    expect(maximo.status).toBe(200);
  });

  it('rechaza con 400 un monto fijo que no es un entero mayor que cero', async () => {
    const cero = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ discountType: 'FIXED', discountValue: 0 }));
    const decimal = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ discountType: 'FIXED', discountValue: 1500.5 }));
    const texto = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ discountType: 'FIXED', discountValue: '1500' }));

    expect(cero.status).toBe(400);
    expect(cero.body.error.message).toContain('mayor que cero');
    expect(decimal.status).toBe(400);
    expect(decimal.body.error.message).toContain('entero');
    expect(texto.status).toBe(400);
  });

  it('rechaza con 400 una prioridad que no es un entero', async () => {
    const response = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ priority: 1.5 }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza con 400 fechas que no vienen en AAAA-MM-DD o que no existen', async () => {
    const formato = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ startsAt: '01-10-2026' }));
    const inexistente = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ endsAt: '2026-02-30' }));

    expect(formato.status).toBe(400);
    expect(formato.body.error.code).toBe('VALIDATION_ERROR');
    expect(formato.body.error.message).toContain('AAAA-MM-DD');
    expect(inexistente.status).toBe(400);
    expect(inexistente.body.error.message).toContain('no existe');
  });

  it('rechaza con 400 una fecha final anterior a la inicial', async () => {
    const response = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ startsAt: '2026-10-10', endsAt: '2026-10-09' }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('no puede ser anterior');
  });

  it('rechaza con 400 un alcance que no lleva los destinos que necesita', async () => {
    const sinProductos = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ scope: 'PRODUCTS' }));
    const sinCategorias = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ scope: 'CATEGORIES' }));
    const listaVacia = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ scope: 'PRODUCTS', productIds: [] }));
    const tiendaConIds = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ scope: 'STORE', productIds: [audifonoA.id] }));
    const categoriasConProductos = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ scope: 'CATEGORIES', categoryIds: [camas.id], productIds: [audifonoA.id] }));

    expect(sinProductos.status).toBe(400);
    expect(sinProductos.body.error.message).toContain('al menos un producto');
    expect(sinCategorias.status).toBe(400);
    expect(sinCategorias.body.error.message).toContain('al menos una categoría');
    expect(listaVacia.status).toBe(400);
    expect(tiendaConIds.status).toBe(400);
    expect(tiendaConIds.body.error.message).toContain('toda la tienda');
    expect(categoriasConProductos.status).toBe(400);
  });

  it('rechaza con 400 un producto o una categoría que no existe, sin guardar nada', async () => {
    const productoInexistente = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ scope: 'PRODUCTS', productIds: [audifonoA.id, 987654] }));
    const categoriaInexistente = await request(app)
      .post('/api/campaigns')
      .set(...bearer(adminToken))
      .send(campaignBody({ scope: 'CATEGORIES', categoryIds: [987654] }));

    expect(productoInexistente.status).toBe(400);
    expect(productoInexistente.body.error.code).toBe('VALIDATION_ERROR');
    expect(productoInexistente.body.error.message).toContain('productos no existen');
    expect(categoriaInexistente.status).toBe(400);
    expect(categoriaInexistente.body.error.message).toContain('categorías no existen');

    const guardadas = await getTestPrisma().campaign.count();
    expect(guardadas).toBe(0);
  });

  it('responde 403 a un cajero y a un cliente, y 401 sin token', async () => {
    const cuerpo = campaignBody();

    const cajero = await request(app).post('/api/campaigns').set(...bearer(cashierToken)).send(cuerpo);
    const cliente = await request(app).post('/api/campaigns').set(...bearer(customerToken)).send(cuerpo);
    const sinToken = await request(app).post('/api/campaigns').send(cuerpo);

    expect(cajero.status).toBe(403);
    expect(cajero.body.error.code).toBe('FORBIDDEN');
    expect(cliente.status).toBe(403);
    expect(cliente.body.error.code).toBe('FORBIDDEN');
    expect(sinToken.status).toBe(401);
    expect(sinToken.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('PUT /api/campaigns/:id', () => {
  it('cambia la regla, las fechas y el alcance', async () => {
    const campana = await postCampaign(
      campaignBody({ scope: 'PRODUCTS', productIds: [audifonoA.id], discountType: 'FIXED', discountValue: 500 }),
    );

    const response = await request(app)
      .put(`/api/campaigns/${campana.id}`)
      .set(...bearer(adminToken))
      .send(
        campaignBody({
          name: '  Camas   y  mesas  ',
          scope: 'CATEGORIES',
          categoryIds: [camas.id],
          discountValue: 3000,
          priority: 8,
          startsAt: '2026-11-01',
          endsAt: '2026-11-30',
        }),
      );

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: campana.id,
      name: 'Camas y mesas',
      scope: 'CATEGORIES',
      discountType: 'PERCENT',
      discountValue: 3000,
      priority: 8,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      status: 'SCHEDULED',
      categoryIds: [camas.id],
      productIds: [],
      affectedProducts: 1,
    });

    const campanaRow = await getTestPrisma().campaign.findUnique({
      where: { id: campana.id },
      include: { products: true, categories: true },
    });

    expect(campanaRow?.products).toHaveLength(0);
    expect(campanaRow?.categories.map((fila) => fila.categoryId)).toEqual([camas.id]);
  });

  it('rechaza con 400 un destino que no existe al editar', async () => {
    const campana = await postCampaign(campaignBody());

    const response = await request(app)
      .put(`/api/campaigns/${campana.id}`)
      .set(...bearer(adminToken))
      .send(campaignBody({ scope: 'CATEGORIES', categoryIds: [987654] }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('responde 404 si la campaña no existe', async () => {
    const response = await request(app)
      .put('/api/campaigns/999')
      .set(...bearer(adminToken))
      .send(campaignBody());

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('responde 403 a un cajero y 401 sin token', async () => {
    const campana = await postCampaign(campaignBody());

    const cajero = await request(app)
      .put(`/api/campaigns/${campana.id}`)
      .set(...bearer(cashierToken))
      .send(campaignBody());
    const sinToken = await request(app).put(`/api/campaigns/${campana.id}`).send(campaignBody());

    expect(cajero.status).toBe(403);
    expect(sinToken.status).toBe(401);
  });
});

describe('PATCH /api/campaigns/:id/active', () => {
  it('desactiva y reactiva la campaña sin borrarla', async () => {
    const campana = await postCampaign(campaignBody());

    const desactivada = await patchActive(campana.id, false);
    expect(desactivada.status).toBe(200);
    expect(desactivada.body.data.active).toBe(false);
    expect(desactivada.body.data.status).toBe('INACTIVE');

    const fila = await getTestPrisma().campaign.findUnique({ where: { id: campana.id } });
    expect(fila).not.toBeNull();
    expect(fila?.active).toBe(false);

    const reactivada = await patchActive(campana.id, true);
    expect(reactivada.status).toBe(200);
    expect(reactivada.body.data.status).toBe('ACTIVE');
  });

  it('rechaza con 400 un active que no es booleano', async () => {
    const campana = await postCampaign(campaignBody());

    const response = await request(app)
      .patch(`/api/campaigns/${campana.id}/active`)
      .set(...bearer(adminToken))
      .send({ active: 'no' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('responde 404 si la campaña no existe', async () => {
    const response = await patchActive(999, false);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('responde 403 a un cliente y 401 sin token', async () => {
    const campana = await postCampaign(campaignBody());

    const cliente = await request(app)
      .patch(`/api/campaigns/${campana.id}/active`)
      .set(...bearer(customerToken))
      .send({ active: false });
    const sinToken = await request(app)
      .patch(`/api/campaigns/${campana.id}/active`)
      .send({ active: false });

    expect(cliente.status).toBe(403);
    expect(sinToken.status).toBe(401);
  });
});

describe('estado de la campaña en los bordes de sus fechas', () => {
  async function statusOf(id: number): Promise<string> {
    const response = await request(app).get(`/api/campaigns/${id}`).set(...bearer(adminToken));

    expect(response.status).toBe(200);

    return (response.body.data as CampaignResponse).status;
  }

  it('es SCHEDULED un milisegundo antes de empezar y ACTIVE en el instante inicial', async () => {
    const campana = await postCampaign(campaignBody({ startsAt: '2026-10-16', endsAt: '2026-10-16' }));

    expect(await statusOf(campana.id)).toBe('SCHEDULED');

    vi.setSystemTime(UN_MILISEGUNDO_DESPUES);
    expect(await statusOf(campana.id)).toBe('ACTIVE');
  });

  it('es ACTIVE en el último milisegundo del día final y EXPIRED al siguiente', async () => {
    const campana = await postCampaign(campaignBody({ startsAt: '2026-10-15', endsAt: '2026-10-15' }));

    expect(await statusOf(campana.id)).toBe('ACTIVE');

    vi.setSystemTime(UN_MILISEGUNDO_DESPUES);
    expect(await statusOf(campana.id)).toBe('EXPIRED');
  });

  it('es INACTIVE con las fechas dentro del período si el interruptor está apagado', async () => {
    const campana = await postCampaign(campaignBody({ startsAt: '2026-10-15', endsAt: '2026-10-15' }));

    await patchActive(campana.id, false);

    expect(await statusOf(campana.id)).toBe('INACTIVE');
  });

  it('distingue programada y vencida en el listado', async () => {
    await postCampaign(campaignBody({ name: 'Programada', startsAt: '2026-10-20', endsAt: '2026-10-31' }));
    await postCampaign(campaignBody({ name: 'Vigente', startsAt: '2026-10-10', endsAt: '2026-10-20' }));
    await postCampaign(campaignBody({ name: 'Vencida', startsAt: '2026-10-01', endsAt: '2026-10-05' }));

    const response = await request(app).get('/api/campaigns').set(...bearer(adminToken));

    expect(response.status).toBe(200);

    const porNombre = new Map(
      (response.body.data as CampaignResponse[]).map((campana) => [campana.name, campana.status]),
    );

    expect(porNombre.get('Programada')).toBe('SCHEDULED');
    expect(porNombre.get('Vigente')).toBe('ACTIVE');
    expect(porNombre.get('Vencida')).toBe('EXPIRED');
  });
});

describe('GET /api/campaigns y GET /api/campaigns/:id', () => {
  it('lista las campañas de mayor a menor prioridad con su alcance y sus destinos', async () => {
    await postCampaign(campaignBody({ name: 'Sin prioridad', priority: 0, scope: 'STORE' }));
    await postCampaign(
      campaignBody({ name: 'Alta', priority: 10, scope: 'PRODUCTS', productIds: [audifonoB.id] }),
    );
    await postCampaign(
      campaignBody({ name: 'Media', priority: 5, scope: 'CATEGORIES', categoryIds: [camas.id] }),
    );

    const response = await request(app).get('/api/campaigns').set(...bearer(adminToken));

    expect(response.status).toBe(200);
    expect((response.body.data as CampaignResponse[]).map((campana) => campana.name)).toEqual([
      'Alta',
      'Media',
      'Sin prioridad',
    ]);

    const [alta, media, sinPrioridad] = response.body.data as CampaignResponse[];

    expect(alta?.productIds).toEqual([audifonoB.id]);
    expect(alta?.affectedProducts).toBe(1);
    expect(media?.categoryIds).toEqual([camas.id]);
    expect(media?.affectedProducts).toBe(1);
    expect(sinPrioridad?.scope).toBe('STORE');
    expect(sinPrioridad?.affectedProducts).toBe(3);
  });

  it('devuelve una sola campaña con su estado', async () => {
    const campana = await postCampaign(campaignBody({ name: 'Solo una' }));

    const response = await request(app).get(`/api/campaigns/${campana.id}`).set(...bearer(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: campana.id, name: 'Solo una', status: 'ACTIVE' });
  });

  it('responde 404 si la campaña no existe', async () => {
    const listado = await request(app).get('/api/campaigns/999').set(...bearer(adminToken));

    expect(listado.status).toBe(404);
    expect(listado.body.error.code).toBe('NOT_FOUND');
  });

  it('responde 403 a un cajero y a un cliente, y 401 sin token', async () => {
    const campana = await postCampaign(campaignBody());

    const listadoCajero = await request(app).get('/api/campaigns').set(...bearer(cashierToken));
    const detalleCliente = await request(app)
      .get(`/api/campaigns/${campana.id}`)
      .set(...bearer(customerToken));
    const sinToken = await request(app).get('/api/campaigns');

    expect(listadoCajero.status).toBe(403);
    expect(listadoCajero.body.error.code).toBe('FORBIDDEN');
    expect(detalleCliente.status).toBe(403);
    expect(detalleCliente.body.error.code).toBe('FORBIDDEN');
    expect(sinToken.status).toBe(401);
    expect(sinToken.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('findActive: las campañas que alimentan a resolvePrices', () => {
  it('devuelve solo las activas y en fecha, con sus destinos', async () => {
    const vigente = await postCampaign(
      campaignBody({
        name: 'Vigente',
        scope: 'PRODUCTS',
        productIds: [audifonoA.id],
        startsAt: '2026-10-10',
        endsAt: '2026-10-20',
      }),
    );
    const inactiva = await postCampaign(
      campaignBody({ name: 'Inactiva', scope: 'CATEGORIES', categoryIds: [camas.id] }),
    );
    const futura = await postCampaign(
      campaignBody({
        name: 'Futura',
        scope: 'CATEGORIES',
        categoryIds: [camas.id],
        startsAt: '2026-11-01',
        endsAt: '2026-11-30',
      }),
    );
    const vencida = await postCampaign(
      campaignBody({
        name: 'Vencida',
        scope: 'STORE',
        startsAt: '2026-09-01',
        endsAt: '2026-09-30',
      }),
    );

    await patchActive(inactiva.id, false);

    const campanas = await findActive(AHORA);
    const ids = campanas.map((campana) => campana.id);

    expect(ids).toEqual([vigente.id]);
    expect(ids).not.toContain(inactiva.id);
    expect(ids).not.toContain(futura.id);
    expect(ids).not.toContain(vencida.id);

    expect(campanas[0]?.productIds).toEqual([audifonoA.id]);
    expect(campanas[0]?.categoryIds).toEqual([]);
  });

  it('devuelve lo justo que resolvePrices necesita para descontar', async () => {
    await postCampaign(
      campaignBody({
        name: 'Audífonos 20 %',
        scope: 'CATEGORIES',
        categoryIds: [audifonos.id],
        discountValue: 2000,
        startsAt: '2026-10-10',
        endsAt: '2026-10-20',
      }),
    );

    const campanas = await findActive(AHORA);
    const precios = resolvePrices(asPriced(audifonoA), campanas, AHORA);

    expect(precios.normalCents).toBe(8000);
    expect(precios.campaignName).toBe('Audífonos 20 %');

    const deOtraCategoria = resolvePrices(asPriced(camaA), campanas, AHORA);

    expect(deOtraCategoria.normalCents).toBe(camaA.originalPriceCents);
    expect(deOtraCategoria.campaignId).toBeNull();
  });

  it('con la misma prioridad gana la que más ahorra y, si empatan del todo, la más reciente', async () => {
    await postCampaign(
      campaignBody({
        name: 'Menos ahorro',
        scope: 'PRODUCTS',
        productIds: [audifonoA.id],
        discountValue: 1000,
      }),
    );
    await postCampaign(
      campaignBody({
        name: 'Más ahorro',
        scope: 'PRODUCTS',
        productIds: [audifonoA.id],
        discountValue: 3000,
      }),
    );
    const empateAntiguo = await postCampaign(
      campaignBody({
        name: 'Empate antiguo',
        scope: 'CATEGORIES',
        categoryIds: [camas.id],
        discountValue: 2000,
      }),
    );
    const empateNuevo = await postCampaign(
      campaignBody({
        name: 'Empate nuevo',
        scope: 'CATEGORIES',
        categoryIds: [camas.id],
        discountValue: 2000,
      }),
    );

    expect(empateNuevo.id).toBeGreaterThan(empateAntiguo.id);

    const campanas = await findActive(AHORA);

    const conMasAhorro = resolvePrices(asPriced(audifonoA), campanas, AHORA);

    expect(conMasAhorro.campaignName).toBe('Más ahorro');
    expect(conMasAhorro.normalCents).toBe(7000);

    const conEmpateTotal = resolvePrices(asPriced(camaA), campanas, AHORA);

    expect(conEmpateTotal.campaignName).toBe('Empate nuevo');
    expect(conEmpateTotal.normalCents).toBe(40000);
  });

  it('devuelve la campaña de productos y la de categorías con sus listas de ids', async () => {
    await postCampaign(
      campaignBody({
        name: 'Por productos',
        scope: 'PRODUCTS',
        productIds: [audifonoA.id, camaA.id],
        discountValue: 1000,
      }),
    );
    await postCampaign(
      campaignBody({
        name: 'Por categorías',
        scope: 'CATEGORIES',
        categoryIds: [audifonos.id, camas.id],
        discountType: 'FIXED',
        discountValue: 500,
      }),
    );

    const campanas = await findActive(AHORA);

    expect(campanas).toHaveLength(2);

    const porProductos = campanas.find((campana) => campana.name === 'Por productos');
    const porCategorias = campanas.find((campana) => campana.name === 'Por categorías');

    expect(porProductos?.productIds).toEqual([audifonoA.id, camaA.id]);
    expect(porProductos?.categoryIds).toEqual([]);
    expect(porCategorias?.categoryIds).toEqual([audifonos.id, camas.id]);
    expect(porCategorias?.productIds).toEqual([]);
  });
});
