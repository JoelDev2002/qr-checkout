import { describe, expect, it } from 'vitest';
import type { CartItem, InstallmentOption } from '../../services/cart';
import {
  DEFAULT_INSTALLMENT_COUNT,
  hasBlockingIssue,
  INACTIVE_ISSUE_MESSAGE,
  defaultInstallmentCount,
  itemIssueMessage,
  STOCK_ISSUE_MESSAGE,
} from './cartRules';

function cartItem(issue: CartItem['issue']): CartItem {
  return {
    productId: 1,
    barcode: '7751234567890',
    name: 'Producto',
    brand: 'Marca',
    quantity: 1,
    maxQuantity: 5,
    originalPriceCents: 10000,
    offerPriceCents: 9000,
    cmrPriceCents: 8500,
    hasCmrDiscount: true,
    campaignName: null,
    issue,
  };
}

describe('itemIssueMessage', () => {
  it('traduce un ítem inactivo a un aviso para el cliente', () => {
    expect(itemIssueMessage('INACTIVE')).toBe(INACTIVE_ISSUE_MESSAGE);
  });

  it('traduce stock insuficiente a un aviso de ajustar o quitar', () => {
    expect(itemIssueMessage('INSUFFICIENT_STOCK')).toBe(STOCK_ISSUE_MESSAGE);
  });

  it('sin problema no hay aviso', () => {
    expect(itemIssueMessage(null)).toBeNull();
  });
});

describe('hasBlockingIssue', () => {
  it('bloquea el QR si un ítem está inactivo', () => {
    expect(hasBlockingIssue([cartItem(null), cartItem('INACTIVE')])).toBe(true);
  });

  it('bloquea el QR si un ítem no tiene stock', () => {
    expect(hasBlockingIssue([cartItem('INSUFFICIENT_STOCK')])).toBe(true);
  });

  it('no bloquea si todos los ítems están bien', () => {
    expect(hasBlockingIssue([cartItem(null)])).toBe(false);
  });
});

describe('defaultInstallmentCount', () => {
  const options: InstallmentOption[] = [
    { count: 3, installmentCents: 1000, firstInstallmentCents: 1002 },
    { count: 6, installmentCents: 500, firstInstallmentCents: 500 },
    { count: 12, installmentCents: 250, firstInstallmentCents: 252 },
  ];

  it('elige 6 si el servidor la ofrece', () => {
    expect(defaultInstallmentCount(options)).toBe(DEFAULT_INSTALLMENT_COUNT);
  });

  it('sin 6 usa la primera opción', () => {
    const withoutSix = options.filter((option) => option.count !== 6);
    expect(defaultInstallmentCount(withoutSix)).toBe(3);
  });

  it('sin opciones devuelve null', () => {
    expect(defaultInstallmentCount([])).toBeNull();
  });
});