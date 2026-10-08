import { describe, expect, it } from 'vitest';
import { categoryFormSchema, type CategoryFormValues } from './schema';
import { categoryResolver, issuesToFieldErrors } from './resolver';

function medidaField(): CategoryFormValues['fields'][number] {
  return {
    id: undefined,
    key: 'medida',
    label: 'Medida',
    type: 'TEXT',
    required: false,
    optionsText: '',
    unit: '',
    active: true,
  };
}

function validValues(): CategoryFormValues {
  return { name: 'Hogar', active: true, fields: [medidaField()] };
}

function listaSinOpciones(): CategoryFormValues {
  return { ...validValues(), fields: [{ ...medidaField(), type: 'SELECT', optionsText: '' }] };
}

type FlatErrors = {
  name?: { message?: string };
  fields?: Record<string, { optionsText?: { message?: string } }>;
};

type ResolverResult = { values: CategoryFormValues; errors: FlatErrors };

describe('issuesToFieldErrors', () => {
  it('convierte una lista sin opciones en un error anidado de la fila', () => {
    const result = categoryFormSchema.safeParse(listaSinOpciones());

    if (result.success) {
      throw new Error('El formulario debería ser inválido.');
    }

    const errors = issuesToFieldErrors(result.error.issues) as unknown as FlatErrors;

    expect(errors.fields?.['0']?.optionsText?.message).toContain('al menos 2 opciones');
  });

  it('ubica el error del nombre en la raíz', () => {
    const result = categoryFormSchema.safeParse({ ...validValues(), name: '  ' });

    if (result.success) {
      throw new Error('El formulario debería ser inválido.');
    }

    const errors = issuesToFieldErrors(result.error.issues) as unknown as FlatErrors;

    expect(errors.name?.message).toBe('El nombre de la categoría no puede estar vacío.');
  });
});

describe('categoryResolver', () => {
  it('devuelve los valores recortados cuando el formulario es válido', () => {
    const result = categoryResolver({ ...validValues(), name: '  Hogar  ' }) as ResolverResult;

    expect(result.errors).toEqual({});
    expect(result.values.name).toBe('Hogar');
  });

  it('devuelve los errores anidados cuando el formulario es inválido', () => {
    const result = categoryResolver(listaSinOpciones()) as ResolverResult;

    expect(result.errors.fields?.['0']?.optionsText?.message).toContain('al menos 2 opciones');
  });
});