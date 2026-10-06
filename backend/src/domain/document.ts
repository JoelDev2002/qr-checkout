/** Reglas del comprobante simulado y de su numeración (RN-11, RN-23). Sin base de datos ni Express. */

export type DocType = 'TICKET' | 'BOLETA' | 'FACTURA';

export const DNI_DIGITS = 8;
export const RUC_DIGITS = 11;
export const RECEIPT_NUMBER_DIGITS = 6;

/** RN-23: cada tipo de comprobante lleva su propia serie. */
export const DOC_SERIES: Record<DocType, string> = {
  TICKET: 'T001',
  BOLETA: 'B001',
  FACTURA: 'F001',
};

/** RN-11: qué documento exige cada comprobante. El ticket no lleva documento. */
const BUYER_DOC_TYPE: Record<DocType, 'DNI' | 'RUC' | null> = {
  TICKET: null,
  BOLETA: 'DNI',
  FACTURA: 'RUC',
};

/** Lo que la venta guarda del comprador: el tipo de documento en sus dos versiones. */
export type Buyer = {
  docType: 'DNI' | 'RUC' | null;
  docNumber: string | null;
  name: string | null;
};

export type BuyerInput = {
  docType: DocType;
  docNumber: string | undefined;
  name: string | undefined;
};

export type BuyerResolution = { ok: true; buyer: Buyer } | { ok: false; message: string };

/** Los espacios que el cajero pega al teclear no cambian el documento. */
export function normalizeDocNumber(value: string): string {
  return value.replace(/\s+/g, '');
}

export function normalizeBuyerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function docSeriesOf(docType: DocType): string {
  return DOC_SERIES[docType];
}

/** RN-23: T001-000001, B001-000124… Siempre seis dígitos después del guion. */
export function formatReceiptNumber(series: string, lastNumber: number): string {
  return `${series}-${String(lastNumber).padStart(RECEIPT_NUMBER_DIGITS, '0')}`;
}

function hasOnlyDigits(value: string, digits: number): boolean {
  return new RegExp(`^\\d{${digits}}$`).test(value);
}

/** RN-11: el ticket no pide documento, la boleta exige DNI de 8 dígitos y la factura RUC de 11 y razón social. */
export function resolveBuyer(input: BuyerInput): BuyerResolution {
  const docNumber =
    input.docNumber === undefined || input.docNumber === '' ? null : normalizeDocNumber(input.docNumber);
  const name = input.name === undefined ? null : normalizeBuyerName(input.name);
  const buyerName = name === '' ? null : name;
  const docType = BUYER_DOC_TYPE[input.docType];

  if (docType === null) {
    if (docNumber !== null) {
      return { ok: false, message: 'El ticket no lleva número de documento.' };
    }

    return { ok: true, buyer: { docType: null, docNumber: null, name: buyerName } };
  }

  if (docNumber === null) {
    return { ok: false, message: `Falta el ${docType} del comprador.` };
  }

  if (docType === 'DNI' && !hasOnlyDigits(docNumber, DNI_DIGITS)) {
    return { ok: false, message: `El DNI debe tener ${DNI_DIGITS} dígitos.` };
  }

  if (docType === 'RUC') {
    if (!hasOnlyDigits(docNumber, RUC_DIGITS)) {
      return { ok: false, message: `El RUC debe tener ${RUC_DIGITS} dígitos.` };
    }

    if (buyerName === null) {
      return { ok: false, message: 'Falta la razón social para la factura.' };
    }
  }

  return { ok: true, buyer: { docType, docNumber, name: buyerName } };
}