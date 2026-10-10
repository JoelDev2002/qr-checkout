import { describe, expect, it } from 'vitest';
import { ApiError } from '../../services/api';
import {
  ALREADY_PAID_MESSAGE,
  buildConfirmBody,
  CART_NOT_PENDING_MESSAGE,
  checkoutErrorMessage,
  CODE_NOT_FOUND_MESSAGE,
  documentIssue,
  isValidCartCode,
  isValidDni,
  isValidRuc,
  normalizeCartCode,
  normalizeDocNumber,
  QR_EXPIRED_MESSAGE,
  RATE_LIMITED_MESSAGE,
  receiptPaymentMethod,
  shouldRestartScan,
} from './checkout';

describe('normalizeCartCode', () => {
  it('deja el código en mayúsculas y sin espacios', () => {
    expect(normalizeCartCode(' c-8f3k2 ')).toBe('C-8F3K2');
    expect(normalizeCartCode('C - 8 F 3 K 2')).toBe('C-8F3K2');
  });

  it('valida el formato C-XXXXX con el alfabeto del backend', () => {
    expect(isValidCartCode('C-8F3K2')).toBe(true);
    expect(isValidCartCode('C-8F3K')).toBe(false);
    expect(isValidCartCode('C-8F3K0')).toBe(false);
    expect(isValidCartCode('X-8F3K2')).toBe(false);
    expect(isValidCartCode('')).toBe(false);
  });
});

describe('documento del comprador', () => {
  it('el ticket no pide documento', () => {
    expect(documentIssue('TICKET', '', '')).toBeNull();
  });

  it('la boleta exige DNI de 8 dígitos', () => {
    expect(documentIssue('BOLETA', '', '')).toBe('Falta el DNI del comprador.');
    expect(documentIssue('BOLETA', '1234567', '')).toBe('El DNI debe tener 8 dígitos.');
    expect(documentIssue('BOLETA', '12345678', '')).toBeNull();
    expect(isValidDni('12345678')).toBe(true);
    expect(isValidDni('1234567a')).toBe(false);
  });

  it('la factura exige RUC de 11 dígitos y razón social', () => {
    expect(documentIssue('FACTURA', '', '')).toBe('Falta el RUC del comprador.');
    expect(documentIssue('FACTURA', '2012345678', '')).toBe('El RUC debe tener 11 dígitos.');
    expect(documentIssue('FACTURA', '20123456789', '')).toBe('Falta la razón social para la factura.');
    expect(documentIssue('FACTURA', '20123456789', 'Saga Falabella')).toBeNull();
    expect(isValidRuc('20123456789')).toBe(true);
    expect(isValidRuc('2012345678')).toBe(false);
  });

  it('los espacios pegados al teclear no rompen el número', () => {
    expect(normalizeDocNumber(' 1234 5678 ')).toBe('12345678');
  });
});

describe('buildConfirmBody', () => {
  it('el ticket no lleva datos del comprador', () => {
    expect(buildConfirmBody({ paymentMethod: 'CASH', docType: 'TICKET', docNumber: '', buyerName: '' })).toEqual({
      paymentMethod: 'CASH',
      docType: 'TICKET',
    });
  });

  it('la boleta lleva solo el DNI normalizado', () => {
    expect(
      buildConfirmBody({
        paymentMethod: 'OTHER_CARD',
        docType: 'BOLETA',
        docNumber: ' 1234 5678 ',
        buyerName: 'Juan Pérez',
      }),
    ).toEqual({
      paymentMethod: 'OTHER_CARD',
      docType: 'BOLETA',
      buyerDocNumber: '12345678',
    });
  });

  it('la factura lleva el RUC y la razón social', () => {
    expect(
      buildConfirmBody({
        paymentMethod: 'CMR_CARD',
        docType: 'FACTURA',
        docNumber: '20123456789',
        buyerName: '  Saga   Falabella ',
      }),
    ).toEqual({
      paymentMethod: 'CMR_CARD',
      docType: 'FACTURA',
      buyerDocNumber: '20123456789',
      buyerName: 'Saga Falabella',
    });
  });

  it('nunca incluye precios ni totales', () => {
    const body = buildConfirmBody({
      paymentMethod: 'CMR_CARD',
      docType: 'BOLETA',
      docNumber: '12345678',
      buyerName: '',
    });

    expect(Object.keys(body).sort()).toEqual(['buyerDocNumber', 'docType', 'paymentMethod']);
  });
});

describe('receiptPaymentMethod', () => {
  it('traduce los medios de caja a los nombres que muestra el comprobante', () => {
    expect(receiptPaymentMethod('CMR_CARD')).toBe('CMR');
    expect(receiptPaymentMethod('OTHER_CARD')).toBe('CARD');
    expect(receiptPaymentMethod('CASH')).toBe('CASH');
    expect(receiptPaymentMethod('ONLINE')).toBe('ONLINE');
  });
});

describe('checkoutErrorMessage', () => {
  it('usa el texto exacto de DESIGN.md §5 para el QR vencido y el ya cobrado', () => {
    expect(checkoutErrorMessage(new ApiError('QR_EXPIRED', 'otro texto'))).toBe(QR_EXPIRED_MESSAGE);
    expect(checkoutErrorMessage(new ApiError('ALREADY_PAID', 'otro texto'))).toBe(ALREADY_PAID_MESSAGE);
  });

  it('explica el código inexistente y el límite de intentos', () => {
    expect(checkoutErrorMessage(new ApiError('NOT_FOUND', 'Código no válido o vencido'))).toBe(
      CODE_NOT_FOUND_MESSAGE,
    );
    expect(checkoutErrorMessage(new ApiError('TOO_MANY_REQUESTS', 'Demasiados intentos.'))).toBe(
      RATE_LIMITED_MESSAGE,
    );
    expect(checkoutErrorMessage(new ApiError('CART_NOT_PENDING', 'otro texto'))).toBe(
      CART_NOT_PENDING_MESSAGE,
    );
  });

  it('conserva el mensaje del stock, que ya indica el producto', () => {
    const error = new ApiError('OUT_OF_STOCK', 'No hay stock suficiente de Royal Prince King.');

    expect(checkoutErrorMessage(error)).toBe('No hay stock suficiente de Royal Prince King.');
  });

  it('un error desconocido no se muestra crudo', () => {
    expect(checkoutErrorMessage(new Error('boom'))).toBe(
      'Ocurrió un error inesperado. Inténtalo de nuevo.',
    );
  });
});

describe('shouldRestartScan', () => {
  it('obliga a escanear otro QR cuando el carrito ya no sirve', () => {
    expect(shouldRestartScan(new ApiError('QR_EXPIRED', ''))).toBe(true);
    expect(shouldRestartScan(new ApiError('ALREADY_PAID', ''))).toBe(true);
    expect(shouldRestartScan(new ApiError('NOT_FOUND', ''))).toBe(true);
    expect(shouldRestartScan(new ApiError('CART_NOT_PENDING', ''))).toBe(true);
  });

  it('mantiene la vista cuando el fallo se puede corregir (stock o documento)', () => {
    expect(shouldRestartScan(new ApiError('OUT_OF_STOCK', ''))).toBe(false);
    expect(shouldRestartScan(new ApiError('INVALID_DOCUMENT', ''))).toBe(false);
    expect(shouldRestartScan(new Error('boom'))).toBe(false);
  });
});
