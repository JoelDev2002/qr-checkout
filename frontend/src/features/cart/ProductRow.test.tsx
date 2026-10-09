// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CartItem } from '../../services/cart';
import { INACTIVE_ISSUE_MESSAGE, STOCK_ISSUE_MESSAGE } from './cartRules';
import { ProductRow } from './ProductRow';

afterEach(cleanup);

function item(issue: CartItem['issue']): CartItem {
  return {
    productId: 7,
    barcode: '7751234567890',
    name: 'Redmi Buds 6',
    brand: 'Xiaomi',
    quantity: 2,
    maxQuantity: 4,
    originalPriceCents: 8990,
    offerPriceCents: 3990,
    cmrPriceCents: 3790,
    hasCmrDiscount: true,
    campaignName: 'Campaña Audio',
    issue,
  };
}

function renderRow(overrides: { issue?: CartItem['issue']; disabled?: boolean } = {}) {
  const user = userEvent.setup();
  const onRemove = vi.fn();
  const onRequestRemove = vi.fn();
  const onChangeQuantity = vi.fn();

  render(
    <ProductRow
      item={item(overrides.issue ?? null)}
      quantity={2}
      disabled={overrides.disabled ?? false}
      onChangeQuantity={onChangeQuantity}
      onRequestRemove={onRequestRemove}
      onRemove={onRemove}
    />,
  );

  return { user, onRemove, onRequestRemove, onChangeQuantity };
}

describe('ProductRow', () => {
  it('muestra nombre, marca, PriceTag compacto y el botón quitar', () => {
    renderRow();

    expect(screen.getByText('Redmi Buds 6')).toBeTruthy();
    expect(screen.getByText('Xiaomi')).toBeTruthy();
    expect(screen.getByText('Oferta')).toBeTruthy();
    expect(screen.getByText('Campaña Audio')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quitar Redmi Buds 6 del carrito' })).toBeTruthy();
  });

  it('con issue INACTIVE muestra el aviso y lo bloquea', () => {
    renderRow({ issue: 'INACTIVE' });

    expect(screen.getByRole('alert').textContent).toBe(INACTIVE_ISSUE_MESSAGE);
  });

  it('con issue INSUFFICIENT_STOCK muestra el aviso de stock', () => {
    renderRow({ issue: 'INSUFFICIENT_STOCK' });

    expect(screen.getByRole('alert').textContent).toBe(STOCK_ISSUE_MESSAGE);
  });

  it('sin issue no muestra ningún aviso', () => {
    renderRow();

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('quitar avisa a quien lo usa', async () => {
    const { user, onRemove } = renderRow();

    await user.click(screen.getByRole('button', { name: 'Quitar Redmi Buds 6 del carrito' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('con el carrito bloqueado el botón quitar queda deshabilitado', () => {
    renderRow({ disabled: true });

    expect(
      (screen.getByRole('button', { name: 'Quitar Redmi Buds 6 del carrito' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});