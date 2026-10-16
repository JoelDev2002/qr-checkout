import { z } from 'zod';

export const BUYER_DOC_NUMBER_MAX_LENGTH = 20;
export const BUYER_NAME_MAX_LENGTH = 120;
const TOKEN_MAX_LENGTH = 200;
const PAYMENT_METHOD_MAX_LENGTH = 50;

/**
 * RN-20: el cuerpo solo lleva lo que el navegador no puede usar para decidir el precio. Estricto para
 * que un total o cualquier dato que cambie el monto se rechace en lugar de ignorarse en silencio.
 * El correo del pagador no viene de aquí: se toma de la cuenta del cliente en la base.
 */
export const onlinePaymentSchema = z
  .object({
    token: z
      .string({ required_error: 'Falta el token de la tarjeta.', invalid_type_error: 'El token de la tarjeta debe ser un texto.' })
      .min(1, 'El token de la tarjeta no puede estar vacío.')
      .max(TOKEN_MAX_LENGTH, `El token de la tarjeta no puede tener más de ${TOKEN_MAX_LENGTH} caracteres.`),
    paymentMethodId: z
      .string({ required_error: 'Falta el medio de pago.', invalid_type_error: 'El medio de pago debe ser un texto.' })
      .min(1, 'El medio de pago no puede estar vacío.')
      .max(PAYMENT_METHOD_MAX_LENGTH, `El medio de pago no puede tener más de ${PAYMENT_METHOD_MAX_LENGTH} caracteres.`),
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
    /** Monto que el navegador vio en pantalla: el servidor solo lo usa para detectar un cambio de precio. */
    expectedAmountCents: z
      .number({
        required_error: 'Falta el monto esperado.',
        invalid_type_error: 'El monto esperado debe ser un número entero de céntimos.',
      })
      .int('El monto esperado debe ser un número entero de céntimos.')
      .positive('El monto esperado debe ser mayor que cero.'),
    /** Solo informativo: nunca decide nada (RN-20). */
    cardLast4: z
      .string({ invalid_type_error: 'Los últimos 4 dígitos de la tarjeta deben ser un texto.' })
      .regex(/^\d{4}$/, 'Los últimos 4 dígitos de la tarjeta deben ser exactamente 4 dígitos.')
      .optional(),
  })
  .strict();

export type OnlinePaymentInput = z.infer<typeof onlinePaymentSchema>;
