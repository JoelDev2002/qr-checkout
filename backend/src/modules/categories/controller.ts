import type { Request, Response } from 'express';
import type { ZodError } from 'zod';
import type { AuthTokenPayload } from '../../infrastructure/jwt.js';
import { ApiError } from '../../middlewares/errorHandler.js';
import {
  categoryFieldParamSchema,
  categoryIdParamSchema,
  createCategorySchema,
  createFieldSchema,
  listCategoriesQuerySchema,
  setCategoryActiveSchema,
  setFieldActiveSchema,
  updateCategorySchema,
  updateFieldSchema,
} from './schemas.js';
import {
  createCategory,
  createField,
  listCategories,
  renameCategory,
  setCategoryActive,
  setFieldActive,
  updateField,
} from './service.js';

function currentToken(req: Request): AuthTokenPayload {
  if (!req.user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Se requiere autenticación.');
  }

  return req.user;
}

function parse<T>(result: { success: true; data: T } | { success: false; error: ZodError }): T {
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(' ');
    throw new ApiError(400, 'VALIDATION_ERROR', message);
  }

  return result.data;
}

export async function listCategoriesController(req: Request, res: Response): Promise<void> {
  const token = currentToken(req);
  const query = parse(listCategoriesQuerySchema.safeParse(req.query));
  // includeInactive solo lo respeta el admin: los demás roles ven siempre lo activo.
  const includeInactive = token.role === 'ADMIN' && query.includeInactive;

  res.json({ data: await listCategories(includeInactive) });
}

export async function createCategoryController(req: Request, res: Response): Promise<void> {
  const input = parse(createCategorySchema.safeParse(req.body));

  res.json({ data: await createCategory(input.name) });
}

export async function updateCategoryController(req: Request, res: Response): Promise<void> {
  const { id } = parse(categoryIdParamSchema.safeParse(req.params));
  const input = parse(updateCategorySchema.safeParse(req.body));

  res.json({ data: await renameCategory(id, input.name) });
}

export async function setCategoryActiveController(req: Request, res: Response): Promise<void> {
  const { id } = parse(categoryIdParamSchema.safeParse(req.params));
  const { active } = parse(setCategoryActiveSchema.safeParse(req.body));

  res.json({ data: await setCategoryActive(id, active) });
}

export async function createFieldController(req: Request, res: Response): Promise<void> {
  const { id } = parse(categoryIdParamSchema.safeParse(req.params));
  const input = parse(createFieldSchema.safeParse(req.body));

  res.json({ data: await createField(id, input) });
}

export async function updateFieldController(req: Request, res: Response): Promise<void> {
  const { id, fieldId } = parse(categoryFieldParamSchema.safeParse(req.params));
  const input = parse(updateFieldSchema.safeParse(req.body));

  res.json({ data: await updateField(id, fieldId, input) });
}

export async function setFieldActiveController(req: Request, res: Response): Promise<void> {
  const { id, fieldId } = parse(categoryFieldParamSchema.safeParse(req.params));
  const { active } = parse(setFieldActiveSchema.safeParse(req.body));

  res.json({ data: await setFieldActive(id, fieldId, active) });
}