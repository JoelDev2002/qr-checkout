import { describe, expect, it } from 'vitest';
import { cashierFormSchema, PASSWORD_MIN_LENGTH } from './schema';

type SafeResult = ReturnType<typeof cashierFormSchema.safeParse>;

function form(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: 'Ana Quispe', email: 'ana@example.com', password: 'secreto123', ...overrides };
}

function mustSucceed(result: SafeResult): Extract<SafeResult, { success: true }> {
  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message).join(' | ');
    throw new Error(`El formulario debería ser válido, pero falló: ${messages}`);
  }

  return result;
}

function issueMessages(result: SafeResult, path: string): string[] {
  if (result.success) {
    throw new Error('El formulario debería ser inválido.');
  }

  return result.error.issues
    .filter((issue) => issue.path.join('.') === path)
    .map((issue) => issue.message);
}

describe('schema del formulario de cajeros', () => {
  it('acepta un cajero válido', () => {
    mustSucceed(cashierFormSchema.safeParse(form()));
  });

  describe('nombre', () => {
    it('rechaza un nombre vacío', () => {
      const result = cashierFormSchema.safeParse(form({ name: '   ' }));

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'name')).toContain('El nombre del cajero no puede estar vacío.');
    });

    it('rechaza un nombre demasiado largo', () => {
      const result = cashierFormSchema.safeParse(form({ name: 'a'.repeat(81) }));

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'name')).toContain('El nombre no puede tener más de 80 caracteres.');
    });
  });

  describe('correo', () => {
    it('rechaza un correo inválido', () => {
      const result = cashierFormSchema.safeParse(form({ email: 'no-es-un-correo' }));

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'email')).toContain('Escribe un correo válido.');
    });

    it('recorta espacios y pasa a minúsculas', () => {
      const parsed = mustSucceed(cashierFormSchema.safeParse(form({ email: '  Ana@Example.COM  ' })));

      expect(parsed.data.email).toBe('ana@example.com');
    });
  });

  describe('contraseña', () => {
    it('rechaza una contraseña demasiado corta', () => {
      const result = cashierFormSchema.safeParse(form({ password: 'corta' }));

      expect(result.success).toBe(false);
      expect(issueMessages(result, 'password')).toContain(
        `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
      );
    });

    it('acepta una contraseña del largo mínimo', () => {
      mustSucceed(cashierFormSchema.safeParse(form({ password: 'x'.repeat(PASSWORD_MIN_LENGTH) })));
    });
  });
});
