import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  addCartItem,
  cancelCartQr,
  clearCart,
  generateCartQr,
  getCart,
  removeCartItem,
  setCartItemQuantity,
  type CartView,
} from '../../services/cart';
import { UNEXPECTED_MESSAGE } from './messages';
import { ApiError } from '../../services/api';

export type CartContextValue = {
  cart: CartView | null;
  loading: boolean;
  /** Error al cargar el carrito; los errores de las acciones se los queda quien las llama. */
  error: string | null;
  /** Unidades totales del carrito, para la barra inferior. */
  totalUnits: number;
  reload: () => Promise<void>;
  addByBarcode: (barcode: string) => Promise<CartView>;
  setQuantity: (productId: number, quantity: number) => Promise<CartView>;
  removeItem: (productId: number) => Promise<CartView>;
  clear: () => Promise<CartView>;
  generateQr: () => Promise<CartView>;
  cancelQr: () => Promise<CartView>;
};

const CartContext = createContext<CartContextValue | null>(null);

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE;
}

/** Estado del carrito del cliente con las acciones que devuelven el carrito actualizado (T2.1). */
export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setCart(await getCart());
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const apply = useCallback(async (action: () => Promise<CartView>): Promise<CartView> => {
    const result = await action();
    setCart(result);

    return result;
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      loading,
      error,
      totalUnits: cart === null ? 0 : cart.items.reduce((total, item) => total + item.quantity, 0),
      reload,
      addByBarcode: (barcode) => apply(() => addCartItem(barcode)),
      setQuantity: (productId, quantity) => apply(() => setCartItemQuantity(productId, quantity)),
      removeItem: (productId) => apply(() => removeCartItem(productId)),
      clear: () => apply(() => clearCart()),
      generateQr: () => apply(() => generateCartQr()),
      cancelQr: () => apply(() => cancelCartQr()),
    }),
    [cart, loading, error, reload, apply],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);

  if (value === null) {
    throw new Error('useCart debe usarse dentro de CartProvider.');
  }

  return value;
}
