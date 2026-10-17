import { describe, expect, it } from 'vitest';
import { buildPaymentBody, isComprobanteValid, validateComprobante } from './comprobante';

describe('validación de comprobante', () => {
  it('TICKET es válido sin documento', () => {
    expect(isComprobanteValid({ docType: 'TICKET', buyerDocNumber: '', buyerName: '' })).toBe(true);
    expect(validateComprobante({ docType: 'TICKET', buyerDocNumber: '', buyerName: '' })).toBeNull();
  });

  it('BOLETA requiere DNI de 8 dígitos', () => {
    expect(isComprobanteValid({ docType: 'BOLETA', buyerDocNumber: '', buyerName: '' })).toBe(false);
    const msg = validateComprobante({ docType: 'BOLETA', buyerDocNumber: '1234567', buyerName: '' });
    expect(msg).toMatch(/DNI/);
    expect(isComprobanteValid({ docType: 'BOLETA', buyerDocNumber: '12345678', buyerName: '' })).toBe(true);
  });

  it('FACTURA requiere RUC de 11 y razón social', () => {
    expect(isComprobanteValid({ docType: 'FACTURA', buyerDocNumber: '12345678901', buyerName: '' })).toBe(false);
    expect(isComprobanteValid({ docType: 'FACTURA', buyerDocNumber: '1234567890', buyerName: 'Empresa' })).toBe(false);
    expect(isComprobanteValid({ docType: 'FACTURA', buyerDocNumber: '12345678901', buyerName: 'Empresa' })).toBe(true);
  });

  it('arma cuerpo correctamente sin enviar datos vacíos', () => {
    const body = buildPaymentBody({
      token: 'tok_123',
      paymentMethodId: 'visa',
      docType: 'BOLETA',
      buyerDocNumber: ' 12345678 ',
      buyerName: '  Juan  ',
      expectedAmountCents: 1000,
      cardLast4: ' 1234 ',
    });
    expect(body.token).toBe('tok_123');
    expect(body.expectedAmountCents).toBe(1000);
    expect(body.buyerDocNumber).toBe('12345678');
    expect(body.buyerName).toBe('Juan');
    expect(body.cardLast4).toBe('1234');
    expect(body.docType).toBe('BOLETA');
  });
});
