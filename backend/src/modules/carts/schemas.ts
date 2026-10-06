import { z } from 'zod';

/** Cota de seguridad para la cantidad que pide el cliente: el límite real es el del producto (RN-04). */
export const MAX_CART_QUANTITY = 999;

/** Lo que llega del escáner: EAN-13, EAN-8, UPC y códigos internos. Solo dígitos. */
export const BARCODE_MIN_DIGITS = 8;
export const BARCODE_MAX_DIGITS = 14;

export const addItemSchema = z
  .object({
    barcode: z
      .string({ required_error: 'El código de barras es obligatorio.' })
      .trim()
      .regex(
        new RegExp(`^\\d{${BARCODE_MIN_DIGITS},${BARCODE_MAX_DIGITS}}$`),
        `El código debe tener entre ${BARCODE_MIN_DIGITS} y ${BARCODE_MAX_DIGITS} dígitos.`,
      ),
  })
  .strict();

export const setItemQuantitySchema = z
  .object({
    quantity: z
      .number({
        required_error: 'La cantidad es obligatoria.',
        invalid_type_error: 'La cantidad debe ser un número entero.',
      })
      .int('La cantidad debe ser un número entero.')
      .min(1, 'La cantidad debe ser al menos 1.')
      .max(MAX_CART_QUANTITY, `La cantidad no puede ser mayor que ${MAX_CART_QUANTITY}.`),
  })
  .strict();

export const productIdParamSchema = z.object({
  productId: z.coerce
    .number({ invalid_type_error: 'El producto debe ser un número.' })
    .int('El producto debe ser un número entero.')
    .positive('El producto debe ser mayor que cero.'),
});

export type AddItemInput = z.infer<typeof addItemSchema>;
export type SetItemQuantityInput = z.infer<typeof setItemQuantitySchema>;
