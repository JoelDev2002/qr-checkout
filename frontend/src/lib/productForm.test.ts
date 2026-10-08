import { describe, expect, it } from 'vitest';
import {
  buildAttributeValues,
  buildCreateBody,
  buildUpdateBody,
  formatBpsToPercent,
  formatCentsToSoles,
  parseCmrPercent,
  parseInteger,
  parseOriginalPrice,
  productToDraft,
} from './productForm';
import type { ProductFormDraft } from './productForm';
import type { CategoryField } from '../types/category';
import type { AdminProduct } from '../types/product';

function field(overrides: Partial<CategoryField> = {}): CategoryField {
  return {
    id: 1,
    categoryId: 1,
    key: 'medida',
    label: 'Medida',
    type: 'TEXT',
    required: false,
    options: null,
    unit: null,
    sortOrder: 0,
    active: true,
    ...overrides,
  };
}

function draft(overrides: Partial<ProductFormDraft> = {}): ProductFormDraft {
  return {
      barcode: '2001234567893',
    name: '  Colchón Queen  ',
    brand: '  Saga  ',
    color: ' Gris ',
    categoryId: '3',
    originalPrice: '89.90',
    hasCmrDiscount: true,
    cmrPercent: '28.5',
    stock: '12',
    maxPerPurchase: '4',
    attributes: { medida: 'Queen', bateria: '', duracion: '36', color_led: 'true' },
    ...overrides,
  };
}

describe('parseOriginalPrice', () => {
  it('convierte los soles a céntimos sin coma flotante', () => {
    expect(parseOriginalPrice('89.90')).toEqual({ ok: true, value: 8990 });
    expect(parseOriginalPrice('89.9')).toEqual({ ok: true, value: 8990 });
    expect(parseOriginalPrice('89,90')).toEqual({ ok: true, value: 8990 });
    expect(parseOriginalPrice('1889')).toEqual({ ok: true, value: 188900 });
    expect(parseOriginalPrice('0.01')).toEqual({ ok: true, value: 1 });
    expect(parseOriginalPrice('  50  ')).toEqual({ ok: true, value: 5000 });
  });

  it('rechaza vacíos, textos y más de dos decimales', () => {
    expect(parseOriginalPrice('')).toEqual({ ok: false, message: 'Escribe el precio original.' });
    expect(parseOriginalPrice('  ')).toEqual({ ok: false, message: 'Escribe el precio original.' });
    expect(parseOriginalPrice('ochenta')).toEqual({
      ok: false,
      message: 'Escribe el precio con números, por ejemplo 89.90.',
    });
    expect(parseOriginalPrice('89.905')).toEqual({
      ok: false,
      message: 'El precio admite como máximo 2 decimales.',
    });
  });

  it('rechaza precios en cero o negativos', () => {
    expect(parseOriginalPrice('0')).toEqual({
      ok: false,
      message: 'El precio original debe ser mayor que cero.',
    });
    expect(parseOriginalPrice('-5')).toEqual({
      ok: false,
      message: 'Escribe el precio con números, por ejemplo 89.90.',
    });
  });
});

describe('parseCmrPercent', () => {
  it('convierte el porcentaje a puntos básicos sin coma flotante', () => {
    expect(parseCmrPercent('28.5')).toEqual({ ok: true, value: 2850 });
    expect(parseCmrPercent('44')).toEqual({ ok: true, value: 4400 });
    expect(parseCmrPercent('1')).toEqual({ ok: true, value: 100 });
    expect(parseCmrPercent('90')).toEqual({ ok: true, value: 9000 });
    expect(parseCmrPercent('89,99')).toEqual({ ok: true, value: 8999 });
  });

  it('rechaza valores fuera del rango y textos', () => {
    const rango = 'El porcentaje debe ser mayor que 0 y hasta 90.';

    expect(parseCmrPercent('0')).toEqual({ ok: false, message: rango });
    expect(parseCmrPercent('90.01')).toEqual({ ok: false, message: rango });
    expect(parseCmrPercent('91')).toEqual({ ok: false, message: rango });
    expect(parseCmrPercent('')).toEqual({
      ok: false,
      message: 'Escribe el porcentaje del descuento.',
    });
    expect(parseCmrPercent('veinte')).toEqual({
      ok: false,
      message: 'Escribe el porcentaje con números, por ejemplo 28.5.',
    });
    expect(parseCmrPercent('28.555')).toEqual({
      ok: false,
      message: 'El porcentaje admite como máximo 2 decimales.',
    });
  });
});

