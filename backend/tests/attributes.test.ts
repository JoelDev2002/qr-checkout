import { describe, expect, it } from 'vitest';
import {
  toDisplayAttributes,
  validateAttributes,
  validateFieldDefinition,
  type CategoryField,
} from '../src/domain/attributes.js';

function field(overrides: Partial<CategoryField> = {}): CategoryField {
  return {
    key: 'campo',
    label: 'Campo',
    type: 'TEXT',
    required: false,
    options: null,
    unit: null,
    sortOrder: 0,
    active: true,
    ...overrides,
  };
}

/** Campos de ejemplo de la categoría "Celulares". */
function cellularFields(): CategoryField[] {
  return [
    field({ key: 'color', label: 'Color', type: 'SELECT', required: true, options: ['Negro', 'Blanco'], sortOrder: 1 }),
    field({ key: 'bateria', label: 'Batería', type: 'NUMBER', required: true, unit: 'horas', sortOrder: 2 }),
    field({ key: 'resistente_agua', label: 'Resistente al agua', type: 'BOOLEAN', sortOrder: 3 }),
    field({ key: 'marca', label: 'Marca', type: 'TEXT', sortOrder: 0 }),
    field({ key: 'codigo_interno', label: 'Código interno', type: 'TEXT', required: true, sortOrder: 4, active: false }),
  ];
}

