// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CartItem, CartView } from '../../services/cart';
import type { CartContextValue } from './CartContext';

let cartValue: CartContextValue;

vi.mock('./CartContext', () => ({
  useCart: () => cartValue,
}));

import { MiniCart } from './MiniCart';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

function makeCart(items: CartItem[], status: CartView['status'] = 'OPEN'): CartView {
  return {
    id: 1,
    status,
    qrCode: null,
    qrExpiresAt: null,
    items,
    summary: {
      originalTotalCents: 0,
      discountTotalCents: 0,
      normalTotalCents: 0,
      cmrTotalCents: 0,
      cmrSavingCents: 0,
    },
    installments: [],
  };
}

function renderMiniCart(entries: string[], cart: CartView | null) {
  const setQuantity = vi.fn().mockResolvedValue(cart);
  const removeItem = vi.fn().mockResolvedValue(cart);

  cartValue = {
    cart,
    loading: false,
    error: null,
    totalUnits: cart === null ? 0 : cart.items.reduce((total, row) => total + row.quantity, 0),
    reload: vi.fn(),
    addByBarcode: vi.fn(),
    setQuantity,
    removeItem,
    clear: vi.fn(),
    generateQr: vi.fn(),
    cancelQr: vi.fn(),
  } as unknown as CartContextValue;

  render(
    <MemoryRouter initialEntries={entries}>
      <MiniCart />
    </MemoryRouter>,
  );

  return { setQuantity, removeItem };
}

describe('MiniCart', () => {
  it('no se muestra dentro del carrito', () => {
    renderMiniCart(['/cart'], makeCart([item()]));

    expect(screen.queryByRole('navigation', { name: 'Carrito' })).toBeNull();
  });

  it('no se muestra con el carrito vacío', () => {
    renderMiniCart(['/'], makeCart([]));

    expect(screen.queryByText(/^Carrito \(/)).toBeNull();
  });

  it('muestra el conteo y al abrir lista los productos con su contador', async () => {
    const user = userEvent.setup();
    renderMiniCart(['/'], makeCart([item(), item({ productId: 8, name: 'Galaxy A55', quantity: 1 })]));

    expect(screen.getByText('Carrito (3)')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Carrito \(3\)/ }));

    expect(screen.getByText('Redmi Buds 6')).toBeTruthy();
    expect(screen.getByText('Galaxy A55')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver y editar carrito' })).toBeTruthy();
  });

  it('sumar una unidad avisa al servidor', async () => {
    const user = userEvent.setup();
    const { setQuantity } = renderMiniCart(['/'], makeCart([item({ quantity: 1 })]));

    await user.click(screen.getByRole('button', { name: /Carrito \(1\)/ }));
    await user.click(screen.getByRole('button', { name: 'Agregar una unidad' }));

    await waitFor(() => expect(setQuantity).toHaveBeenCalledWith(7, 2), { timeout: 2000 });
  });

  it('restar en cantidad 1 quita el producto', async () => {
    const user = userEvent.setup();
    const { removeItem } = renderMiniCart(['/'], makeCart([item({ quantity: 1 })]));

    await user.click(screen.getByRole('button', { name: /Carrito \(1\)/ }));
    await user.click(screen.getByRole('button', { name: 'Quitar una unidad' }));

    await waitFor(() => expect(removeItem).toHaveBeenCalledWith(7), { timeout: 2000 });
  });

  it('con el carrito bloqueado por un QR el contador queda deshabilitado', async () => {
    const user = userEvent.setup();
    renderMiniCart(['/'], makeCart([item()], 'PENDING'));

    await user.click(screen.getByRole('button', { name: /Carrito \(2\)/ }));

    expect(
      (screen.getByRole('button', { name: 'Agregar una unidad' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
