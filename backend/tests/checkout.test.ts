import { describe, expect, it } from 'vitest';
import { priceAppliedFor, resolveCharge } from '../src/domain/checkout.js';
import { docSeriesOf, formatReceiptNumber, resolveBuyer } from '../src/domain/document.js';
import type { CartItemPrices } from '../src/domain/pricing.js';

/** Audífonos de la tabla de ARCHITECTURE.md §10 con la oferta de 5000 céntimos: 3990 y 3790. */
const AUDIFONOS: CartItemPrices = { quantity: 1, originalCents: 8990, normalCents: 3990, cmrCents: 3790 };
const CAMA: CartItemPrices = { quantity: 2, originalCents: 424900, normalCents: 249900, cmrCents: 244900 };

describe('precio aplicado y monto cobrado (RN-03)', () => {
  it('con tarjeta CMR cobra el total CMR', () => {
    const charge = resolveCharge('CMR_CARD', [AUDIFONOS, CAMA]);

    expect(charge.priceApplied).toBe('CMR');
    expect(charge.summary.cmrTotalCents).toBe(493590);
    expect(charge.totalCents).toBe(charge.summary.cmrTotalCents);
  });

  it('con otra tarjeta o en efectivo cobra el total de oferta', () => {
    for (const medio of ['OTHER_CARD', 'CASH'] as const) {
      const charge = resolveCharge(medio, [AUDIFONOS, CAMA]);

      expect(charge.priceApplied, medio).toBe('NORMAL');
      expect(charge.totalCents, medio).toBe(charge.summary.normalTotalCents);
    }
  });

  it('el tipo de precio depende solo del medio de pago', () => {
    expect(priceAppliedFor('CMR_CARD')).toBe('CMR');
    expect(priceAppliedFor('OTHER_CARD')).toBe('NORMAL');
    expect(priceAppliedFor('CASH')).toBe('NORMAL');
  });

  it('cada ítem guarda su precio unitario cobrado y su subtotal (RN-09)', () => {
    const cmr = resolveCharge('CMR_CARD', [AUDIFONOS, CAMA]);

    expect(cmr.items).toEqual([
      { ...AUDIFONOS, paidPriceCents: 3790, subtotalCents: 3790 },
      { ...CAMA, paidPriceCents: 244900, subtotalCents: 489800 },
    ]);

    const efectivo = resolveCharge('CASH', [AUDIFONOS, CAMA]);

    expect(efectivo.items).toEqual([
      { ...AUDIFONOS, paidPriceCents: 3990, subtotalCents: 3990 },
      { ...CAMA, paidPriceCents: 249900, subtotalCents: 499800 },
    ]);
  });

  it('los subtotales suman el monto cobrado', () => {
    for (const medio of ['CMR_CARD', 'OTHER_CARD', 'CASH'] as const) {
      const charge = resolveCharge(medio, [AUDIFONOS, CAMA]);

      expect(charge.items.reduce((total, item) => total + item.subtotalCents, 0), medio).toBe(charge.totalCents);
    }
  });
});

describe('series y numeración de comprobantes (RN-23)', () => {
  it('cada tipo de comprobante tiene su serie', () => {
    expect(docSeriesOf('TICKET')).toBe('T001');
    expect(docSeriesOf('BOLETA')).toBe('B001');
    expect(docSeriesOf('FACTURA')).toBe('F001');
  });

  it('el número se arma con seis dígitos', () => {
    expect(formatReceiptNumber('T001', 1)).toBe('T001-000001');
    expect(formatReceiptNumber('B001', 2)).toBe('B001-000002');
    expect(formatReceiptNumber('F001', 124)).toBe('F001-000124');
    expect(formatReceiptNumber('T001', 1000000)).toBe('T001-1000000');
  });
});

describe('datos del comprador por tipo de comprobante (RN-11)', () => {
  it('el ticket no lleva documento y guarda el nombre si viene', () => {
    expect(resolveBuyer({ docType: 'TICKET', docNumber: undefined, name: undefined })).toEqual({
      ok: true,
      buyer: { docType: null, docNumber: null, name: null },
    });

    expect(resolveBuyer({ docType: 'TICKET', docNumber: undefined, name: '  María   Cliente ' })).toEqual({
      ok: true,
      buyer: { docType: null, docNumber: null, name: 'María Cliente' },
    });
  });

  it('el ticket rechaza que le pasen un documento', () => {
    expect(resolveBuyer({ docType: 'TICKET', docNumber: '12345678', name: undefined })).toEqual({
      ok: false,
      message: 'El ticket no lleva número de documento.',
    });
  });

  it('la boleta exige un DNI de 8 dígitos y lo guarda como DNI', () => {
    expect(resolveBuyer({ docType: 'BOLETA', docNumber: '12345678', name: undefined })).toEqual({
      ok: true,
      buyer: { docType: 'DNI', docNumber: '12345678', name: null },
    });

    expect(resolveBuyer({ docType: 'BOLETA', docNumber: ' 1234 5678 ', name: 'María Cliente' })).toEqual({
      ok: true,
      buyer: { docType: 'DNI', docNumber: '12345678', name: 'María Cliente' },
    });
  });

  it('la boleta no acepta un DNI de otra longitud', () => {
    expect(resolveBuyer({ docType: 'BOLETA', docNumber: '1234567', name: undefined })).toEqual({
      ok: false,
      message: 'El DNI debe tener 8 dígitos.',
    });

    expect(resolveBuyer({ docType: 'BOLETA', docNumber: '123456789', name: undefined })).toEqual({
      ok: false,
      message: 'El DNI debe tener 8 dígitos.',
    });

    expect(resolveBuyer({ docType: 'BOLETA', docNumber: '1234567a', name: undefined })).toEqual({
      ok: false,
      message: 'El DNI debe tener 8 dígitos.',
    });
  });

  it('la boleta sin documento dice que falta el DNI', () => {
    expect(resolveBuyer({ docType: 'BOLETA', docNumber: undefined, name: 'María Cliente' })).toEqual({
      ok: false,
      message: 'Falta el DNI del comprador.',
    });
  });

  it('la factura exige un RUC de 11 dígitos y razón social, y los guarda como RUC', () => {
    expect(resolveBuyer({ docType: 'FACTURA', docNumber: '20123456789', name: 'Saga Falabella Puruchuco' })).toEqual({
      ok: true,
      buyer: { docType: 'RUC', docNumber: '20123456789', name: 'Saga Falabella Puruchuco' },
    });
  });

  it('la factura no acepta un RUC de otra longitud', () => {
    expect(resolveBuyer({ docType: 'FACTURA', docNumber: '2012345678', name: 'Saga' })).toEqual({
      ok: false,
      message: 'El RUC debe tener 11 dígitos.',
    });

    expect(resolveBuyer({ docType: 'FACTURA', docNumber: undefined, name: 'Saga' })).toEqual({
      ok: false,
      message: 'Falta el RUC del comprador.',
    });
  });

  it('la factura sin razón social no se puede emitir', () => {
    expect(resolveBuyer({ docType: 'FACTURA', docNumber: '20123456789', name: undefined })).toEqual({
      ok: false,
      message: 'Falta la razón social para la factura.',
    });

    expect(resolveBuyer({ docType: 'FACTURA', docNumber: '20123456789', name: '   ' })).toEqual({
      ok: false,
      message: 'Falta la razón social para la factura.',
    });
  });
});