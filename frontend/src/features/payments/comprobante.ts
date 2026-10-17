import type { DocType, OnlinePaymentRequest } from '../../services/payments';

export type ComprobanteForm = {
  docType: DocType;
  buyerDocNumber: string;
  buyerName: string;
};

const DNI_REGEX = /^\d{8}$/;
const RUC_REGEX = /^\d{11}$/;

/** Valida el comprobante en línea (DESIGN §4 cliente punto 6, RN-20). Devuelve el error o null. */
export function validateComprobante(form: ComprobanteForm): string | null {
  if (form.docType === 'TICKET') {
    return null;
  }

  const doc = form.buyerDocNumber.trim();

  if (form.docType === 'BOLETA') {
    if (doc.length === 0) {
      return 'Ingresa el DNI (8 dígitos).';
    }

    if (!DNI_REGEX.test(doc)) {
      return 'El DNI debe tener 8 dígitos numéricos.';
    }

    return null;
  }

  if (form.docType === 'FACTURA') {
    if (doc.length === 0) {
      return 'Ingresa el RUC (11 dígitos).';
    }

    if (!RUC_REGEX.test(doc)) {
      return 'El RUC debe tener 11 dígitos numéricos.';
    }

    if (form.buyerName.trim().length === 0) {
      return 'Ingresa la razón social.';
    }

    return null;
  }

  return null;
}

export function isComprobanteValid(form: ComprobanteForm): boolean {
  return validateComprobante(form) === null;
}

/**
 * Arma el cuerpo de POST /payments/online con los campos del esquema estricto del backend.
 * Nunca incluye el BIN (RN-20) ni un monto distinto al total de oferta mostrado.
 */
export function buildPaymentBody(input: OnlinePaymentRequest): OnlinePaymentRequest {
  const body: OnlinePaymentRequest = {
    token: input.token,
    paymentMethodId: input.paymentMethodId,
    docType: input.docType,
    expectedAmountCents: input.expectedAmountCents,
  };

  const buyerDocNumber = input.buyerDocNumber?.trim();
  if (buyerDocNumber) {
    body.buyerDocNumber = buyerDocNumber;
  }

  const buyerName = input.buyerName?.trim();
  if (buyerName) {
    body.buyerName = buyerName;
  }

  const cardLast4 = input.cardLast4?.trim();
  if (cardLast4) {
    body.cardLast4 = cardLast4;
  }

  return body;
}
