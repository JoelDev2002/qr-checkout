import { z } from 'zod';
import { isValidCartCode } from '../../domain/cartCode.js';

/** El cajero teclea el código como lo lea: en minúsculas o con espacios pegados (RN-05). */
export function normalizeCartCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export const cartCodeParamSchema = z.object({
  code: z
    .string({ required_error: 'El código del QR es obligatorio.' })
    .transform(normalizeCartCode)
    .refine(isValidCartCode, 'El código del QR no tiene el formato válido.'),
});

export type CartCodeParams = z.infer<typeof cartCodeParamSchema>;
