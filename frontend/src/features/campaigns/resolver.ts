import type { FieldErrors } from 'react-hook-form';
import type { ZodIssue } from 'zod';
import { campaignFormSchema, type CampaignFormValues } from './schema';

/**
 * Convierte los problemas de Zod en los errores anidados que espera React Hook Form
 * (`productIds` → `{ productIds: { message } }`).
 */
export function issuesToFieldErrors(issues: readonly ZodIssue[]): FieldErrors<CampaignFormValues> {
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

  return root as FieldErrors<CampaignFormValues>;
}

export function campaignResolver(values: CampaignFormValues) {
  const parsed = campaignFormSchema.safeParse(values);

  if (parsed.success) {
    return { values: parsed.data, errors: {} };
  }

  return { values: {}, errors: issuesToFieldErrors(parsed.error.issues) };
}
