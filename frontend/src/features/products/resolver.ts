import type { FieldErrors, Resolver } from 'react-hook-form';
import type { ZodIssue } from 'zod';
import { createProductFormSchema, type ProductFormMode, type ProductFormValues } from './schema';
import type { CategoryField } from '../../types/category';

/**
 * Convierte los problemas de Zod en los errores anidados que espera React Hook Form
 * (`attributes.medida` → `{ attributes: { medida: { message } } }`).
 */
export function issuesToFieldErrors(issues: readonly ZodIssue[]): FieldErrors<ProductFormValues> {
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

  return root as FieldErrors<ProductFormValues>;
}

/**
 * React Hook Form entrega `undefined` en los campos dinámicos que aún no se tocaron; aquí se
 * rellenan con cadena vacía (y se descartan los que la categoría ya no tiene) antes de validar.
 */
function withAttributeDefaults(
  values: ProductFormValues,
  fields: readonly CategoryField[],
): ProductFormValues {
  const attributes: Record<string, string> = {};

  for (const field of fields) {
    const raw = values.attributes[field.key];

    attributes[field.key] = typeof raw === 'string' ? raw : '';
  }

  return { ...values, attributes };
}

/**
 * El esquema depende de la categoría elegida, que cambia mientras el admin escribe: por eso los
 * campos se leen en cada validación y no se capturan al crear el resolver.
 */
export function productResolver(
  readFields: () => readonly CategoryField[],
  mode: ProductFormMode,
): Resolver<ProductFormValues> {
  return (values) => {
    const fields = readFields();
    const parsed = createProductFormSchema(fields, mode).safeParse(
      withAttributeDefaults(values, fields),
    );

    if (parsed.success) {
      return { values: parsed.data, errors: {} };
    }

    return { values: {}, errors: issuesToFieldErrors(parsed.error.issues) };
  };
}
