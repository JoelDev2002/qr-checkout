import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { isValidEan13 } from '../src/domain/barcode.js';
import { resolvePrices, type PricedProduct } from '../src/domain/pricing.js';
import { findActive } from '../src/modules/campaigns/repository.js';
import { loadCatalog, SeedCatalogError } from '../src/seed/catalog.js';
import { readSeedData } from '../src/seed/files.js';
import type { SeedCatalogInput } from '../src/seed/schemas.js';
import { cleanDatabase, getTestPrisma } from './helpers/db.js';
import { prisma } from '../src/infrastructure/prisma.js';

const DIRECTORIO = fileURLToPath(new URL('../prisma/seed-data/', import.meta.url));
/** Momento dentro de las fechas de las campañas de ejemplo (2026-01-01 a 2027-12-31). */
const AHORA = new Date('2026-06-15T15:00:00.000Z');

const APPLE_PENCIL_BARCODE = '2000000000138';
const REDMI_BUDS_BARCODE = '2000000000060';

type ArchivoProductos = Array<Record<string, unknown>>;

function datos(): SeedCatalogInput {
  return readSeedData(DIRECTORIO);
}

function productos(): ArchivoProductos {
  return datos().products as ArchivoProductos;
}

function conProductos(productos: ArchivoProductos): SeedCatalogInput {
  return { ...datos(), products: productos };
}

/** Copia de un producto del archivo, para probarlo con un dato inválido. */
function productoModificado(barcode: string, cambios: Record<string, unknown>): ArchivoProductos {
  return productos().map((producto) =>
    producto.barcode === barcode ? { ...producto, ...cambios } : producto,
  );
}

