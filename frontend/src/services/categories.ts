import type {
  Category,
  CreateCategoryInput,
  CreateFieldInput,
  SetCategoryActiveInput,
  SetFieldActiveInput,
  UpdateCategoryInput,
  UpdateFieldInput,
} from '../types/category';
import { get, patch, post, put } from './api';

export function listCategories(includeInactive = false): Promise<Category[]> {
  const query = includeInactive ? '?includeInactive=true' : '';
  return get<Category[]>(`/categories${query}`);
}

export function createCategory(input: CreateCategoryInput): Promise<Category> {
  return post<Category>('/categories', input);
}

export function updateCategory(id: number, input: UpdateCategoryInput): Promise<Category> {
  return put<Category>(`/categories/${id}`, input);
}

export function setCategoryActive(id: number, input: SetCategoryActiveInput): Promise<Category> {
  return patch<Category>(`/categories/${id}/active`, input);
}

export function createField(categoryId: number, input: CreateFieldInput): Promise<Category['fields'][number]> {
  return post<Category['fields'][number]>(`/categories/${categoryId}/fields`, input);
}

export function updateField(
  categoryId: number,
  fieldId: number,
  input: UpdateFieldInput,
): Promise<Category['fields'][number]> {
  return put<Category['fields'][number]>(`/categories/${categoryId}/fields/${fieldId}`, input);
}

export function setFieldActive(
  categoryId: number,
  fieldId: number,
  input: SetFieldActiveInput,
): Promise<Category['fields'][number]> {
  return patch<Category['fields'][number]>(`/categories/${categoryId}/fields/${fieldId}/active`, input);
}
