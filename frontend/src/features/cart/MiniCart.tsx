import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatMoney } from '../../lib/money';
import { useCart } from './CartContext';
import { cartErrorMessage } from './messages';
import { QuantityStepper } from './QuantityStepper';
import { createQuantityDebouncer, type QuantityDebouncer } from './quantityDebounce';

type QuantityPayload = { productId: number; quantity: number };

const toggleButtonClass =
  'flex min-h-[44px] flex-1 items-center justify-between gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

const editLinkClass =
  'flex min-h-[44px] items-center justify-center rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

/**
 * Mini-carrito de la barra inferior (DESIGN §4, cliente punto 2): se despliega sobre el escáner y
 * deja ajustar las cantidades con ± sin salir de la cámara. Esconde la barra en el carrito, donde sobra.
 */
export function MiniCart() {
  const location = useLocation();
  const { cart, totalUnits, setQuantity, removeItem } = useCart();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, number>>({});

  const commitRef = useRef<(payload: QuantityPayload) => void>(() => {});
  const debouncersRef = useRef(new Map<number, QuantityDebouncer<QuantityPayload>>());

  useEffect(() => {
    commitRef.current = (payload) => {
      void commitQuantity(payload);
    };
  });

  useEffect(() => {
    const debouncers = debouncersRef.current;

    return () => {
      debouncers.forEach((debouncer) => debouncer.cancel());
    };
  }, []);

  // Al cambiar de pantalla, la lista vuelve a su estado plegado.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  function getDebouncer(productId: number): QuantityDebouncer<QuantityPayload> {
    const existing = debouncersRef.current.get(productId);

    if (existing) {
      return existing;
    }

    const created = createQuantityDebouncer<QuantityPayload>((payload) =>
      commitRef.current(payload),
    );
    debouncersRef.current.set(productId, created);

    return created;
  }

  async function commitQuantity(payload: QuantityPayload): Promise<void> {
    setBusy(true);
    setMessage(null);

    try {
      await setQuantity(payload.productId, payload.quantity);
    } catch (caught) {
      setMessage(cartErrorMessage(caught));
    } finally {
      setBusy(false);
      setDrafts((prev) => {
        if (!(payload.productId in prev)) {
          return prev;
        }

        const next = { ...prev };
        delete next[payload.productId];

        return next;
      });
    }
  }

  function handleQuantity(productId: number, next: number): void {
    setDrafts((prev) => ({ ...prev, [productId]: next }));
    getDebouncer(productId).schedule({ productId, quantity: next });
  }

  async function handleRemove(productId: number): Promise<void> {
    getDebouncer(productId).cancel();
    setDrafts((prev) => {
      if (!(productId in prev)) {
        return prev;
      }

      const next = { ...prev };
      delete next[productId];

      return next;
    });
    setBusy(true);
    setMessage(null);

    try {
      await removeItem(productId);
    } catch (caught) {
      setMessage(cartErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (location.pathname === '/cart' || cart === null || cart.items.length === 0) {
    return null;
  }

  const locked = cart.status === 'PENDING';

  return (
    <nav aria-label="Carrito" className="fixed inset-x-0 bottom-0 border-t border-line bg-surface">
      <div className="mx-auto max-w-md px-4 py-2">
        {message !== null && (
          <p role="alert" className="mb-2 rounded-tag border border-cmr bg-paper px-3 py-2 text-sm text-cmr">
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mini-cart-items"
          className={toggleButtonClass}
        >
          <span>
            <span className="block text-base font-semibold text-ink">Carrito ({totalUnits})</span>
            {!open && (
              <span className="block text-sm text-muted">
                <span className="font-semibold text-cmr">
                  {formatMoney(cart.summary.cmrTotalCents)}
                </span>{' '}
                con CMR
              </span>
            )}
          </span>
          <span
            aria-hidden="true"
            className="shrink-0 rounded-button border border-line bg-surface px-3 py-1 text-sm font-semibold text-ink"
          >
            {open ? 'Ocultar' : 'Ver'}
          </span>
        </button>

        {open && (
          <div id="mini-cart-items" className="mt-2 flex flex-col gap-3 border-t border-line pt-3">
            <ul className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto">
              {cart.items.map((item) => (
                <li key={item.productId} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink">{item.name}</span>
                  <QuantityStepper
                    quantity={drafts[item.productId] ?? item.quantity}
                    maxQuantity={item.maxQuantity}
                    disabled={locked || busy}
                    onChange={(next) => handleQuantity(item.productId, next)}
                    onRequestRemove={() => void handleRemove(item.productId)}
                  />
                </li>
              ))}
            </ul>

            <Link to="/cart" className={editLinkClass}>
              Ver y editar carrito
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
