import type { Request, Response } from 'express';
import type { ZodError, ZodIssue } from 'zod';
import { ApiError } from '../../middlewares/errorHandler.js';
import {
  createSupplierSchema,
  listSuppliersQuerySchema,
  setSupplierActiveSchema,
  supplierIdParamSchema,
  updateSupplierSchema,
} from './schemas.js';
import {
  createSupplier,
  getSupplier,
  listSuppliers,
  setSupplierActive,
  updateSupplier,
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

export async function listSuppliersController(req: Request, res: Response): Promise<void> {
  const query = parse(listSuppliersQuerySchema.safeParse(req.query));

  res.json({ data: await listSuppliers(query) });
}

export async function getSupplierController(req: Request, res: Response): Promise<void> {
  const { id } = parse(supplierIdParamSchema.safeParse(req.params));

  res.json({ data: await getSupplier(id) });
}

export async function createSupplierController(req: Request, res: Response): Promise<void> {
  const input = parse(createSupplierSchema.safeParse(req.body));

  res.json({ data: await createSupplier(input) });
}

export async function updateSupplierController(req: Request, res: Response): Promise<void> {
  const { id } = parse(supplierIdParamSchema.safeParse(req.params));
  const input = parse(updateSupplierSchema.safeParse(req.body));

  res.json({ data: await updateSupplier(id, input) });
}

export async function setSupplierActiveController(req: Request, res: Response): Promise<void> {
  const { id } = parse(supplierIdParamSchema.safeParse(req.params));
  const { active } = parse(setSupplierActiveSchema.safeParse(req.body));

  res.json({ data: await setSupplierActive(id, active) });
}
