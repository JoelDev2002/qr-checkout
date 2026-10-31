import { describe, expect, it } from 'vitest';
import { createSupplierSchema, updateSupplierSchema } from '../src/modules/suppliers/schemas.js';

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ruc: '20100047218', businessName: 'Distribuidora Andina SAC', ...overrides };
}

function messages(result: ReturnType<typeof createSupplierSchema.safeParse>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('createSupplierSchema', () => {
  it('acepta un proveedor mínimo y deja en null los campos opcionales', () => {
    const result = createSupplierSchema.safeParse(body());

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({
      ruc: '20100047218',
      businessName: 'Distribuidora Andina SAC',
      contactName: null,
      phone: null,
      email: null,
      address: null,
    });
  });

  it('normaliza el RUC, la razón social y el correo', () => {
    const result = createSupplierSchema.safeParse(
      body({ ruc: ' 2010 0047 218 ', businessName: '  Andina SAC ', email: ' Ventas@Andina.PE ' }),
    );

    expect(result.success && result.data).toMatchObject({
      ruc: '20100047218',
      businessName: 'Andina SAC',
      email: 'ventas@andina.pe',
    });
  });

  it('guarda como null los textos opcionales vacíos', () => {
    const result = createSupplierSchema.safeParse(
      body({ contactName: '   ', phone: '', email: '', address: '' }),
    );

    expect(result.success && result.data).toMatchObject({
      contactName: null,
      phone: null,
      email: null,
      address: null,
    });
  });

  it('rechaza un RUC inválido con el mensaje de la regla', () => {
    expect(messages(createSupplierSchema.safeParse(body({ ruc: '20100047219' })))).toContain(
      'El RUC no es válido: revisa el último dígito.',
    );
    expect(messages(createSupplierSchema.safeParse(body({ ruc: '123' })))).toContain(
      'El RUC debe tener 11 dígitos.',
    );
  });

  it('exige la razón social', () => {
    expect(messages(createSupplierSchema.safeParse(body({ businessName: '  ' })))).toContain(
      'La razón social no puede estar vacía.',
    );
  });

  it('rechaza un teléfono con letras y un correo inválido', () => {
    expect(messages(createSupplierSchema.safeParse(body({ phone: '01-ABC' })))).toContain(
      'El teléfono solo puede tener números, espacios y los signos + ( ) -.',
    );
    expect(messages(createSupplierSchema.safeParse(body({ email: 'no-es-correo' })))).toContain(
      'Escribe un correo válido.',
    );
  });

  it('rechaza campos que no existen', () => {
    expect(createSupplierSchema.safeParse(body({ active: false })).success).toBe(false);
  });
});

describe('updateSupplierSchema', () => {
  it('no permite cambiar el RUC', () => {
    const result = updateSupplierSchema.safeParse({ ruc: '20100047218', businessName: 'Andina' });

    expect(result.success).toBe(false);
  });
});