describe('parseInteger', () => {
  it('acepta enteros desde el mínimo indicado', () => {
    expect(parseInteger('0', 'El stock inicial', 0)).toEqual({ ok: true, value: 0 });
    expect(parseInteger('12', 'El stock inicial', 0)).toEqual({ ok: true, value: 12 });
    expect(parseInteger('1', 'El máximo por compra', 1)).toEqual({ ok: true, value: 1 });
  });

  it('rechaza vacíos, decimales y valores por debajo del mínimo', () => {
    expect(parseInteger('', 'El stock inicial', 0)).toEqual({
      ok: false,
      message: 'El stock inicial es obligatorio.',
    });
    expect(parseInteger('3.5', 'El stock inicial', 0)).toEqual({
      ok: false,
      message: 'El stock inicial debe ser un número entero.',
    });
    expect(parseInteger('-2', 'El stock inicial', 0)).toEqual({
      ok: false,
      message: 'El stock inicial debe ser un número entero.',
    });
    expect(parseInteger('0', 'El máximo por compra', 1)).toEqual({
      ok: false,
      message: 'El máximo por compra debe ser al menos 1.',
    });
  });
});

describe('buildAttributeValues', () => {
  const fields = [
    field({ id: 1, key: 'medida', label: 'Medida', type: 'TEXT', required: true, sortOrder: 1 }),
    field({ id: 2, key: 'duracion', label: 'Duración', type: 'NUMBER', unit: 'horas', sortOrder: 2 }),
    field({
      id: 3,
      key: 'color_led',
      label: 'LED',
      type: 'BOOLEAN',
      required: true,
      sortOrder: 3,
    }),
    field({
      id: 4,
      key: 'garantia',
      label: 'Garantía',
      type: 'SELECT',
      options: ['1 año', '2 años'],
      sortOrder: 4,
    }),
    field({ id: 5, key: 'extra', label: 'Extra', type: 'TEXT', active: false, sortOrder: 5 }),
  ];

  it('convierte cada tipo y omite los opcionales vacíos', () => {
    expect(
      buildAttributeValues(fields, {
        medida: '  Queen  ',
        duracion: '36',
        color_led: 'false',
        garantia: '1 año',
        extra: 'se ignora',
      }),
    ).toEqual({ medida: 'Queen', duracion: 36, color_led: false, garantia: '1 año' });
  });

  it('el número admite coma decimal y se envía como número', () => {
    const values = buildAttributeValues(fields, {
      medida: 'Queen',
      color_led: 'true',
      duracion: '36,5',
    });

    expect(values.duracion).toBe(36.5);
    expect(typeof values.duracion).toBe('number');
  });

  it('lanza el aviso de un obligatorio vacío', () => {
    expect(() => buildAttributeValues(fields, { color_led: '', medida: 'Queen' })).toThrow(
      'LED es obligatorio.',
    );
    expect(() => buildAttributeValues(fields, { medida: '', color_led: 'true' })).toThrow(
      'Medida es obligatorio.',
    );
  });

  it('rechaza números negativos y opciones fuera de la lista', () => {
    expect(() =>
      buildAttributeValues(fields, { medida: 'Queen', color_led: 'true', duracion: '-3' }),
    ).toThrow('Duración no puede ser negativo.');

    expect(() =>
      buildAttributeValues(fields, { medida: 'Queen', color_led: 'true', garantia: '3 años' }),
    ).toThrow('Garantía: debe ser una de las opciones: 1 año, 2 años.');
  });

  it('rechaza un sí/no que no sea ni sí ni no', () => {
    expect(() =>
      buildAttributeValues(fields, { medida: 'Queen', color_led: 'tal vez' }),
    ).toThrow('LED: debe ser sí o no.');
  });
});

describe('buildCreateBody', () => {
  const fields = [
    field({ id: 1, key: 'medida', label: 'Medida', type: 'TEXT', required: true, sortOrder: 1 }),
    field({ id: 2, key: 'duracion', label: 'Duración', type: 'NUMBER', sortOrder: 2 }),
    field({ id: 3, key: 'color_led', label: 'LED', type: 'BOOLEAN', sortOrder: 3 }),
  ];

  it('arma el cuerpo de crear con los números convertidos', () => {
    const body = buildCreateBody(draft(), fields);

    expect(body).toEqual({
    barcode: '2001234567893',
      name: 'Colchón Queen',
      brand: 'Saga',
      color: 'Gris',
      categoryId: 3,
      originalPriceCents: 8990,
      hasCmrDiscount: true,
      cmrDiscountBps: 2850,
      stock: 12,
      maxPerPurchase: 4,
      attributes: { medida: 'Queen', duracion: 36, color_led: true },
    });
  });

  it('sin descuento CMR manda el porcentaje en 0 y omite el color vacío', () => {
    const body = buildCreateBody(
      draft({ hasCmrDiscount: false, cmrPercent: '40', color: '   ' }),
      fields,
    );

    expect(body.hasCmrDiscount).toBe(false);
    expect(body.cmrDiscountBps).toBe(0);
    expect('color' in body).toBe(false);
  });

  it('lanza los avisos de los campos que no sirven', () => {
    expect(() => buildCreateBody(draft({ originalPrice: '0' }), fields)).toThrow(
      'El precio original debe ser mayor que cero.',
    );
    expect(() => buildCreateBody(draft({ cmrPercent: '95' }), fields)).toThrow(
      'El porcentaje debe ser mayor que 0 y hasta 90.',
    );
    expect(() => buildCreateBody(draft({ stock: 'dos' }), fields)).toThrow(
      'El stock inicial debe ser un número entero.',
    );
    expect(() => buildCreateBody(draft({ attributes: { medida: '' } }), fields)).toThrow(
      'Medida es obligatorio.',
    );
  });
});

