import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../features/cart/CartContext';
import { CartSummary } from '../../features/cart/CartSummary';
import { hasBlockingIssue } from '../../features/cart/cartRules';
import { InstallmentPicker } from '../../features/cart/InstallmentPicker';
import { cartErrorMessage, UNEXPECTED_MESSAGE } from '../../features/cart/messages';
import { ProductRow } from '../../features/cart/ProductRow';
import { createQuantityDebouncer, type QuantityDebouncer } from '../../features/cart/quantityDebounce';
import type { CartItem } from '../../services/cart';

const primaryButton =
  'flex min-h-[44px] w-full items-center justify-center rounded-button bg-ink px-4 text-base font-semibold text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';
const secondaryButton =
  'flex min-h-[44px] w-full items-center justify-center rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

type QuantityPayload = { productId: number; quantity: number };

/**
 * Pantalla del carrito del cliente (T2.3, T3.2; DESIGN §4 cliente punto 3): lista con
 * ProductRow, resumen de Falabella, cuotas informativas y los botones de QR y de vaciar.
 */
export function CartPage() {
  const navigate = useNavigate();
  const { cart, loading, error, reload, setQuantity, removeItem, clear, generateQr } = useCart();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  /** Cantidad adelantada por el contador mientras el servidor no responde (RN-19). */
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

  function handleQuantity(item: CartItem, next: number): void {
    setDrafts((prev) => ({ ...prev, [item.productId]: next }));
    getDebouncer(item.productId).schedule({ productId: item.productId, quantity: next });
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

  async function handleClear(): Promise<void> {
    setBusy(true);
    setMessage(null);

    try {
      await clear();
      debouncersRef.current.forEach((debouncer) => debouncer.cancel());
      setDrafts({});
      setConfirmingClear(false);
    } catch (caught) {
      setMessage(cartErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateQr(): Promise<void> {
    setBusy(true);
    setMessage(null);

    try {
      await generateQr();
      navigate('/qr');
    } catch (caught) {
      setMessage(cartErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (cart === null) {
    if (loading) {
      return (
        <p role="status" className="text-base text-muted">
          Cargando…
        </p>
      );
    }

    return (
      <section className="rounded-sheet border border-line bg-surface p-4">
        <p role="alert" className="text-base text-cmr">
          {error ?? UNEXPECTED_MESSAGE}
        </p>
        <button type="button" onClick={() => void reload()} className={`${primaryButton} mt-3`}>
          Reintentar
        </button>
      </section>
    );
  }

  const locked = cart.status === 'PENDING';
  const empty = cart.items.length === 0;
  const blocked = hasBlockingIssue(cart.items);

  if (empty) {
    return (
      <section className="flex flex-col items-center gap-4 rounded-sheet border border-line bg-surface p-6 text-center">
        <h1 className="text-lg font-semibold text-ink">
          Tu carrito está vacío. Escanea un producto para empezar.
        </h1>
        <Link to="/" className={secondaryButton}>
          Ir al escáner
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {locked && (
        <p
          role="status"
          className="rounded-tag border border-warn bg-paper px-3 py-2 text-sm text-warn"
        >
          Carrito bloqueado mientras el QR está activo
        </p>
      )}

      {message !== null && (
        <p role="alert" className="rounded-tag border border-cmr bg-paper px-3 py-2 text-sm text-cmr">
          {message}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {cart.items.map((item) => (
          <ProductRow
            key={item.productId}
            item={item}
            quantity={drafts[item.productId] ?? item.quantity}
            disabled={locked || busy}
            onChangeQuantity={(next) => handleQuantity(item, next)}
            onRequestRemove={() => void handleRemove(item.productId)}
            onRemove={() => void handleRemove(item.productId)}
          />
        ))}
      </ul>

      <CartSummary summary={cart.summary} />
      <InstallmentPicker installments={cart.installments} />

      <div className="flex flex-col gap-3">
        {locked ? (
          <button type="button" onClick={() => navigate('/qr')} className={primaryButton}>
            Ver QR
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleGenerateQr()}
            disabled={busy || blocked}
            className={primaryButton}
          >
            Generar QR para caja
          </button>
        )}

        {blocked && !locked && (
          <p className="text-sm text-warn">
            Quita o ajusta los productos marcados para generar el QR.
          </p>
        )}

        {!locked && !blocked && (
          <button type="button" onClick={() => navigate('/pay')} className={secondaryButton}>
            Pagar en línea
          </button>
        )}

        {confirmingClear ? (
          <div className="rounded-tag border border-line bg-paper p-3">
            <p className="text-base text-ink">¿Vaciar el carrito?</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void handleClear()}
                disabled={busy}
                className={primaryButton}
              >
                Sí, vaciar
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClear(false)}
                className={secondaryButton}
              >
                No
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            disabled={busy || locked}
            className={secondaryButton}
          >
            Vaciar carrito
          </button>
        )}
      </div>
    </section>
  );
}