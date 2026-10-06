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

export const BUYER_DOC_NUMBER_MAX_LENGTH = 20;
export const BUYER_NAME_MAX_LENGTH = 120;

/**
 * RN-07: el cuerpo solo lleva lo que el cajero elige. Estricto para que un total o un precio enviado
 * por el navegador se rechace en lugar de ignorarse en silencio.
 */
export const confirmCheckoutSchema = z
  .object({
    paymentMethod: z.enum(['CMR_CARD', 'OTHER_CARD', 'CASH'], {
      errorMap: () => ({ message: 'El medio de pago debe ser CMR_CARD, OTHER_CARD o CASH.' }),
    }),
    docType: z.enum(['TICKET', 'BOLETA', 'FACTURA'], {
      errorMap: () => ({ message: 'El comprobante debe ser TICKET, BOLETA o FACTURA.' }),
    }),
    /** El formato del documento y la razón social los revisa domain/document (RN-11). */
    buyerDocNumber: z
      .string({ invalid_type_error: 'El documento del comprador debe ser un texto.' })
      .max(
        BUYER_DOC_NUMBER_MAX_LENGTH,
        `El documento del comprador no puede tener más de ${BUYER_DOC_NUMBER_MAX_LENGTH} caracteres.`,
      )
      .optional(),
    buyerName: z
      .string({ invalid_type_error: 'El nombre del comprador debe ser un texto.' })
      .max(
        BUYER_NAME_MAX_LENGTH,
        `El nombre del comprador no puede tener más de ${BUYER_NAME_MAX_LENGTH} caracteres.`,
      )
      .optional(),
  })
  .strict();

export type CartCodeParams = z.infer<typeof cartCodeParamSchema>;
export type ConfirmCheckoutInput = z.infer<typeof confirmCheckoutSchema>;