describe('buildUpdateBody', () => {
  const fields = [field({ id: 1, key: 'medida', label: 'Medida', type: 'TEXT', required: true })];

  it('arma el cuerpo de editar sin código ni stock', () => {
    const body = buildUpdateBody(draft(), fields);

    expect(body).toEqual({
      name: 'Colchón Queen',
      brand: 'Saga',
      color: 'Gris',
      categoryId: 3,
      originalPriceCents: 8990,
      hasCmrDiscount: true,
      cmrDiscountBps: 2850,
      maxPerPurchase: 4,
      attributes: { medida: 'Queen' },
    });
    expect('barcode' in body).toBe(false);
    expect('stock' in body).toBe(false);
    expect('discardAttributes' in body).toBe(false);
  });

  it('incluye discardAttributes solo cuando se confirma el descarte', () => {
    expect(buildUpdateBody(draft(), fields, { discardAttributes: true }).discardAttributes).toBe(
      true,
    );
    expect('discardAttributes' in buildUpdateBody(draft(), fields, { discardAttributes: false })).toBe(
      false,
    );
  });
});

function adminProduct(overrides: Partial<AdminProduct> = {}): AdminProduct {
  return {
    id: 7,
    barcode: '2001234567893',
    name: 'Colchón Queen',
    brand: 'Saga',
    color: 'Gris',
    categoryId: 3,
    categoryName: 'Dormitorio',
    originalPriceCents: 8990,
    hasCmrDiscount: true,
    cmrDiscountBps: 2850,
    attributes: { medida: 'Queen', duracion: 36, color_led: true, garantia: '1 año' },
    stock: 12,
    maxPerPurchase: 4,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    prices: {
      originalCents: 8990,
      normalCents: 8990,
      cmrCents: 6428,
      campaignId: null,
      campaignName: null,
      discountPercent: 0,
      cmrPercent: 28,
    },
    ...overrides,
  };
}

describe('formatCentsToSoles', () => {
  it('escribe los céntimos como soles sin coma flotante', () => {
    expect(formatCentsToSoles(8990)).toBe('89.90');
    expect(formatCentsToSoles(188900)).toBe('1889.00');
    expect(formatCentsToSoles(1)).toBe('0.01');
    expect(formatCentsToSoles(100)).toBe('1.00');
    expect(formatCentsToSoles(0)).toBe('0.00');
  });
});

describe('formatBpsToPercent', () => {
  it('escribe los puntos básicos como porcentaje', () => {
    expect(formatBpsToPercent(2850)).toBe('28.5');
    expect(formatBpsToPercent(4400)).toBe('44');
    expect(formatBpsToPercent(100)).toBe('1');
    expect(formatBpsToPercent(0)).toBe('0');
    expect(formatBpsToPercent(8999)).toBe('89.99');
  });
});

describe('productToDraft', () => {
  const fields = [
    field({ id: 1, key: 'medida', label: 'Medida', type: 'TEXT', required: true }),
    field({ id: 2, key: 'duracion', label: 'Duración', type: 'NUMBER', unit: 'horas' }),
    field({ id: 3, key: 'color_led', label: 'LED', type: 'BOOLEAN' }),
    field({ id: 4, key: 'garantia', label: 'Garantía', type: 'SELECT', options: ['1 año'] }),
    field({ id: 5, key: 'viejo', label: 'Viejo', type: 'TEXT', active: false }),
  ];

  it('convierte lo guardado en texto de formulario', () => {
    const values = productToDraft(adminProduct(), fields);

    expect(values).toEqual({
      barcode: '2001234567893',
      name: 'Colchón Queen',
      brand: 'Saga',
      color: 'Gris',
      categoryId: '3',
      originalPrice: '89.90',
      hasCmrDiscount: true,
      cmrPercent: '28.5',
      stock: '12',
      maxPerPurchase: '4',
      attributes: { medida: 'Queen', duracion: '36', color_led: 'true', garantia: '1 año' },
    });
  });

  it('deja vacío lo que el producto no tiene y omite los campos inactivos', () => {
    const values = productToDraft(
      adminProduct({ color: null, hasCmrDiscount: false, cmrDiscountBps: 0, attributes: {} }),
      fields,
    );

    expect(values.color).toBe('');
    expect(values.cmrPercent).toBe('0');
    expect(values.attributes).toEqual({ medida: '', duracion: '', color_led: '', garantia: '' });
    expect('viejo' in values.attributes).toBe(false);
  });

  it('el texto listo se reenvía sin cambios al crear de nuevo', () => {
    const values = productToDraft(adminProduct(), fields);
    const body = buildCreateBody({ ...values, stock: '12' }, fields);

    expect(body.attributes).toEqual({
      medida: 'Queen',
      duracion: 36,
      color_led: true,
      garantia: '1 año',
    });
    expect(body.originalPriceCents).toBe(8990);
    expect(body.cmrDiscountBps).toBe(2850);
  });
});
