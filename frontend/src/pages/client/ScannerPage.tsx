import { useEffect, useRef, useState } from 'react';
import { DetailsList } from '../../components/DetailsList';
import { PriceTag } from '../../components/PriceTag';
import { Scanner } from '../../components/Scanner';
import { useCart } from '../../features/cart/CartContext';
import { cartErrorMessage } from '../../features/cart/messages';
import { QuantityStepper } from '../../features/cart/QuantityStepper';
import { createQuantityDebouncer } from '../../features/cart/quantityDebounce';
import { getProductByBarcode } from '../../services/scan';
import type { ScannedProduct } from '../../types/product';

const primaryButton =
  'min-h-[44px] flex-1 rounded-button bg-ink px-4 text-base font-semibold text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';
const secondaryButton =
  'min-h-[44px] flex-1 rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

/** Pantalla del escáner del cliente (DESIGN §4, cliente punto 2). */
export function ScannerPage() {
  const {
    cart,
    addByBarcode,
    setQuantity: setServerQuantity,
    removeItem,
    error: cartError,
    reload: reloadCart,
  } = useCart();
  const [lastProduct, setLastProduct] = useState<ScannedProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askRemove, setAskRemove] = useState(false);

  const item =
    lastProduct === null
      ? null
      : (cart?.items.find((row) => row.productId === lastProduct.id) ?? null);
  const locked = cart?.status === 'PENDING';

  // La cantidad mostrada sigue al servidor; los toques del contador la adelantan sin esperar.
  useEffect(() => {
    if (item !== null) {
      setQuantity(item.quantity);
    }
  }, [item?.productId, item?.quantity]);

  async function sendQuantity(payload: { productId: number; quantity: number }): Promise<void> {
    try {
      await setServerQuantity(payload.productId, payload.quantity);
      setMessage(null);
    } catch (error) {
      setMessage(cartErrorMessage(error));
      const current =
        cart?.items.find((row) => row.productId === payload.productId)?.quantity ?? 1;
      setQuantity(current);
    }
  }

  const commitRef = useRef<(payload: { productId: number; quantity: number }) => void>(() => {});
  const debouncerRef = useRef(
    createQuantityDebouncer<{ productId: number; quantity: number }>((payload) =>
      commitRef.current(payload),
    ),
  );

  useEffect(() => {
    commitRef.current = (payload) => {
      void sendQuantity(payload);
    };
  });

  useEffect(() => () => debouncerRef.current.cancel(), []);

  async function handleScan(code: string): Promise<void> {
    if (busy) {
      return;
    }

    setMessage(null);
    setAskRemove(false);

    let product: ScannedProduct;

    try {
      product = await getProductByBarcode(code);
    } catch (error) {
      setMessage(cartErrorMessage(error));
      return;
    }

    setBusy(true);
    setLastProduct(product);
    setQuantity(cart?.items.find((row) => row.productId === product.id)?.quantity ?? 1);

    try {
      const result = await addByBarcode(code);
      const updated = result.items.find((row) => row.productId === product.id);
      setQuantity(updated?.quantity ?? 1);
    } catch (error) {
      setMessage(cartErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove(): Promise<void> {
    if (item === null) {
      return;
    }

    try {
      await removeItem(item.productId);
      debouncerRef.current.cancel();
      setAskRemove(false);
      setLastProduct(null);
      setMessage(null);
    } catch (error) {
      setAskRemove(false);
      setMessage(cartErrorMessage(error));
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <Scanner onScan={(code) => void handleScan(code)} />

      {cartError !== null && (
        <div role="alert" className="rounded-tag border border-cmr bg-surface px-3 py-2">
          <p className="text-sm text-cmr">{cartError}</p>
          <button
            type="button"
            onClick={() => void reloadCart()}
            className={`${secondaryButton} mt-2 w-full`}
          >
            Reintentar
          </button>
        </div>
      )}

      {message !== null && (
        <p role="alert" className="rounded-tag border border-cmr px-3 py-2 text-sm text-cmr">
          {message}
        </p>
      )}

      {busy && (
        <p role="status" className="text-sm text-muted">
          Agregando…
        </p>
      )}

      {lastProduct !== null && (
        <article className="rounded-sheet border border-line bg-surface p-4">
          <p className="text-sm text-muted">Último producto</p>
          <p className="mt-1 text-base font-semibold text-ink">{lastProduct.name}</p>
          <p className="text-sm text-muted">{lastProduct.brand}</p>

          <div className="mt-3">
            <PriceTag
              originalCents={lastProduct.originalPriceCents}
              normalCents={lastProduct.offerPriceCents}
              cmrCents={lastProduct.cmrPriceCents}
              hasCmr={lastProduct.hasCmrDiscount}
              discountPercent={lastProduct.discountPercent}
              campaignName={lastProduct.campaignName}
              large
            />
          </div>

          <DetailsList details={lastProduct.details} />

          {item !== null && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <QuantityStepper
                quantity={quantity}
                maxQuantity={item.maxQuantity}
                disabled={locked === true}
                onChange={(next) => {
                  setQuantity(next);
                  debouncerRef.current.schedule({ productId: item.productId, quantity: next });
                }}
                onRequestRemove={() => setAskRemove(true)}
              />
              <span className="text-sm text-muted">máx. {item.maxQuantity}</span>
            </div>
          )}

          {askRemove && item !== null && (
            <div className="mt-3 rounded-tag border border-line bg-paper p-3">
              <p className="text-base text-ink">¿Quitar este producto del carrito?</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => void confirmRemove()} className={primaryButton}>
                  Sí, quitar
                </button>
                <button
                  type="button"
                  onClick={() => setAskRemove(false)}
                  className={secondaryButton}
                >
                  No
                </button>
              </div>
            </div>
          )}
        </article>
      )}
    </section>
  );
}
