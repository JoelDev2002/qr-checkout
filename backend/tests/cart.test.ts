import { describe, expect, it } from 'vitest';
import { checkQuantity, isQrExpired, itemIssue, quantityLimit } from '../src/domain/cart.js';

describe('quantityLimit', () => {
  it('es el menor entre el máximo por compra y el stock (RN-04)', () => {
    expect(quantityLimit({ maxPerPurchase: 10, stock: 25 })).toBe(10);
    expect(quantityLimit({ maxPerPurchase: 10, stock: 4 })).toBe(4);
    expect(quantityLimit({ maxPerPurchase: 3, stock: 3 })).toBe(3);
    expect(quantityLimit({ maxPerPurchase: 10, stock: 0 })).toBe(0);
  });
});

describe('checkQuantity', () => {
  it('acepta la cantidad que cabe en el límite', () => {
    expect(checkQuantity({ maxPerPurchase: 10, stock: 25 }, 10)).toBeNull();
    expect(checkQuantity({ maxPerPurchase: 10, stock: 25 }, 1)).toBeNull();
    expect(checkQuantity({ maxPerPurchase: 10, stock: 4 }, 4)).toBeNull();
  });

  it('avisa primero por el máximo por compra', () => {
    expect(checkQuantity({ maxPerPurchase: 3, stock: 50 }, 4)).toEqual({
      reason: 'MAX_PER_PURCHASE',
      limit: 3,
    });
  });

  it('avisa por el stock cuando el máximo por compra no alcanza', () => {
    expect(checkQuantity({ maxPerPurchase: 10, stock: 2 }, 3)).toEqual({ reason: 'OUT_OF_STOCK', stock: 2 });
  });

  it('avisa por el stock cuando ya no queda ninguna unidad', () => {
    expect(checkQuantity({ maxPerPurchase: 10, stock: 0 }, 1)).toEqual({ reason: 'OUT_OF_STOCK', stock: 0 });
  });
});

describe('itemIssue', () => {
  const disponible = { active: true, categoryActive: true, maxPerPurchase: 10, stock: 5 };

  it('no marca ningún aviso cuando el producto está disponible', () => {
    expect(itemIssue(disponible, 3)).toBeNull();
  });

  it('marca INACTIVE si el producto o su categoría se desactivaron', () => {
    expect(itemIssue({ ...disponible, active: false }, 1)).toBe('INACTIVE');
    expect(itemIssue({ ...disponible, categoryActive: false }, 1)).toBe('INACTIVE');
  });

  it('marca INSUFFICIENT_STOCK si el stock bajó de la cantidad', () => {
    expect(itemIssue({ ...disponible, stock: 2 }, 3)).toBe('INSUFFICIENT_STOCK');
  });

  it('prefiere INACTIVE si el producto se desactivó y además falta stock', () => {
    expect(itemIssue({ ...disponible, active: false, stock: 0 }, 3)).toBe('INACTIVE');
  });
});

describe('isQrExpired', () => {
  const ahora = new Date('2026-06-15T15:00:00.000Z');

  it('es falso con el carrito abierto o sin expiración', () => {
    expect(isQrExpired({ status: 'OPEN', qrExpiresAt: null }, ahora)).toBe(false);
    expect(isQrExpired({ status: 'OPEN', qrExpiresAt: new Date('2026-06-15T14:00:00.000Z') }, ahora)).toBe(false);
    expect(isQrExpired({ status: 'PENDING', qrExpiresAt: null }, ahora)).toBe(false);
  });

  it('es falso mientras el QR sigue vigente', () => {
    expect(isQrExpired({ status: 'PENDING', qrExpiresAt: new Date('2026-06-15T15:00:01.000Z') }, ahora)).toBe(false);
  });

  it('es verdadero en el minuto exacto de la expiración y después', () => {
    expect(isQrExpired({ status: 'PENDING', qrExpiresAt: new Date('2026-06-15T15:00:00.000Z') }, ahora)).toBe(true);
    expect(isQrExpired({ status: 'PENDING', qrExpiresAt: new Date('2026-06-15T14:30:00.000Z') }, ahora)).toBe(true);
  });
});
