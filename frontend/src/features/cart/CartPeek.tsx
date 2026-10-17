import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney } from '../../lib/money';
import type { CartItem } from '../../services/cart';

const linkClass =
  'flex min-h-[44px] items-center justify-center rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

/**
 * Resumen plegable y de solo lectura de lo escaneado (DESIGN §4, cliente punto 2).
 * Muestra todo el carrito sin salir del escáner; para editarlo está "Ver carrito".
 */
export function CartPeek({ items }: { items: CartItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-sheet border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="cart-peek-items"
        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <span>En tu carrito ({items.length})</span>
        <span aria-hidden="true" className="text-sm font-normal text-muted">
          {open ? 'Ocultar' : 'Ver'}
        </span>
      </button>

      {open && (
        <ul id="cart-peek-items" className="flex flex-col gap-2 border-t border-line px-4 py-3">
          {items.map((item) => (
            <li key={item.productId} className="flex items-baseline justify-between gap-3">
              <span className="text-base text-ink">
                {item.name}
                <span className="text-muted"> × {item.quantity}</span>
              </span>
              <span className="text-right tabular-nums">
                <span className="block text-base font-semibold text-ink">
                  {formatMoney(item.offerPriceCents)}
                </span>
                {item.hasCmrDiscount && (
                  <span className="block text-sm font-semibold text-cmr">
                    {formatMoney(item.cmrPriceCents)} con CMR
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-line px-4 py-3">
        <Link to="/cart" className={linkClass}>
          Ver carrito
        </Link>
      </div>
    </section>
  );
}
