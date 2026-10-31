import { describe, expect, it } from 'vitest';
import { emptySupplierForm, supplierFormSchema } from './schema';

function form(overrides: Record<string, unknown> = {}) {
  return { ...emptySupplierForm, ruc: '20100047218', businessName: 'Distribuidora Andina SAC', ...overrides };
}

function messages(overrides: Record<string, unknown>): string[] {
  const result = supplierFormSchema.safeParse(form(overrides));
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('schema del formulario de proveedores', () => {
  it('acepta un proveedor mínimo y convierte los opcionales vacíos en null', () => {
    const result = supplierFormSchema.safeParse(form());

    expect(result.success && result.data).toEqual({
      ruc: '20100047218',
      businessName: 'Distribuidora Andina SAC',
      contactName: null,
      phone: null,
      email: null,
      address: null,
    });
  });

  it('normaliza el RUC con espacios y el correo en minúsculas', () => {
    const result = supplierFormSchema.safeParse(form({ ruc: '2010 0047 218', email: ' Ventas@Andina.PE ' }));

    expect(result.success && result.data).toMatchObject({ ruc: '20100047218', email: 'ventas@andina.pe' });
  });

  it('muestra el mensaje de la regla del RUC', () => {
    expect(messages({ ruc: '20100047219' })).toContain('El RUC no es válido: revisa el último dígito.');
  });

  it('exige la razón social', () => {
    expect(messages({ businessName: '   ' })).toContain('La razón social no puede estar vacía.');
  });

  it('rechaza un teléfono con letras y un correo inválido', () => {
    expect(messages({ phone: '01-ABC' })).toContain(
      'El teléfono solo puede tener números, espacios y los signos + ( ) -.',
    );
    expect(messages({ email: 'no-es-correo' })).toContain('Escribe un correo válido.');
  });
});
