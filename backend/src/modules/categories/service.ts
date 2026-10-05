import type { FieldType } from '@prisma/client';
import {
  validateFieldDefinition,
  type CategoryField,
} from '../../domain/attributes.js';
import { ApiError } from '../../middlewares/errorHandler.js';
import {
  createCategory as createCategoryRecord,
  createField as createFieldRecord,
  findCategoryById,
  isUniqueViolation,
  listCategories as listCategoryRecords,
  renameCategory as renameCategoryRecord,
  setCategoryActive as setCategoryActiveRecord,
  setFieldActive as setFieldActiveRecord,
  updateField as updateFieldRecord,
  type CategoryFieldRecord,
  type CategoryRecord,
} from './repository.js';
import type { CreateFieldInput, UpdateFieldInput } from './schemas.js';

export type CategoryFieldView = {
  id: number;
  categoryId: number;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[] | null;
  unit: string | null;
  sortOrder: number;
  active: boolean;
};

export type CategoryView = {
  id: number;
  name: string;
  active: boolean;
  fields: CategoryFieldView[];
};

const CATEGORY_NOT_FOUND_MESSAGE = 'La categoría no existe.';
const FIELD_NOT_FOUND_MESSAGE = 'Ese campo no existe en esta categoría.';
const IMMUTABLE_FIELD_MESSAGE = 'La clave y el tipo de un campo no se pueden cambiar después de crearlo.';

function toFieldView(field: CategoryFieldRecord): CategoryFieldView {
  return {
    id: field.id,
    categoryId: field.categoryId,
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    options: field.options === null ? null : [...field.options],
    unit: field.unit,
    sortOrder: field.sortOrder,
    active: field.active,
  };
}

function toCategoryView(category: CategoryRecord): CategoryView {
  return {
    id: category.id,
    name: category.name,
    active: category.active,
    fields: category.fields.map(toFieldView),
  };
}

/** Los espacios sobrantes no se guardan: ni al principio ni al final ni entre palabras. */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function normalizeOptions(options: readonly string[] | undefined): string[] | null {
  if (options === undefined) {
    return null;
  }

  const clean = [...new Set(options.map((option) => option.trim()))].filter(
    (option) => option.length > 0,
  );

  return clean.length > 0 ? clean : null;
}

function normalizeUnit(unit: string | undefined): string | null {
  if (unit === undefined) {
    return null;
  }

  const clean = unit.trim();

  return clean.length > 0 ? clean : null;
}

async function guardUnique<T>(message: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, 'CONFLICT', message);
    }

    throw error;
  }
}

async function requireCategory(id: number): Promise<CategoryRecord> {
  const category = await findCategoryById(id, false);

  if (!category) {
    throw new ApiError(404, 'NOT_FOUND', CATEGORY_NOT_FOUND_MESSAGE);
  }

  return category;
}

function requireFieldOfCategory(category: CategoryRecord, fieldId: number): CategoryFieldRecord {
  const field = category.fields.find((candidate) => candidate.id === fieldId);

  if (!field) {
    throw new ApiError(404, 'NOT_FOUND', FIELD_NOT_FOUND_MESSAGE);
  }

  return field;
}

function assertDefinitionIsValid(definition: CategoryField): void {
  const validation = validateFieldDefinition(definition);

  if (!validation.ok) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      validation.errors.map((error) => error.message).join(' '),
    );
  }
}

export async function listCategories(includeInactive: boolean): Promise<CategoryView[]> {
  const categories = await listCategoryRecords({ includeInactive });

  return categories.map(toCategoryView);
}

export async function createCategory(name: string): Promise<CategoryView> {
  const cleanName = normalizeName(name);

  const category = await guardUnique(
    `Ya existe una categoría con el nombre "${cleanName}".`,
    () => createCategoryRecord({ name: cleanName }),
  );

  return toCategoryView(category);
}

export async function renameCategory(id: number, name: string): Promise<CategoryView> {
  await requireCategory(id);
  const cleanName = normalizeName(name);

  const category = await guardUnique(
    `Ya existe una categoría con el nombre "${cleanName}".`,
    () => renameCategoryRecord(id, cleanName),
  );

  return toCategoryView(category);
}

export async function setCategoryActive(id: number, active: boolean): Promise<CategoryView> {
  await requireCategory(id);
  const category = await setCategoryActiveRecord(id, active);

  return toCategoryView(category);
}

export async function createField(
  categoryId: number,
  input: CreateFieldInput,
): Promise<CategoryFieldView> {
  await requireCategory(categoryId);

  const definition: CategoryField = {
    key: input.key,
    label: input.label,
    type: input.type,
    required: input.required ?? false,
    options: normalizeOptions(input.options),
    unit: normalizeUnit(input.unit),
    sortOrder: input.sortOrder ?? 0,
    active: true,
  };

  assertDefinitionIsValid(definition);

  const field = await guardUnique(
    `La categoría ya tiene un campo con la clave "${definition.key}".`,
    () =>
      createFieldRecord({
        categoryId,
        key: definition.key,
        label: definition.label,
        type: definition.type,
        required: definition.required,
        options: definition.options,
        unit: definition.unit,
        sortOrder: definition.sortOrder,
      }),
  );

  return toFieldView(field);
}

export async function updateField(
  categoryId: number,
  fieldId: number,
  input: UpdateFieldInput,
): Promise<CategoryFieldView> {
  const category = await requireCategory(categoryId);
  const current = requireFieldOfCategory(category, fieldId);

  if (input.key !== undefined && input.key !== current.key) {
    throw new ApiError(400, 'VALIDATION_ERROR', IMMUTABLE_FIELD_MESSAGE);
  }

  if (input.type !== undefined && input.type !== current.type) {
    throw new ApiError(400, 'VALIDATION_ERROR', IMMUTABLE_FIELD_MESSAGE);
  }

  const definition: CategoryField = {
    key: current.key,
    label: input.label ?? current.label,
    type: current.type,
    required: input.required ?? current.required,
    options: input.options === undefined ? current.options : normalizeOptions(input.options),
    unit: input.unit === undefined ? current.unit : normalizeUnit(input.unit),
    sortOrder: input.sortOrder ?? current.sortOrder,
    active: current.active,
  };

  assertDefinitionIsValid(definition);

  const field = await updateFieldRecord(fieldId, {
    label: definition.label,
    required: definition.required,
    options: definition.options,
    unit: definition.unit,
    sortOrder: definition.sortOrder,
  });

  return toFieldView(field);
}

export async function setFieldActive(
  categoryId: number,
  fieldId: number,
  active: boolean,
): Promise<CategoryFieldView> {
  const category = await requireCategory(categoryId);
  requireFieldOfCategory(category, fieldId);

  return toFieldView(await setFieldActiveRecord(fieldId, active));
}