async function pricedProduct(barcode: string): Promise<PricedProduct> {
  const producto = await getTestPrisma().product.findUniqueOrThrow({ where: { barcode } });

  return {
    id: producto.id,
    categoryId: producto.categoryId,
    originalPriceCents: producto.originalPriceCents,
    hasCmrDiscount: producto.hasCmrDiscount,
    cmrDiscountBps: producto.cmrDiscountBps,
  };
}

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('archivos de ejemplo', () => {
  it('tiene cinco categorías con campos de los cuatro tipos', () => {
    const categorias = datos().categories as Array<{
      name: string;
      fields: Array<{ key: string; type: string; unit?: string; options?: string[] }>;
    }>;

    expect(categorias.map((categoria) => categoria.name)).toEqual([
      'Dormitorio',
      'Audífonos',
      'Accesorios',
      'Electrohogar',
      'Tecnología',
    ]);

    const tipos = new Set(categorias.flatMap((categoria) => categoria.fields.map((campo) => campo.type)));

    expect([...tipos].sort()).toEqual(['BOOLEAN', 'NUMBER', 'SELECT', 'TEXT']);

    const dormitorio = categorias.find((categoria) => categoria.name === 'Dormitorio');
    const medida = dormitorio?.fields.find((campo) => campo.key === 'size');

    expect(medida?.type).toBe('SELECT');
    expect(medida?.options).toEqual(['1.5 plazas', '2 plazas', 'Queen', 'King']);

    const audifonos = categorias.find((categoria) => categoria.name === 'Audífonos');
    const bateria = audifonos?.fields.find((campo) => campo.key === 'battery_hours');

    expect(bateria?.type).toBe('NUMBER');
    expect(bateria?.unit).toBe('horas');
  });

  it('tiene cuatro campañas con su alcance, su descuento y su prioridad', () => {
    const campañas = datos().campaigns as Array<Record<string, unknown>>;

    expect(campañas).toHaveLength(4);
    expect(campañas.map((campaña) => campaña.name)).toEqual([
      'Cyber Dormitorio',
      'Audífonos −S/ 50',
      'Apple Pencil',
      'Toda la tienda 5%',
    ]);
    expect(campañas.every((campaña) => campaña.startsAt === '2026-01-01')).toBe(true);
    expect(campañas.every((campaña) => campaña.endsAt === '2027-12-31')).toBe(true);
    expect(campañas.map((campaña) => campaña.discountPercent ?? campaña.discountAmount)).toEqual([
      44,
      50,
      28.5,
      5,
    ]);
    expect(campañas.map((campaña) => campaña.priority)).toEqual([3, 5, 10, 1]);
    expect(campañas[2]?.targetBarcodes).toEqual([APPLE_PENCIL_BARCODE]);
  });

  it('tiene 24 productos repartidos en las cinco categorías, con EAN-13 válidos y sin repetir', () => {
    const catalogo = productos();
    const barcodes = catalogo.map((producto) => String(producto.barcode));

    expect(catalogo).toHaveLength(24);
    expect(new Set(barcodes).size).toBe(24);
    expect(barcodes.filter((barcode) => !isValidEan13(barcode))).toEqual([]);
    expect(barcodes.every((barcode) => barcode.startsWith('200'))).toBe(true);

    // Secuenciales: 2000000000015, 2000000000022, 2000000000039...
    const cuerpos = barcodes.map((barcode) => barcode.slice(0, 12));
    const esperados = Array.from({ length: 24 }, (_, indice) => `2000000000${String(indice + 1).padStart(2, '0')}`);

    expect(cuerpos).toEqual(esperados);

    const porCategoria = new Map<string, number>();

    for (const producto of catalogo) {
      const categoria = String(producto.category);
      porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + 1);
    }

    expect([...porCategoria.entries()].sort()).toEqual([
      ['Accesorios', 5],
      ['Audífonos', 5],
      ['Dormitorio', 5],
      ['Electrohogar', 5],
      ['Tecnología', 4],
    ]);
  });

  it('incluye los seis productos de ARCHITECTURE.md §10 con sus precios y su CMR', () => {
    const porNombre = new Map(productos().map((producto) => [String(producto.name), producto]));

    expect(porNombre.get('Dormitorio Royal Prince Firme Queen + 2 Almohadas')).toMatchObject({
      originalPrice: 3379,
      hasCmrDiscount: true,
      cmrDiscountPercent: 2.6,
    });
    expect(porNombre.get('Dormitorio Royal Prince Firme King')).toMatchObject({
      originalPrice: 4139,
      cmrDiscountPercent: 4.3,
    });
    expect(porNombre.get('Dormitorio Europeo Tempo Issey Queen')).toMatchObject({
      originalPrice: 4249,
      cmrDiscountPercent: 2,
    });
    expect(porNombre.get('Audífonos Xiaomi Redmi Buds 6 Play')).toMatchObject({
      originalPrice: 89.9,
      cmrDiscountPercent: 5,
    });
    expect(porNombre.get('Apple Pencil USB-C')).toMatchObject({
      originalPrice: 600,
      cmrDiscountPercent: 32.6,
    });
    expect(porNombre.get('Cable USB-C 1 m')).toMatchObject({ originalPrice: 29.9 });
    expect(porNombre.get('Cable USB-C 1 m')?.hasCmrDiscount).toBeUndefined();
  });

  it('trae los valores de todos los campos de su categoría y avisos de stock', () => {
    const categorias = datos().categories as Array<{
      name: string;
      fields: Array<{ key: string; required?: boolean }>;
    }>;
    const clavesPorCategoria = new Map(
      categorias.map((categoria) => [
        categoria.name,
        categoria.fields.filter((campo) => campo.required).map((campo) => campo.key),
      ]),
    );
    const incompletos = productos().filter((producto) => {
      const atributos = (producto.attributes ?? {}) as Record<string, unknown>;
      const claves = clavesPorCategoria.get(String(producto.category)) ?? [];

      return claves.some((clave) => atributos[clave] === undefined);
    });

    expect(incompletos).toEqual([]);

    const stocks = productos().map((producto) => Number(producto.stock));

    expect(Math.min(...stocks)).toBe(0);
    expect(stocks.filter((stock) => stock === 2)).toHaveLength(1);
    expect(Math.max(...stocks)).toBeLessThanOrEqual(40);
  });
});

