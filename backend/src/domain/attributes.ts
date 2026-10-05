export type FieldType = 'TEXT' | 'NUMBER' | 'SELECT' | 'BOOLEAN';

/** Campo adicional de una categoría, tal como lo devuelve el repositorio (ARCHITECTURE.md §5). */
export type CategoryField = {
  /** Identificador estable: no cambia después de crearse. */
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** Lista de textos, solo si type = SELECT. */
  options: readonly string[] | null;
  /** Por ejemplo "horas", solo si type = NUMBER. */
  unit: string | null;
  sortOrder: number;
  active: boolean;
};

/** Valores ya validados, listos para guardarse. */
export type AttributeValues = Record<string, string | number | boolean>;

export type AttributeError = {
  key: string;
  message: string;
};

export type AttributeValidation =
  | { ok: true; values: AttributeValues }
  | { ok: false; errors: AttributeError[] };

export type DisplayAttribute = {
  key: string;
  label: string;
  value: string | number;
  unit: string | null;
};

export type FieldDefinitionError = {
  /** Parte de la definición del campo que está mal. */
  field: 'key' | 'options' | 'unit';
  message: string;
};

export type FieldDefinitionValidation =
  | { ok: true }
  | { ok: false; errors: FieldDefinitionError[] };

const MAX_TEXT_LENGTH = 200;
const MIN_SELECT_OPTIONS = 2;
const KEY_PATTERN = /^[a-z0-9_]{1,40}$/;

type PrimitiveValue = string | number | boolean;

type CleanResult = { ok: true; value: PrimitiveValue } | { ok: false; message: string };

function activeFields(fields: readonly CategoryField[]): CategoryField[] {
  return fields.filter((field) => field.active);
}

function hasText(value: string | null): boolean {
  return value !== null && value.trim().length > 0;
}

function cleanValue(field: CategoryField, value: unknown): CleanResult {
  switch (field.type) {
    case 'TEXT': {
      if (typeof value !== 'string') {
        return { ok: false, message: 'Debe ser un texto.' };
      }

      const text = value.trim();

      if (text.length === 0) {
        return { ok: false, message: 'No puede estar vacío.' };
      }

      if (text.length > MAX_TEXT_LENGTH) {
        return { ok: false, message: `No puede tener más de ${MAX_TEXT_LENGTH} caracteres.` };
      }

      return { ok: true, value: text };
    }

    case 'NUMBER': {
      if (typeof value !== 'number') {
        return { ok: false, message: 'Debe ser un número.' };
      }

      if (!Number.isFinite(value)) {
        return { ok: false, message: 'Debe ser un número finito.' };
      }

      if (value < 0) {
        return { ok: false, message: 'No puede ser negativo.' };
      }

      return { ok: true, value };
    }

    case 'SELECT': {
      const options = field.options ?? [];

      if (typeof value !== 'string' || !options.includes(value)) {
        return { ok: false, message: `Debe ser una de las opciones: ${options.join(', ')}.` };
      }

      return { ok: true, value };
    }

    case 'BOOLEAN': {
      if (typeof value !== 'boolean') {
        return { ok: false, message: 'Debe ser sí o no.' };
      }

      return { ok: true, value };
    }
  }
}

/**
 * Valida los valores de un producto contra los campos activos de su categoría (RN-15).
 * Los campos inactivos no se exigen y sus claves no se aceptan.
 */
export function validateAttributes(
  fields: readonly CategoryField[],
  values: Readonly<Record<string, unknown>>,
): AttributeValidation {
  const active = activeFields(fields);
  const activeKeys = new Set(active.map((field) => field.key));
  const errors: AttributeError[] = [];
  const cleaned: AttributeValues = {};

  for (const field of active) {
    const value = values[field.key];

    if (value === undefined || value === null) {
      if (field.required) {
        errors.push({ key: field.key, message: `${field.label} es obligatorio.` });
      }

      continue;
    }

    const result = cleanValue(field, value);

    if (result.ok) {
      cleaned[field.key] = result.value;
    } else {
      errors.push({ key: field.key, message: `${field.label}: ${result.message}` });
    }
  }

  for (const key of Object.keys(values)) {
    if (!activeKeys.has(key)) {
      errors.push({ key, message: `El campo "${key}" no pertenece a esta categoría.` });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, values: cleaned };
}

function displayValue(value: PrimitiveValue): string | number {
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }

  return typeof value === 'number' ? value : value;
}

/** Detalles de un producto para mostrar: solo campos activos con valor, en orden de sortOrder. */
export function toDisplayAttributes(
  fields: readonly CategoryField[],
  values: Readonly<Record<string, unknown>>,
): DisplayAttribute[] {
  const ordered = activeFields(fields)
    .map((field) => ({ field, value: values[field.key] }))
    .sort((left, right) => left.field.sortOrder - right.field.sortOrder);

  const display: DisplayAttribute[] = [];

  for (const { field, value } of ordered) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      display.push({
        key: field.key,
        label: field.label,
        value: displayValue(value),
        unit: field.type === 'NUMBER' ? field.unit : null,
      });
    }
  }

  return display;
}

/** Reglas de la definición de un campo, antes de crearlo o de editarlo. */
export function validateFieldDefinition(field: CategoryField): FieldDefinitionValidation {
  const errors: FieldDefinitionError[] = [];
  const options = [...new Set((field.options ?? []).map((option) => option.trim()).filter(hasText))];

  if (!KEY_PATTERN.test(field.key)) {
    errors.push({
      field: 'key',
      message: 'La clave debe tener hasta 40 caracteres y solo letras minúsculas, números y guion bajo.',
    });
  }

  if (field.type === 'SELECT') {
    if (options.length < MIN_SELECT_OPTIONS) {
      errors.push({
        field: 'options',
        message: `Un campo de tipo lista necesita al menos ${MIN_SELECT_OPTIONS} opciones distintas.`,
      });
    }
  } else if (options.length > 0) {
    errors.push({ field: 'options', message: 'Solo un campo de tipo lista puede tener opciones.' });
  }

  if (field.type !== 'NUMBER' && hasText(field.unit)) {
    errors.push({ field: 'unit', message: 'La unidad solo se permite en un campo de tipo número.' });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}