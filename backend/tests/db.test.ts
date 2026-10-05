import { describe, expect, it, beforeEach } from 'vitest';
import { getTestPrisma, cleanDatabase } from './helpers/db.js';

/** Una fila real en cada tabla del proyecto, para comprobar que cleanDatabase las vacía todas. */
async function fillEveryTable() {
  const prisma = getTestPrisma();

  const user = await prisma.user.create({
    data: { email: 'todas@falabella.com', name: 'Todas', role: 'ADMIN' },
  });
  const categoria = await prisma.category.create({ data: { name: 'Audífonos' } });
  await prisma.categoryField.create({
    data: { categoryId: categoria.id, key: 'conectividad', label: 'Conexión', type: 'TEXT' },
  });
  const campana = await prisma.campaign.create({
    data: {
      name: 'Oferta de prueba',
      scope: 'PRODUCTS',
      discountType: 'PERCENT',
      discountValue: 2000,
      startsAt: new Date('2020-01-01'),
      endsAt: new Date('2099-01-01'),
    },
  });
  const producto = await prisma.product.create({
    data: {
      barcode: '7801234567890',
      name: 'Audífono Bluetooth',
      brand: 'Falabella',
      categoryId: categoria.id,
      originalPriceCents: 19990,
    },
  });
  await prisma.campaignProduct.create({
    data: { campaignId: campana.id, productId: producto.id },
  });
  await prisma.campaignCategory.create({
    data: { campaignId: campana.id, categoryId: categoria.id },
  });
  await prisma.stockAdjustment.create({
    data: { productId: producto.id, userId: user.id, delta: 10, reason: 'Carga inicial' },
  });
  const carrito = await prisma.cart.create({ data: { customerId: user.id } });
  await prisma.cartItem.create({
    data: { cartId: carrito.id, productId: producto.id, quantity: 2 },
  });
  const venta = await prisma.sale.create({
    data: {
      code: carrito.qrCode ?? 'T-PRUEBA',
      receiptNumber: 'T001-000001',
      cartId: carrito.id,
      customerId: user.id,
      cashierId: user.id,
      paymentMethod: 'CMR_CARD',
      priceApplied: 'CMR',
      originalTotalCents: 39980,
      offerTotalCents: 39980,
      cmrTotalCents: 28785,
      totalCents: 28785,
    },
  });
  await prisma.saleItem.create({
    data: {
      saleId: venta.id,
      productId: producto.id,
      barcode: producto.barcode,
      name: producto.name,
      quantity: 2,
      originalPriceCents: 19990,
      normalPriceCents: 19990,
      cmrPriceCents: 14392,
      paidPriceCents: 14392,
      subtotalCents: 28784,
    },
  });
  await prisma.documentSeries.create({ data: { series: 'T001', lastNumber: 1 } });
}

async function countEveryTable() {
  const prisma = getTestPrisma();

  return {
    User: await prisma.user.count(),
    Category: await prisma.category.count(),
    CategoryField: await prisma.categoryField.count(),
    Campaign: await prisma.campaign.count(),
    CampaignProduct: await prisma.campaignProduct.count(),
    CampaignCategory: await prisma.campaignCategory.count(),
    Product: await prisma.product.count(),
    StockAdjustment: await prisma.stockAdjustment.count(),
    Cart: await prisma.cart.count(),
    CartItem: await prisma.cartItem.count(),
    Sale: await prisma.sale.count(),
    SaleItem: await prisma.saleItem.count(),
    DocumentSeries: await prisma.documentSeries.count(),
  };
}

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

  it('vacía las trece tablas del proyecto y deja intactas las migraciones', async () => {
    await fillEveryTable();

    expect(await countEveryTable()).toEqual({
      User: 1,
      Category: 1,
      CategoryField: 1,
      Campaign: 1,
      CampaignProduct: 1,
      CampaignCategory: 1,
      Product: 1,
      StockAdjustment: 1,
      Cart: 1,
      CartItem: 1,
      Sale: 1,
      SaleItem: 1,
      DocumentSeries: 1,
    });

    await cleanDatabase();

    expect(await countEveryTable()).toEqual({
      User: 0,
      Category: 0,
      CategoryField: 0,
      Campaign: 0,
      CampaignProduct: 0,
      CampaignCategory: 0,
      Product: 0,
      StockAdjustment: 0,
      Cart: 0,
      CartItem: 0,
      Sale: 0,
      SaleItem: 0,
      DocumentSeries: 0,
    });

    const [migraciones] = await prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*) AS total FROM _prisma_migrations
    `;
    expect(Number(migraciones?.total ?? 0n)).toBeGreaterThan(0);
  });
});