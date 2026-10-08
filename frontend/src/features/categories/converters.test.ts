import { describe, expect, it } from 'vitest';
import type { Category, CategoryField } from '../../types/category';
import {
  categoryToForm,
  fieldFormToCreate,
  fieldFormToUpdate,
  fieldToForm,
  parseOptionsText,
} from './converters';
import type { FieldFormValues } from './schema';

function row(overrides: Partial<FieldFormValues> = {}): FieldFormValues {
  return {
    id: 3,
    key: 'medida',
    label: 'Medida',
    type: 'TEXT',
    required: false,
    optionsText: '',
    unit: '',
    active: true,
    ...overrides,
  };
}

function fieldRecord(
  overrides: Partial<CategoryField> = {},
): CategoryField {
  return {
    id: 3,
    categoryId: 1,
    key: 'medida',
    label: 'Medida',
    type: 'TEXT',
    required: false,
    options: null,
    unit: null,
    sortOrder: 5,
    active: true,
    ...overrides,
  };
}

describe('parseOptionsText', () => {
  it('convierte una línea por opción, recorta y descarta las vacías', () => {
    expect(parseOptionsText(' Cartón \n\n  Plástico  \nMadera\n')).toEqual([
      'Cartón',
      'Plástico',
      'Madera',
    ]);
  });

  it('quita opciones repetidas', () => {
    expect(parseOptionsText('Cartón\nPlástico\nCartón')).toEqual(['Cartón', 'Plástico']);
  });

  it('devuelve una lista vacía si no hay opciones', () => {
    expect(parseOptionsText('')).toEqual([]);
    expect(parseOptionsText('\n \n')).toEqual([]);
  });
});

describe('fieldFormToCreate', () => {
  it('envía key, label, type y required tal cual', () => {
    const payload = fieldFormToCreate(row({ label: '  Medida  ' }), 2);

    expect(payload).toMatchObject({ key: 'medida', label: 'Medida', type: 'TEXT', required: false, sortOrder: 2 });
  });

  it('convierte las opciones de texto a una lista si el tipo es lista', () => {
    const payload = fieldFormToCreate(
      row({ type: 'SELECT', optionsText: 'Cartón\nPlástico' }),
      0,
    );

    expect(payload.options).toEqual(['Cartón', 'Plástico']);
    expect(payload.unit).toBeUndefined();
  });

  it('no envía opciones en un campo que no es de tipo lista', () => {
    const payload = fieldFormToCreate(row({ type: 'TEXT', optionsText: 'ignorado' }), 0);

    expect(payload.options).toBeUndefined();
    expect(payload.unit).toBeUndefined();
  });

  it('envía la unidad recortada solo si el tipo es número', () => {
    const payload = fieldFormToCreate(row({ type: 'NUMBER', unit: ' horas ' }), 1);

    expect(payload.unit).toBe('horas');
  });
});

describe('fieldFormToUpdate', () => {
  it('nunca envía key ni type: no pueden cambiar después de crearlos', () => {
    const payload = fieldFormToUpdate(row(), 0);

    expect('key' in payload).toBe(false);
    expect('type' in payload).toBe(false);
  });

  it('convierte las opciones de texto a una lista si el tipo es lista', () => {
    const payload = fieldFormToUpdate(
      row({ type: 'SELECT', optionsText: 'Cartón\nCartón\nPlástico' }),
      4,
    );

    expect(payload.options).toEqual(['Cartón', 'Plástico']);
    expect(payload.sortOrder).toBe(4);
  });

  it('no envía opciones en un campo que no es de tipo lista', () => {
    const payload = fieldFormToUpdate(row({ type: 'BOOLEAN', optionsText: 'ignorado' }), 0);

    expect(payload.options).toBeUndefined();
  });

  it('envía la unidad solo si el tipo es número', () => {
    const conUnidad = fieldFormToUpdate(row({ type: 'NUMBER', unit: ' horas ' }), 0);
    const sinUnidad = fieldFormToUpdate(row({ type: 'TEXT', unit: ' horas ' }), 0);

    expect(conUnidad.unit).toBe('horas');
    expect(sinUnidad.unit).toBeUndefined();
  });
});

describe('mapping desde la API', () => {
  it('arma el texto de opciones desde la lista que devuelve la API', () => {
    const field = fieldRecord({
      type: 'SELECT',
      options: ['Cartón', 'Plástico'],
    });

    expect(fieldToForm(field).optionsText).toBe('Cartón\nPlástico');
    expect(fieldToForm(fieldRecord()).optionsText).toBe('');
  });

  it('traduce unit y option null a texto vacío', () => {
    expect(fieldToForm(fieldRecord({ unit: null })).unit).toBe('');
    expect(fieldToForm(fieldRecord({ unit: 'horas' })).unit).toBe('horas');
  });

  it('ordena los campos por sortOrder y luego por id antes de mostrarlos', () => {
    const category: Category = {
      id: 1,
      name: 'Electrónica',
      active: true,
      fields: [
        fieldRecord({ id: 2, key: 'b', sortOrder: 2 }),
        fieldRecord({ id: 1, key: 'a', sortOrder: 2 }),
        fieldRecord({ id: 3, key: 'c', sortOrder: 1 }),
      ],
    };

    const result = categoryToForm(category);

    expect(result.fields.map((field) => field.key)).toEqual(['c', 'a', 'b']);
    expect(result.name).toBe('Electrónica');
    expect(result.active).toBe(true);
  });
});