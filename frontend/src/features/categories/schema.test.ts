import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  categoryFormSchema,
  FIELD_OPTIONS_MAX,
  FIELD_OPTION_MAX_LENGTH,
  MIN_SELECT_OPTIONS,
} from './schema';

type FieldShape = {
  key?: string;
  label?: string;
  type?: string;
  required?: boolean;
  optionsText?: string;
  unit?: string;
  active?: boolean;
};

function field(overrides: FieldShape = {}): Record<string, unknown> {
  return {
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

function form(fields: Record<string, unknown>[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: 'Categoría', active: true, fields, ...overrides };
}

type SafeResult = ReturnType<typeof categoryFormSchema.safeParse>;

function mustFail(result: SafeResult): z.ZodError {
  if (result.success) {
    throw new Error('El formulario debería ser inválido.');
  }

  return result.error;
}

function issueMessages(result: SafeResult, path: string): string[] {
  return mustFail(result).issues
    .filter((issue) => issue.path.join('.') === path)
    .map((issue) => issue.message);
}

function mustSucceed(result: SafeResult): Extract<SafeResult, { success: true }> {
  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message).join(' | ');
    throw new Error(`El formulario debería ser válido, pero falló: ${messages}`);
  }

  return result;
}

const validForm = form([field()]);

describe('schema del formulario de categorías', () => {
  it('acepta una categoría válida', () => {
    const result = categoryFormSchema.safeParse(validForm);

    mustSucceed(result);
  });

  describe('nombre de la categoría', () => {
    it('rechaza un nombre vacío', () => {
      const result = categoryFormSchema.safeParse(form([], { name: '   ' }));

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'name')).toContain(
        'El nombre de la categoría no puede estar vacío.',
      );
    });

    it('rechaza un nombre demasiado largo', () => {
      const result = categoryFormSchema.safeParse(form([], { name: 'a'.repeat(81) }));

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'name')).toContain(
        'El nombre no puede tener más de 80 caracteres.',
      );
    });

    it('recorta los espacios alrededor y admite espacios entre palabras', () => {
      const result = categoryFormSchema.safeParse(form([], { name: '  Hogar   y   dormitorio  ' }));
      const parsed = mustSucceed(result);

      expect(parsed.data.name).toBe('Hogar   y   dormitorio');
    });
  });

  describe('tipos de campo', () => {
    it.each(['TEXT', 'NUMBER', 'BOOLEAN'])('acepta el tipo %s', (type) => {
      const result = categoryFormSchema.safeParse(form([field({ type })]));

      mustSucceed(result);
    });

    it('acepta el tipo lista con sus opciones', () => {
      const result = categoryFormSchema.safeParse(
        form([field({ type: 'SELECT', optionsText: 'Cartón\nPlástico' })]),
      );

      mustSucceed(result);
    });

    it('rechaza un tipo desconocido', () => {
      const result = categoryFormSchema.safeParse(form([field({ type: 'CUALQUIERA' })]));

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'fields.0.type')).toContain(
        'El tipo del campo debe ser texto, número, lista o sí/no.',
      );
    });
  });

  describe('opciones de un campo de tipo lista', () => {
    it('rechaza una lista sin opciones', () => {
      const result = categoryFormSchema.safeParse(
        form([field({ type: 'SELECT', optionsText: '' })]),
      );

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'fields.0.optionsText')).toContain(
        `Una lista necesita al menos ${MIN_SELECT_OPTIONS} opciones distintas y no vacías.`,
      );
    });

    it('rechaza una lista con una sola opción', () => {
      const result = categoryFormSchema.safeParse(
        form([field({ type: 'SELECT', optionsText: 'Cartón' })]),
      );

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'fields.0.optionsText')).toContain(
        `Una lista necesita al menos ${MIN_SELECT_OPTIONS} opciones distintas y no vacías.`,
      );
    });

    it('rechaza opciones repetidas que dejan una sola distinta', () => {
      const result = categoryFormSchema.safeParse(
        form([field({ type: 'SELECT', optionsText: 'Cartón\nCartón' })]),
      );

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'fields.0.optionsText')).toContain(
        `Una lista necesita al menos ${MIN_SELECT_OPTIONS} opciones distintas y no vacías.`,
      );
    });

    it('acepta una lista con dos opciones distintas y no vacías', () => {
      const result = categoryFormSchema.safeParse(
        form([field({ type: 'SELECT', optionsText: 'Cartón\nPlástico' })]),
      );

      mustSucceed(result);
    });

    it('ignora líneas vacías y espacios al contar las opciones', () => {
      const result = categoryFormSchema.safeParse(
        form([field({ type: 'SELECT', optionsText: ' Cartón \n\n  Plástico  \n' })]),
      );

      mustSucceed(result);
    });

    it('rechaza una lista con más de 30 opciones', () => {
      const result = categoryFormSchema.safeParse(
        form([
          field({
            type: 'SELECT',
            optionsText: Array.from({ length: FIELD_OPTIONS_MAX + 1 }, (_, i) => `Opción ${i}`).join(
              '\n',
            ),
          }),
        ]),
      );

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'fields.0.optionsText')).toContain(
        `Un campo puede tener hasta ${FIELD_OPTIONS_MAX} opciones.`,
      );
    });

    it('rechaza una opción demasiado larga', () => {
      const result = categoryFormSchema.safeParse(
        form([
          field({
            type: 'SELECT',
            optionsText: `A\n${'x'.repeat(FIELD_OPTION_MAX_LENGTH + 1)}`,
          }),
        ]),
      );

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'fields.0.optionsText')).toContain(
        `Cada opción puede tener hasta ${FIELD_OPTION_MAX_LENGTH} caracteres.`,
      );
    });

    it('rechaza opciones en un campo que no es de tipo lista', () => {
      const result = categoryFormSchema.safeParse(
        form([field({ optionsText: 'Cartón\nPlástico' })]),
      );

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'fields.0.optionsText')).toContain(
        'Solo un campo de tipo lista puede tener opciones.',
      );
    });
  });

  describe('unidad de un campo de tipo número', () => {
    it('acepta un número con unidad opcional', () => {
      const sinUnidad = categoryFormSchema.safeParse(form([field({ type: 'NUMBER', unit: '' })]));
      const conUnidad = categoryFormSchema.safeParse(form([field({ type: 'NUMBER', unit: 'horas' })]));

      mustSucceed(sinUnidad);
      mustSucceed(conUnidad);
    });

    it('rechaza una unidad demasiado larga', () => {
      const result = categoryFormSchema.safeParse(
        form([field({ type: 'NUMBER', unit: 'x'.repeat(21) })]),
      );

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'fields.0.unit')).toContain(
        'La unidad puede tener hasta 20 caracteres.',
      );
    });

    it('rechaza una unidad en un campo que no es de tipo número', () => {
      const result = categoryFormSchema.safeParse(
        form([field({ type: 'BOOLEAN', unit: 'horas' })]),
      );

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'fields.0.unit')).toContain(
        'La unidad solo se permite en un campo de tipo número.',
      );
    });
  });

  describe('claves de los campos', () => {
    it('rechaza una clave vacía', () => {
      const result = categoryFormSchema.safeParse(form([field({ key: '' })]));

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'fields.0.key')).toContain(
        'La clave del campo no puede estar vacía.',
      );
    });

    it('rechaza caracteres fuera de minúsculas, números y guion bajo', () => {
      const result = categoryFormSchema.safeParse(form([field({ key: 'Medida Color' })]));

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'fields.0.key')).toContain(
        'La clave solo puede tener letras minúsculas, números y guion bajo.',
      );
    });

    it('rechaza claves duplicadas dentro de la misma categoría', () => {
      const result = categoryFormSchema.safeParse(
        form([field({ key: 'medida' }), field({ key: 'medida' })]),
      );

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'fields.1.key')).toContain(
        'La clave "medida" ya se usa en esta categoría.',
      );
    });
  });

  describe('estado de la categoría', () => {
    it('rechaza un estado que no sea booleano', () => {
      const result = categoryFormSchema.safeParse(
        form([field()], { active: 'true' as unknown as boolean }),
      );

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'active')).toContain(
        'Indica si la categoría queda activa.',
      );
    });
  });
});