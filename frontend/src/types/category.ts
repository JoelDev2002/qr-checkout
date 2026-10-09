export type FieldType = 'TEXT' | 'NUMBER' | 'SELECT' | 'BOOLEAN';

export type CategoryField = {
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

export type Category = {
  id: number;
  name: string;
  active: boolean;
  fields: CategoryField[];
};

/** Par etiqueta/valor de los campos de una categoría, listo para mostrar (backend domain/attributes.ts). */
export type DisplayAttribute = {
  key: string;
  label: string;
  value: string | number;
  unit: string | null;
};

export type CreateCategoryInput = {
  name: string;
};

export type UpdateCategoryInput = {
  name: string;
};

export type SetCategoryActiveInput = {
  active: boolean;
};

export type CreateFieldInput = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  unit?: string;
  sortOrder?: number;
};

export type UpdateFieldInput = {
  label?: string;
  required?: boolean;
  options?: string[];
  unit?: string;
  sortOrder?: number;
};

export type SetFieldActiveInput = {
  active: boolean;
};
