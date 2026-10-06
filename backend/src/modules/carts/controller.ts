import type { Request, Response } from 'express';
import type { ZodError, ZodIssue } from 'zod';
import { ApiError } from '../../middlewares/errorHandler.js';
import { addItemSchema, productIdParamSchema, setItemQuantitySchema } from './schemas.js';
import { addItemByBarcode, clearCart, getCart, removeItem, setItemQuantity } from './service.js';

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

/** El carrito es del cliente del token: nunca se recibe un cliente del cuerpo ni de la ruta. */
function customerId(req: Request): number {
  if (!req.user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Se requiere autenticación.');
  }

  return Number(req.user.sub);
}

export async function getCartController(req: Request, res: Response): Promise<void> {
  res.json({ data: await getCart(customerId(req), new Date()) });
}

export async function addItemController(req: Request, res: Response): Promise<void> {
  const { barcode } = parse(addItemSchema.safeParse(req.body));

  res.json({ data: await addItemByBarcode(customerId(req), barcode, new Date()) });
}

export async function setItemQuantityController(req: Request, res: Response): Promise<void> {
  const { productId } = parse(productIdParamSchema.safeParse(req.params));
  const { quantity } = parse(setItemQuantitySchema.safeParse(req.body));

  res.json({ data: await setItemQuantity(customerId(req), productId, quantity, new Date()) });
}

export async function removeItemController(req: Request, res: Response): Promise<void> {
  const { productId } = parse(productIdParamSchema.safeParse(req.params));

  res.json({ data: await removeItem(customerId(req), productId, new Date()) });
}

export async function clearCartController(req: Request, res: Response): Promise<void> {
  res.json({ data: await clearCart(customerId(req), new Date()) });
}