describe('validateAttributes', () => {
  it('acepta los valores válidos y los devuelve limpios', () => {
    const result = validateAttributes(cellularFields(), {
      color: 'Negro',
      bateria: 36,
      resistente_agua: true,
      marca: '  Xiaomi  ',
    });

    expect(result).toEqual({
      ok: true,
      values: { marca: 'Xiaomi', color: 'Negro', bateria: 36, resistente_agua: true },
    });
  });

  it('no invierte los campos que no tienen valor y no son obligatorios', () => {
    const result = validateAttributes(cellularFields(), { color: 'Blanco', bateria: 24 });

    expect(result).toEqual({ ok: true, values: { color: 'Blanco', bateria: 24 } });
  });

  it('acepta los cuatro tipos', () => {
    const fields = [
      field({ key: 'texto', type: 'TEXT' }),
      field({ key: 'numero', type: 'NUMBER' }),
      field({ key: 'opcion', type: 'SELECT', options: ['A', 'B'] }),
      field({ key: 'booleano', type: 'BOOLEAN' }),
    ];

    const result = validateAttributes(fields, {
      texto: 'Xiaomi Redmi Note 13',
      numero: 0,
      opcion: 'B',
      booleano: false,
    });

    expect(result).toEqual({ ok: true, values: { texto: 'Xiaomi Redmi Note 13', numero: 0, opcion: 'B', booleano: false } });
  });

  describe('TEXT', () => {
    const fields = [field({ key: 'marca', label: 'Marca', type: 'TEXT' })];

    it('quita los espacios sobrantes de los extremos', () => {
      const result = validateAttributes(fields, { marca: '   Xiaomi   ' });

      expect(result).toEqual({ ok: true, values: { marca: 'Xiaomi' } });
    });

    it('acepta exactamente 200 caracteres y rechaza uno más', () => {
      const limit = 'a'.repeat(200);

      expect(validateAttributes(fields, { marca: limit })).toEqual({ ok: true, values: { marca: limit } });

      const result = validateAttributes(fields, { marca: `${limit}a` });

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.errors).toEqual([
        { key: 'marca', message: 'Marca: No puede tener más de 200 caracteres.' },
      ]);
    });

    it('rechaza un texto vacío o solo con espacios', () => {
      for (const value of ['', '   ']) {
        const result = validateAttributes(fields, { marca: value });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.errors[0]?.message).toBe('Marca: No puede estar vacío.');
      }
    });

    it('rechaza valores que no son texto', () => {
      for (const value of [36, true, { texto: 'x' }, ['x']]) {
        const result = validateAttributes(fields, { marca: value });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.errors[0]?.message).toBe('Marca: Debe ser un texto.');
      }
    });
  });

  describe('NUMBER', () => {
    const fields = [field({ key: 'bateria', label: 'Batería', type: 'NUMBER', unit: 'horas' })];

    it('acepta cero, decimales y enteros', () => {
      for (const value of [0, 36, 7.5]) {
        expect(validateAttributes(fields, { bateria: value })).toEqual({ ok: true, values: { bateria: value } });
      }
    });

    it('rechaza números negativos', () => {
      const result = validateAttributes(fields, { bateria: -1 });

      expect(result.ok === false && result.errors[0]).toEqual({
        key: 'bateria',
        message: 'Batería: No puede ser negativo.',
      });
    });

    it('rechaza NaN e infinitos', () => {
      for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        const result = validateAttributes(fields, { bateria: value });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.errors[0]?.message).toBe('Batería: Debe ser un número finito.');
      }
    });

    it('rechaza valores que no son número, aunque sean numéricos', () => {
      for (const value of ['36', 'treinta y seis', true, [36]]) {
        const result = validateAttributes(fields, { bateria: value });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.errors[0]?.message).toBe('Batería: Debe ser un número.');
      }
    });
  });

  describe('SELECT', () => {
    const fields = [field({ key: 'color', label: 'Color', type: 'SELECT', options: ['Negro', 'Blanco'] })];

    it('rechaza un valor que no está en la lista', () => {
      const result = validateAttributes(fields, { color: 'Dorado' });

      expect(result.ok === false && result.errors[0]).toEqual({
        key: 'color',
        message: 'Color: Debe ser una de las opciones: Negro, Blanco.',
      });
    });

    it('distingue mayúsculas y no acepta espacios sobrantes', () => {
      for (const value of ['negro', ' Negro', 'Negro ']) {
        expect(validateAttributes(fields, { color: value }).ok).toBe(false);
      }
    });

    it('rechaza valores que no son texto', () => {
      for (const value of [1, false, ['Negro']]) {
        const result = validateAttributes(fields, { color: value });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.errors[0]?.message).toBe('Color: Debe ser una de las opciones: Negro, Blanco.');
      }
    });
  });

  describe('BOOLEAN', () => {
    const fields = [field({ key: 'resistente_agua', label: 'Resistente al agua', type: 'BOOLEAN' })];

    it('acepta true y false', () => {
      expect(validateAttributes(fields, { resistente_agua: true })).toEqual({
        ok: true,
        values: { resistente_agua: true },
      });
      expect(validateAttributes(fields, { resistente_agua: false })).toEqual({
        ok: true,
        values: { resistente_agua: false },
      });
    });

    it('rechaza "Sí", "No" y números', () => {
      for (const value of ['Sí', 'No', 'true', 1, 0, ['true']]) {
        const result = validateAttributes(fields, { resistente_agua: value });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.errors[0]?.message).toBe('Resistente al agua: Debe ser sí o no.');
      }
    });

    it('trata null como valor ausente', () => {
      const required = [field({ key: 'resistente_agua', label: 'Resistente al agua', type: 'BOOLEAN', required: true })];

      expect(validateAttributes(fields, { resistente_agua: null })).toEqual({ ok: true, values: {} });

      const result = validateAttributes(required, { resistente_agua: null });

      expect(result.ok === false && result.errors).toEqual([
        { key: 'resistente_agua', message: 'Resistente al agua es obligatorio.' },
      ]);
    });
  });

  describe('campos obligatorios y claves desconocidas', () => {
    it('avisa cuando falta un campo obligatorio', () => {
      const result = validateAttributes(cellularFields(), { color: 'Negro' });

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.errors).toEqual([{ key: 'bateria', message: 'Batería es obligatorio.' }]);
    });

    it('avisa por cada campo obligatorio que falta', () => {
      const result = validateAttributes(cellularFields(), {});

      expect(result.ok === false && result.errors.map((error) => error.key)).toEqual(['color', 'bateria']);
    });

    it('rechaza una clave que no pertenece a ningún campo', () => {
      const result = validateAttributes(cellularFields(), { color: 'Negro', bateria: 36, capacidad: '256' });

      expect(result.ok === false && result.errors).toEqual([
        { key: 'capacidad', message: 'El campo "capacidad" no pertenece a esta categoría.' },
      ]);
    });

    it('ignora los campos inactivos: no los exige y no devuelve sus valores', () => {
      const result = validateAttributes(cellularFields(), { color: 'Negro', bateria: 36 });

      expect(result).toEqual({ ok: true, values: { color: 'Negro', bateria: 36 } });
    });

    it('rechaza un valor enviado para un campo inactivo', () => {
      const result = validateAttributes(cellularFields(), {
        color: 'Negro',
        bateria: 36,
        codigo_interno: 'X-1',
      });

      expect(result.ok === false && result.errors).toEqual([
        { key: 'codigo_interno', message: 'El campo "codigo_interno" no pertenece a esta categoría.' },
      ]);
    });

    it('devuelve todos los errores juntos, campos primero y claves desconocidas después', () => {
      const result = validateAttributes(cellularFields(), { marca: '', bateria: -5, color: 'Negro', talla: 'M' });

      expect(result.ok === false && result.errors).toEqual([
        { key: 'bateria', message: 'Batería: No puede ser negativo.' },
        { key: 'marca', message: 'Marca: No puede estar vacío.' },
        { key: 'talla', message: 'El campo "talla" no pertenece a esta categoría.' },
      ]);
    });

    it('acepta una categoría sin campos y sin valores', () => {
      expect(validateAttributes([], {})).toEqual({ ok: true, values: {} });
      expect(validateAttributes([], { color: 'Negro' }).ok).toBe(false);
    });
  });
});

