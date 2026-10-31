import { z } from 'zod';
import { emailField } from '../../domain/credentials.js';
import { checkRuc, normalizeRuc } from '../../domain/ruc.js';

export const SUPPLIER_TEXT_MAX_LENGTH = 120;
export const SUPPLIER_PHONE_MAX_LENGTH = 20;

const ruc = z
  .string({ required_error: 'El RUC es obligatorio.' })
  .transform(normalizeRuc)
  .superRefine((value, ctx) => {
    const result = checkRuc(value);

    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.message });
    }
  });

const businessName = z
  .string({ required_error: 'La razón social es obligatoria.' })
  .trim()
  .min(1, 'La razón social no puede estar vacía.')
  .max(SUPPLIER_TEXT_MAX_LENGTH, `La razón social no puede tener más de ${SUPPLIER_TEXT_MAX_LENGTH} caracteres.`);

/** Texto opcional: vacío o solo espacios se guarda como null. */
function optionalText(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, `${label} no puede tener más de ${max} caracteres.`)
    .nullish()
    .transform((value) => (value === undefined || value === null || value === '' ? null : value));
}

const phone = z
  .string()
  .trim()
  .max(SUPPLIER_PHONE_MAX_LENGTH, `El teléfono no puede tener más de ${SUPPLIER_PHONE_MAX_LENGTH} caracteres.`)
  .regex(/^[0-9+()\s-]*$/, 'El teléfono solo puede tener números, espacios y los signos + ( ) -.')
  .nullish()
  .transform((value) => (value === undefined || value === null || value === '' ? null : value));

const email = z
  .union([z.literal(''), emailField('El correo es obligatorio.', 'Escribe un correo válido.')])
  .nullish()
  .transform((value) => (value === undefined || value === null || value === '' ? null : value));

const editableFields = {
  businessName,
  contactName: optionalText('El nombre del contacto', SUPPLIER_TEXT_MAX_LENGTH),
  phone,
  email,
  address: optionalText('La dirección', SUPPLIER_TEXT_MAX_LENGTH),
};

export const createSupplierSchema = z.object({ ruc, ...editableFields }).strict();

/** El RUC identifica al proveedor y no se cambia después de crearlo. */
export const updateSupplierSchema = z.object(editableFields).strict();

export const setSupplierActiveSchema = z
  .object({
    active: z.boolean({ invalid_type_error: 'Indica si el proveedor queda activo.' }),
  })
  .strict();

export const listSuppliersQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(SUPPLIER_TEXT_MAX_LENGTH, 'La búsqueda es demasiado larga.')
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  active: z
    .enum(['true', 'false', '1', '0'], {
      errorMap: () => ({ message: 'El filtro de estado debe ser true o false.' }),
    })
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true' || value === '1')),
});

export const supplierIdParamSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: 'El identificador debe ser un número.' })
    .int('El identificador debe ser un número entero.')
    .positive('El identificador debe ser mayor que cero.'),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