describe('loadCatalog', () => {
  it('crea las categorías con sus campos, las campañas y los 24 productos', async () => {
    const resumen = await loadCatalog(getTestPrisma(), datos());

    expect(resumen).toEqual({
      categoriesCreated: 5,
      fieldsCreated: 18,
      campaignsCreated: 4,
      campaignsUpdated: 0,
      productsCreated: 24,
      productsSkipped: 0,
    });

    const cliente = getTestPrisma();
    const categorias = await cliente.category.findMany({
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    const dormitorio = categorias.find((categoria) => categoria.name === 'Dormitorio');

    expect(categorias.map((categoria) => categoria.name)).toEqual([
      'Accesorios',
      'Audífonos',
      'Dormitorio',
      'Electrohogar',
      'Tecnología',
    ]);
    expect(dormitorio?.fields.map((campo) => [campo.key, campo.type, campo.options])).toEqual([
      ['size', 'SELECT', ['1.5 plazas', '2 plazas', 'Queen', 'King']],
      ['material', 'TEXT', null],
      ['includes_pillows', 'BOOLEAN', null],
    ]);

    const campanas = await cliente.campaign.findMany({ orderBy: { priority: 'desc' }, include: { products: true, categories: true } });
    const cyberDormitorio = campanas.find((campana) => campana.name === 'Cyber Dormitorio');
    const applePencil = campanas.find((campana) => campana.name === 'Apple Pencil');
    const tienda = campanas.find((campana) => campana.name === 'Toda la tienda 5%');
    const applePencilProducto = await cliente.product.findUniqueOrThrow({ where: { barcode: APPLE_PENCIL_BARCODE } });

    expect(campanas.map((campana) => [campana.name, campana.scope, campana.discountType, campana.discountValue])).toEqual([
      ['Apple Pencil', 'PRODUCTS', 'PERCENT', 2850],
      ['Audífonos −S/ 50', 'CATEGORIES', 'FIXED', 5000],
      ['Cyber Dormitorio', 'CATEGORIES', 'PERCENT', 4400],
      ['Toda la tienda 5%', 'STORE', 'PERCENT', 500],
    ]);
    expect(cyberDormitorio?.startsAt.toISOString()).toBe('2026-01-01T05:00:00.000Z');
    expect(cyberDormitorio?.endsAt.toISOString()).toBe('2028-01-01T04:59:59.999Z');
    expect(cyberDormitorio?.categories.map((fila) => fila.categoryId)).toEqual([dormitorio?.id]);
    expect(applePencil?.products.map((fila) => fila.productId)).toEqual([applePencilProducto.id]);
    expect(tienda?.products).toEqual([]);
    expect(tienda?.categories).toEqual([]);

    const pencil = await cliente.product.findUniqueOrThrow({ where: { barcode: APPLE_PENCIL_BARCODE } });

    expect(pencil).toMatchObject({
      name: 'Apple Pencil USB-C',
      brand: 'Apple',
      originalPriceCents: 60000,
      hasCmrDiscount: true,
      cmrDiscountBps: 3260,
      stock: 7,
      maxPerPurchase: 3,
      active: true,
    });
    expect(pencil.attributes).toEqual({
      compatibility: 'iPad',
      length_cm: 17.5,
      material: 'Aluminio',
      includes_case: false,
    });
  });

  it('convierte los soles y los porcentajes del archivo a céntimos y puntos básicos', async () => {
    await loadCatalog(getTestPrisma(), datos());

    const cliente = getTestPrisma();
    const redmi = await cliente.product.findUniqueOrThrow({ where: { barcode: REDMI_BUDS_BARCODE } });
    const cable = await cliente.product.findFirstOrThrow({ where: { name: 'Cable USB-C 1 m' } });
    const sinStock = await cliente.product.findFirstOrThrow({
      where: { name: 'Tablet Samsung Galaxy Tab A9+' },
    });

    expect(redmi.originalPriceCents).toBe(8990);
    expect(redmi.cmrDiscountBps).toBe(500);
    expect(redmi.attributes).toEqual({ connectivity: 'Bluetooth 5.3', battery_hours: 36, with_microphone: true });
    expect(redmi.stock).toBe(2);

    expect(cable.originalPriceCents).toBe(2990);
    expect(cable.hasCmrDiscount).toBe(false);
    expect(cable.cmrDiscountBps).toBe(0);
    expect(sinStock.stock).toBe(0);
  });

  it('no duplica nada al ejecutarlo otra vez y no toca el stock de los productos que ya existen', async () => {
    const cliente = getTestPrisma();
    await loadCatalog(cliente, datos());

    const pencil = await cliente.product.findUniqueOrThrow({ where: { barcode: APPLE_PENCIL_BARCODE } });
    const campo = await cliente.categoryField.findFirstOrThrow({ where: { key: 'includes_pillows' } });

    await cliente.product.update({ where: { id: pencil.id }, data: { stock: 1 } });
    await cliente.categoryField.update({ where: { id: campo.id }, data: { active: false } });

    const segunda = await loadCatalog(cliente, datos());

    expect(segunda).toEqual({
      categoriesCreated: 0,
      fieldsCreated: 0,
      campaignsCreated: 0,
      campaignsUpdated: 4,
      productsCreated: 0,
      productsSkipped: 24,
    });

    expect(await cliente.category.count()).toBe(5);
    expect(await cliente.categoryField.count()).toBe(18);
    expect(await cliente.campaign.count()).toBe(4);
    expect(await cliente.campaignCategory.count()).toBe(2);
    expect(await cliente.campaignProduct.count()).toBe(1);
    expect(await cliente.product.count()).toBe(24);

    const despues = await cliente.product.findUniqueOrThrow({ where: { barcode: APPLE_PENCIL_BARCODE } });

    expect(despues.stock).toBe(1);

    const campoDespues = await cliente.categoryField.findUniqueOrThrow({ where: { id: campo.id } });

    expect(campoDespues.active).toBe(false);
  });

  it('falla diciendo qué producto es y por qué cuando un código no es un EAN-13 válido', async () => {
    const cliente = getTestPrisma();
    const invalido = productoModificado(REDMI_BUDS_BARCODE, { barcode: '2000000000061' });

    const error = await loadCatalog(cliente, conProductos(invalido)).catch((fallo: unknown) => fallo);

    expect(error).toBeInstanceOf(SeedCatalogError);
    expect((error as Error).message).toContain(
      'Producto "Audífonos Xiaomi Redmi Buds 6 Play" (2000000000061)',
    );
    expect((error as Error).message).toContain('no es un EAN-13 válido');
    expect(await cliente.product.count()).toBe(0);
  });

  it('falla diciendo el campo que no corresponde cuando un valor no está en la lista', async () => {
    const cliente = getTestPrisma();
    const invalido = productoModificado('2000000000015', { attributes: { size: 'Matrimonial' } });

    const error = await loadCatalog(cliente, conProductos(invalido)).catch((fallo: unknown) => fallo);

    expect(error).toBeInstanceOf(SeedCatalogError);
    expect((error as Error).message).toContain(
      'Producto "Dormitorio Royal Prince Firme Queen + 2 Almohadas" (2000000000015)',
    );
    expect((error as Error).message).toContain('Medida: Debe ser una de las opciones');
    expect(await cliente.category.count()).toBe(0);
  });

  it('falla con el nombre y el motivo cuando falta un campo obligatorio', async () => {
    const cliente = getTestPrisma();
    const invalido = productoModificado(REDMI_BUDS_BARCODE, { attributes: { battery_hours: 36 } });

    const error = await loadCatalog(cliente, conProductos(invalido)).catch((fallo: unknown) => fallo);

    expect((error as Error).message).toContain('Audífonos Xiaomi Redmi Buds 6 Play');
    expect((error as Error).message).toContain('Conectividad es obligatorio');
  });

  it('falla con el nombre y el motivo cuando el porcentaje CMR pasa de 90', async () => {
    const cliente = getTestPrisma();
    const invalido = productoModificado(APPLE_PENCIL_BARCODE, { cmrDiscountPercent: 95 });

    const error = await loadCatalog(cliente, conProductos(invalido)).catch((fallo: unknown) => fallo);

    expect((error as Error).message).toContain('Producto "Apple Pencil USB-C"');
    expect((error as Error).message).toContain('90');
  });

  it('falla con el nombre y el motivo cuando una campaña apunta a un producto que no está', async () => {
    const cliente = getTestPrisma();
    const data = datos();

    const error = await loadCatalog(cliente, {
      ...data,
      campaigns: [
        ...(data.campaigns as Array<Record<string, unknown>>),
        {
          name: 'Promoción inexistente',
          scope: 'PRODUCTS',
          targetBarcodes: ['2000000000999'],
          discountType: 'PERCENT',
          discountPercent: 10,
          startsAt: '2026-01-01',
          endsAt: '2027-12-31',
        },
      ],
    }).catch((fallo: unknown) => fallo);

    expect((error as Error).message).toContain('Campaña "Promoción inexistente"');
    expect((error as Error).message).toContain('2000000000999');
  });
});

describe('precios del catálogo de ejemplo', () => {
  it('el Apple Pencil toma la campaña de su producto: oferta 42900 y CMR 28915', async () => {
    await loadCatalog(getTestPrisma(), datos());

    const precios = resolvePrices(await pricedProduct(APPLE_PENCIL_BARCODE), await findActive(AHORA), AHORA);

    expect(precios.originalCents).toBe(60000);
    expect(precios.normalCents).toBe(42900);
    expect(precios.cmrCents).toBe(28915);
    expect(precios.campaignName).toBe('Apple Pencil');
  });

  it('los Redmi Buds toman la campaña de monto fijo, que tiene más prioridad que la de tienda', async () => {
    await loadCatalog(getTestPrisma(), datos());

    const precios = resolvePrices(await pricedProduct(REDMI_BUDS_BARCODE), await findActive(AHORA), AHORA);

    expect(precios.originalCents).toBe(8990);
    expect(precios.normalCents).toBe(3990);
    expect(precios.cmrCents).toBe(3791);
    expect(precios.campaignName).toBe('Audífonos −S/ 50');
  });

  it('un producto sin descuento CMR tiene el precio CMR igual al de oferta', async () => {
    await loadCatalog(getTestPrisma(), datos());

    const precios = resolvePrices(await pricedProduct('2000000000114'), await findActive(AHORA), AHORA);

    expect(precios.normalCents).toBe(2841);
    expect(precios.cmrCents).toBe(2841);
    expect(precios.campaignName).toBe('Toda la tienda 5%');
  });
});