describe('toDisplayAttributes', () => {
  const fields = cellularFields();

  it('devuelve etiqueta, valor y unidad en orden de sortOrder', () => {
    const display = toDisplayAttributes(fields, {
      marca: 'Xiaomi',
      color: 'Negro',
      bateria: 36,
      resistente_agua: true,
    });

    expect(display).toEqual([
      { key: 'marca', label: 'Marca', value: 'Xiaomi', unit: null },
      { key: 'color', label: 'Color', value: 'Negro', unit: null },
      { key: 'bateria', label: 'Batería', value: 36, unit: 'horas' },
      { key: 'resistente_agua', label: 'Resistente al agua', value: 'Sí', unit: null },
    ]);
  });

  it('muestra los booleanos como Sí o No', () => {
    expect(toDisplayAttributes(fields, { resistente_agua: false })).toEqual([
      { key: 'resistente_agua', label: 'Resistente al agua', value: 'No', unit: null },
    ]);
  });

  it('omite los campos sin valor y los inactivos', () => {
    const display = toDisplayAttributes(fields, { color: 'Blanco', codigo_interno: 'X-1' });

    expect(display).toEqual([{ key: 'color', label: 'Color', value: 'Blanco', unit: null }]);
  });

  it('omite los valores que no son texto, número ni booleano', () => {
    const display = toDisplayAttributes(fields, { marca: { texto: 'Xiaomi' }, bateria: ['36'] });

    expect(display).toEqual([]);
  });

  it('respeta el sortOrder indicado y no depende del orden de los campos', () => {
    const desordenados = [
      field({ key: 'tercero', label: 'Tercero', sortOrder: 3 }),
      field({ key: 'primero', label: 'Primero', sortOrder: 1 }),
      field({ key: 'segundo', label: 'Segundo', sortOrder: 2 }),
    ];

    const display = toDisplayAttributes(desordenados, { tercero: 'C', primero: 'A', segundo: 'B' });

    expect(display.map((item) => item.label)).toEqual(['Primero', 'Segundo', 'Tercero']);
  });

  it('pone la unidad solo en los campos numéricos', () => {
    const display = toDisplayAttributes(
      [field({ key: 'color', label: 'Color', type: 'SELECT', options: ['Negro'], sortOrder: 1, unit: 'cm' })],
      { color: 'Negro' },
    );

    expect(display).toEqual([{ key: 'color', label: 'Color', value: 'Negro', unit: null }]);
  });
});

