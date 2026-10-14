import type { FieldErrors } from 'react-hook-form';
import type { ZodIssue } from 'zod';
import { cashierFormSchema, type CashierFormValues } from './schema';

/** Convierte los problemas de Zod en los errores planos que espera React Hook Form. */
export function issuesToFieldErrors(issues: readonly ZodIssue[]): FieldErrors<CashierFormValues> {
  const errors: Record<string, { type: string; message: string }> = {};

  for (const issue of issues) {
    const field = issue.path[0];

    if (typeof field === 'string' && !(field in errors)) {
      errors[field] = { type: issue.code, message: issue.message };
    }
  }

  return errors as FieldErrors<CashierFormValues>;
}

export function cashierResolver(values: CashierFormValues) {
  const parsed = cashierFormSchema.safeParse(values);

  if (parsed.success) {
    return { values: parsed.data, errors: {} };
  }

  return { values: {}, errors: issuesToFieldErrors(parsed.error.issues) };
}
