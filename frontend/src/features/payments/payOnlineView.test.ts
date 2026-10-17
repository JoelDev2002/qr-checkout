import { describe, expect, it } from 'vitest';
import { payOnlineView } from './payOnlineView';

describe('payOnlineView', () => {
  it('pago aprobado con el carrito ya vacío muestra la pantalla de éxito', () => {
    const view = payOnlineView({
      cart: { status: 'OPEN', items: [] },
      loading: false,
      result: { kind: 'approved' },
      sale: { id: 7 },
    });

    expect(view).toBe('approved');
  });

  it('un pago aprobado se mantiene aunque el carrito todavía no se haya recargado', () => {
    const view = payOnlineView({
      cart: null,
      loading: false,
      result: { kind: 'approved' },
      sale: { id: 7 },
    });

    expect(view).toBe('approved');
  });

  it('sin resultado y con el carrito vacío lleva al historial', () => {
    const view = payOnlineView({
      cart: { status: 'OPEN', items: [] },
      loading: false,
      result: null,
      sale: null,
    });

    expect(view).toBe('nothingToPay');
  });

  it('sin resultado y con ítems muestra el formulario de pago', () => {
    const view = payOnlineView({
      cart: { status: 'OPEN', items: [{}] },
      loading: false,
      result: null,
      sale: null,
    });

    expect(view).toBe('payable');
  });

  it('mientras el carrito carga muestra la carga y, si falla, el error', () => {
    expect(payOnlineView({ cart: null, loading: true, result: null, sale: null })).toBe('loading');
    expect(payOnlineView({ cart: null, loading: false, result: null, sale: null })).toBe('error');
  });
});
