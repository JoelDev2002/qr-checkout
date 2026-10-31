import type { FieldErrors } from 'react-hook-form';
import { supplierFormSchema, type SupplierFormOutput, type SupplierFormValues } from './schema';

/** Convierte los problemas de Zod en los errores planos que espera React Hook Form. */
export function supplierResolver(values: SupplierFormValues) {
  const parsed = supplierFormSchema.safeParse(values);

  if (parsed.success) {
    return { values: parsed.data as SupplierFormOutput, errors: {} };
  }

  const errors: Record<string, { type: string; message: string }> = {};

  for (const issue of parsed.error.issues) {
    const field = issue.path[0];

    if (typeof field === 'string' && !(field in errors)) {
      errors[field] = { type: issue.code, message: issue.message };
    }
  }

  return { values: {}, errors: errors as FieldErrors<SupplierFormValues> };
}
