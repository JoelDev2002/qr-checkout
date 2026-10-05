import { Prisma, type FieldType } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma.js';

export type CategoryFieldRecord = {
  id: number;
  categoryId: number;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: readonly string[] | null;
  unit: string | null;
  sortOrder: number;
  active: boolean;
};

export type CategoryRecord = {
  id: number;
  name: string;
  active: boolean;
  fields: CategoryFieldRecord[];
};

const fieldSelect = {
  id: true,
  categoryId: true,
  key: true,
  label: true,
  type: true,
  required: true,
  options: true,
  unit: true,
  sortOrder: true,
  active: true,
} satisfies Prisma.CategoryFieldSelect;

const fieldOrderBy = [{ sortOrder: 'asc' }, { id: 'asc' }] satisfies Prisma.CategoryFieldOrderByWithRelationInput[];

function categorySelect(activeFieldsOnly: boolean) {
  return {
    id: true,
    name: true,
    active: true,
    fields: {
      select: fieldSelect,
      where: activeFieldsOnly ? { active: true } : undefined,
      orderBy: fieldOrderBy,
    },
  } satisfies Prisma.CategorySelect;
}

type FieldRow = {
  id: number;
  categoryId: number;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: Prisma.JsonValue;
  unit: string | null;
  sortOrder: number;
  active: boolean;
};

type CategoryRow = {
  id: number;
  name: string;
  active: boolean;
  fields: FieldRow[];
};

/** La columna options es Json: acá se convierte a la lista de textos que usa domain/. */
function toFieldRecord(row: FieldRow): CategoryFieldRecord {
  return {
    id: row.id,
    categoryId: row.categoryId,
    key: row.key,
    label: row.label,
    type: row.type,
    required: row.required,
    options: Array.isArray(row.options)
      ? row.options.filter((option): option is string => typeof option === 'string')
      : null,
    unit: row.unit,
    sortOrder: row.sortOrder,
    active: row.active,
  };
}

function toCategoryRecord(row: CategoryRow): CategoryRecord {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    fields: row.fields.map(toFieldRecord),
  };
}

export async function listCategories(options: { includeInactive: boolean }): Promise<CategoryRecord[]> {
  const rows = await prisma.category.findMany({
    where: options.includeInactive ? undefined : { active: true },
    select: categorySelect(!options.includeInactive),
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });

  return rows.map(toCategoryRecord);
}

export async function findCategoryById(id: number, activeFieldsOnly: boolean): Promise<CategoryRecord | null> {
  const row = await prisma.category.findUnique({
    where: { id },
    select: categorySelect(activeFieldsOnly),
  });

  return row ? toCategoryRecord(row) : null;
}

export async function createCategory(data: { name: string }): Promise<CategoryRecord> {
  const row = await prisma.category.create({
    data: { name: data.name },
    select: categorySelect(false),
  });

  return toCategoryRecord(row);
}

export async function renameCategory(id: number, name: string): Promise<CategoryRecord> {
  await prisma.category.update({ where: { id }, data: { name } });

  return requireCategoryRecord(id);
}

export async function setCategoryActive(id: number, active: boolean): Promise<CategoryRecord> {
  await prisma.category.update({ where: { id }, data: { active } });

  return requireCategoryRecord(id);
}

export type CreateFieldData = {
  categoryId: number;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: readonly string[] | null;
  unit: string | null;
  sortOrder: number;
};

export async function createField(data: CreateFieldData): Promise<CategoryFieldRecord> {
  const row = await prisma.categoryField.create({
    data: {
      categoryId: data.categoryId,
      key: data.key,
      label: data.label,
      type: data.type,
      required: data.required,
      options: data.options === null ? Prisma.DbNull : [...data.options],
      unit: data.unit,
      sortOrder: data.sortOrder,
    },
    select: fieldSelect,
  });

  return toFieldRecord(row);
}

export type UpdateFieldData = {
  label: string;
  required: boolean;
  options: readonly string[] | null;
  unit: string | null;
  sortOrder: number;
};

export async function updateField(id: number, data: UpdateFieldData): Promise<CategoryFieldRecord> {
  const row = await prisma.categoryField.update({
    where: { id },
    data: {
      label: data.label,
      required: data.required,
      options: data.options === null ? Prisma.DbNull : [...data.options],
      unit: data.unit,
      sortOrder: data.sortOrder,
    },
    select: fieldSelect,
  });

  return toFieldRecord(row);
}

export async function setFieldActive(id: number, active: boolean): Promise<CategoryFieldRecord> {
  const row = await prisma.categoryField.update({
    where: { id },
    data: { active },
    select: fieldSelect,
  });

  return toFieldRecord(row);
}

async function requireCategoryRecord(id: number): Promise<CategoryRecord> {
  const category = await findCategoryById(id, false);

  if (!category) {
    throw new Error(`La categoría ${id} se actualizó pero ya no existe.`);
  }

  return category;
}

/** Traduce el error de unicidad de Prisma (P2002) para que el servicio responda CONFLICT. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}