describe('validateFieldDefinition', () => {
  it('acepta un campo de texto, de número con unidad y de sí/no', () => {
    expect(validateFieldDefinition(field({ key: 'marca', label: 'Marca', type: 'TEXT' }))).toEqual({ ok: true });
    expect(validateFieldDefinition(field({ key: 'bateria', label: 'Batería', type: 'NUMBER', unit: 'horas' }))).toEqual({ ok: true });
    expect(validateFieldDefinition(field({ key: 'resistente_agua', label: 'Resistente al agua', type: 'BOOLEAN' }))).toEqual({ ok: true });
  });

  it('acepta un campo de lista con dos opciones distintas', () => {
    const result = validateFieldDefinition(field({ key: 'color', label: 'Color', type: 'SELECT', options: ['Negro', 'Blanco'] }));

    expect(result).toEqual({ ok: true });
  });

  it('exige al menos dos opciones distintas en un campo de lista', () => {
    for (const options of [null, [], ['Negro'], ['Negro', ''], ['Negro', ' Negro '], ['Negro', '  ']]) {
      const result = validateFieldDefinition(field({ key: 'color', label: 'Color', type: 'SELECT', options }));

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.errors).toEqual([
        { field: 'options', message: 'Un campo de tipo lista necesita al menos 2 opciones distintas.' },
      ]);
    }
  });

  it('no acepta opciones en un campo que no es de lista', () => {
    for (const type of ['TEXT', 'NUMBER', 'BOOLEAN'] as const) {
      const result = validateFieldDefinition(field({ key: 'marca', label: 'Marca', type, options: ['Negro', 'Blanco'] }));

      expect(result.ok === false && result.errors).toEqual([
        { field: 'options', message: 'Solo un campo de tipo lista puede tener opciones.' },
      ]);
    }
  });

  it('permite una lista de opciones vacía en un campo que no es de lista', () => {
    expect(validateFieldDefinition(field({ key: 'marca', label: 'Marca', type: 'TEXT', options: [] }))).toEqual({ ok: true });
  });

  it('solo permite la unidad en un campo numérico', () => {
    for (const type of ['TEXT', 'SELECT', 'BOOLEAN'] as const) {
      const result = validateFieldDefinition(
        field({ key: 'marca', label: 'Marca', type, options: type === 'SELECT' ? ['Negro', 'Blanco'] : null, unit: 'horas' }),
      );

      expect(result.ok === false && result.errors).toEqual([
        { field: 'unit', message: 'La unidad solo se permite en un campo de tipo número.' },
      ]);
    }
  });

  it('acepta una unidad vacía o con espacios en cualquier tipo', () => {
    expect(validateFieldDefinition(field({ key: 'marca', label: 'Marca', type: 'TEXT', unit: '   ' }))).toEqual({ ok: true });
  });

  it('acepta claves con letras minúsculas, números y guion bajo de hasta 40 caracteres', () => {
    for (const key of ['marca', 'resistente_agua', 'pantalla_13', 'a1_b2', 'a'.repeat(40)]) {
      expect(validateFieldDefinition(field({ key }))).toEqual({ ok: true });
    }
  });

  it('rechaza claves con mayúsculas, acentos, guiones, espacios o demasiado largas', () => {
    for (const key of ['', 'Marca', 'marca-1', 'marca 1', 'marca.1', 'ñandú', 'a'.repeat(41)]) {
      const result = validateFieldDefinition(field({ key }));

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.errors).toEqual([
        {
          field: 'key',
          message: 'La clave debe tener hasta 40 caracteres y solo letras minúsculas, números y guion bajo.',
        },
      ]);
    }
  });

  it('devuelve todos los problemas de la definición juntos', () => {
    const result = validateFieldDefinition(
      field({ key: 'Color', label: 'Color', type: 'NUMBER', unit: 'horas', options: ['Negro'] }),
    );

    expect(result.ok === false && result.errors.map((error) => error.field)).toEqual(['key', 'options']);
  });
});