// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { CartItem } from '../../services/cart';
import { CartPeek } from './CartPeek';

afterEach(cleanup);

function item(overrides: Partial<CartItem> = {}): CartItem {
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
    issue: null,
    ...overrides,
  };
}

function renderPeek(items: CartItem[]) {
  return render(
    <MemoryRouter>
      <CartPeek items={items} />
    </MemoryRouter>,
  );
}

describe('CartPeek', () => {
  it('muestra cuántos productos escaneados hay', () => {
    renderPeek([item(), item({ productId: 8, name: 'Galaxy A55' })]);

    expect(screen.getByText('En tu carrito (2)')).toBeTruthy();
  });

  it('empieza plegado y, al abrir, lista nombre, cantidad y precios', async () => {
    const user = userEvent.setup();
    renderPeek([item()]);

    expect(screen.queryByText('Redmi Buds 6')).toBeNull();

    await user.click(screen.getByRole('button', { name: /En tu carrito/ }));

    expect(screen.getByText('Redmi Buds 6')).toBeTruthy();
    expect(screen.getByText('× 2')).toBeTruthy();
    expect(screen.getByText('S/ 39.90')).toBeTruthy();
    expect(screen.getByText('S/ 37.90 con CMR')).toBeTruthy();
  });

  it('sin descuento CMR no muestra la línea con CMR', async () => {
    const user = userEvent.setup();
    renderPeek([item({ hasCmrDiscount: false })]);

    await user.click(screen.getByRole('button', { name: /En tu carrito/ }));

    expect(screen.queryByText(/con CMR/)).toBeNull();
  });
});
