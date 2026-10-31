import { z } from 'zod';
import { normalizeRuc, rucError } from '../../lib/ruc';

export const SUPPLIER_TEXT_MAX_LENGTH = 120;
export const SUPPLIER_PHONE_MAX_LENGTH = 20;

/** Texto opcional del formulario: vacío se envía como null, igual que lo guarda el servidor. */
function optionalText(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, `${label} no puede tener más de ${max} caracteres.`)
    .transform((value) => (value === '' ? null : value));
}

export const supplierFormSchema = z.object({
  ruc: z
    .string()
    .transform(normalizeRuc)
    .superRefine((value, ctx) => {
      const message = rucError(value);

      if (message !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      }
    }),
  businessName: z
    .string()
    .trim()
    .min(1, 'La razón social no puede estar vacía.')
    .max(SUPPLIER_TEXT_MAX_LENGTH, `La razón social no puede tener más de ${SUPPLIER_TEXT_MAX_LENGTH} caracteres.`),
  contactName: optionalText('El nombre del contacto', SUPPLIER_TEXT_MAX_LENGTH),
  phone: z
    .string()
    .trim()
    .max(SUPPLIER_PHONE_MAX_LENGTH, `El teléfono no puede tener más de ${SUPPLIER_PHONE_MAX_LENGTH} caracteres.`)
    .regex(/^[0-9+()\s-]*$/, 'El teléfono solo puede tener números, espacios y los signos + ( ) -.')
    .transform((value) => (value === '' ? null : value)),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => value === '' || z.string().email().safeParse(value).success, 'Escribe un correo válido.')
    .transform((value) => (value === '' ? null : value)),
  address: optionalText('La dirección', SUPPLIER_TEXT_MAX_LENGTH),
});

/** Lo que escribe el usuario (todo texto). */
export type SupplierFormValues = z.input<typeof supplierFormSchema>;
/** Lo que se envía a la API (opcionales vacíos como null). */
export type SupplierFormOutput = z.output<typeof supplierFormSchema>;

export const emptySupplierForm: SupplierFormValues = {
  ruc: '',
  businessName: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
};
