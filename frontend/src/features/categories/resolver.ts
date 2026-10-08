import type { FieldErrors } from 'react-hook-form';
import type { ZodIssue } from 'zod';
import { categoryFormSchema, type CategoryFormValues } from './schema';

/**
 * Convierte los problemas de Zod en los errores anidados que espera React Hook Form
 * (`fields.0.optionsText` → `{ fields: { 0: { optionsText: {...} } } }`).
 */
export function issuesToFieldErrors(issues: readonly ZodIssue[]): FieldErrors<CategoryFormValues> {
  const root: Record<string, unknown> = {};

  for (const issue of issues) {
    let node = root;

    for (const key of issue.path.slice(0, -1)) {
      const next = node[String(key)];

      if (typeof next !== 'object' || next === null) {
        node[String(key)] = {};
      }

      node = node[String(key)] as Record<string, unknown>;
    }

    const leaf = String(issue.path[issue.path.length - 1] ?? '');

    if (typeof node[leaf] !== 'object' || node[leaf] === null) {
      node[leaf] = { type: issue.code, message: issue.message };
    }
  }

  // Los índices de arreglo van como claves numéricas, que es como React Hook Form los lee.
  return root as FieldErrors<CategoryFormValues>;
}

export function categoryResolver(values: CategoryFormValues) {
  const parsed = categoryFormSchema.safeParse(values);

  if (parsed.success) {
    return { values: parsed.data, errors: {} };
  }

  return { values: {}, errors: issuesToFieldErrors(parsed.error.issues) };
}
