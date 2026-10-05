import type { Request, Response } from 'express';
import type { ZodError, ZodIssue } from 'zod';
import { ApiError } from '../../middlewares/errorHandler.js';
import {
  createProductSchema,
  listProductsQuerySchema,
  productIdParamSchema,
  setProductActiveSchema,
  updateProductSchema,
} from './schemas.js';
import {
  createProduct,
  getProduct,
  listProducts,
  setProductActive,
  updateProduct,
} from './service.js';

/** Los esquemas son estrictos: una clave desconocida se explica en español y no en el idioma de Zod. */
function describeIssue(issue: ZodIssue): string {
  if (issue.code === 'unrecognized_keys') {
    return `Estos campos no se permiten aquí: ${issue.keys.join(', ')}.`;
  }

  return issue.message;
}

function parse<T>(result: { success: true; data: T } | { success: false; error: ZodError }): T {
  if (!result.success) {
    const message = result.error.issues.map(describeIssue).join(' ');
    throw new ApiError(400, 'VALIDATION_ERROR', message);
  }

  return result.data;
}

function actorUserId(req: Request): number {
  if (!req.user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Se requiere autenticación.');
  }

  return Number(req.user.sub);
}

export async function listProductsController(req: Request, res: Response): Promise<void> {
  const query = parse(listProductsQuerySchema.safeParse(req.query));

  res.json({ data: await listProducts(query, new Date()) });
}

export async function getProductController(req: Request, res: Response): Promise<void> {
  const { id } = parse(productIdParamSchema.safeParse(req.params));

  res.json({ data: await getProduct(id, new Date()) });
}

export async function createProductController(req: Request, res: Response): Promise<void> {
  const input = parse(createProductSchema.safeParse(req.body));

  res.json({ data: await createProduct(input, actorUserId(req), new Date()) });
}

export async function updateProductController(req: Request, res: Response): Promise<void> {
  const { id } = parse(productIdParamSchema.safeParse(req.params));
  const input = parse(updateProductSchema.safeParse(req.body));

  res.json({ data: await updateProduct(id, input, new Date()) });
}

export async function setProductActiveController(req: Request, res: Response): Promise<void> {
  const { id } = parse(productIdParamSchema.safeParse(req.params));
  const { active } = parse(setProductActiveSchema.safeParse(req.body));

  res.json({ data: await setProductActive(id, active, new Date()) });
}