import type {
  Category,
  CategoryField,
  CreateFieldInput,
  UpdateFieldInput,
} from '../../types/category';
import type { CategoryFormValues, FieldFormValues } from './schema';

/**
 * El formulario guarda las opciones como texto (una por línea); el servidor espera una lista.
 * Las opciones repetidas o vacías se descartan, igual que al guardar.
 */
export function parseOptionsText(text: string): string[] {
  const seen = new Set<string>();
  const options: string[] = [];

  for (const line of text.split('\n')) {
    const option = line.trim();

    if (option === '' || seen.has(option)) {
      continue;
    }

    seen.add(option);
    options.push(option);
  }

  return options;
}

export function fieldToForm(field: CategoryField): FieldFormValues {
  return {
    id: field.id,
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    optionsText: (field.options ?? []).join('\n'),
    unit: field.unit ?? '',
    active: field.active,
  };
}

/** La posición de la fila manda: el orden se guarda como sortOrder al enviar. */
export function categoryToForm(category: Category): CategoryFormValues {
  const fields = [...category.fields]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)
    .map(fieldToForm);

  return { name: category.name, active: category.active, fields };
}

export function emptyCategoryForm(): CategoryFormValues {
  return { name: '', active: true, fields: [] };
}

export function fieldFormToCreate(row: FieldFormValues, sortOrder: number): CreateFieldInput {
  return {
    key: row.key.trim(),
    label: row.label.trim(),
    type: row.type,
    required: row.required,
    options: row.type === 'SELECT' ? parseOptionsText(row.optionsText) : undefined,
    unit: row.type === 'NUMBER' ? row.unit.trim() : undefined,
    sortOrder,
  };
}

/** Nunca envía key ni type: en un campo creado no se pueden cambiar. */
export function fieldFormToUpdate(row: FieldFormValues, sortOrder: number): UpdateFieldInput {
  return {
    label: row.label.trim(),
    required: row.required,
    options: row.type === 'SELECT' ? parseOptionsText(row.optionsText) : undefined,
    unit: row.type === 'NUMBER' ? row.unit.trim() : undefined,
    sortOrder,
  };
}
