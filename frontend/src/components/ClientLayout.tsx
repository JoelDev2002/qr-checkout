import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useCart } from '../features/cart/CartContext';
import { formatMoney } from '../lib/money';
import { clearSession } from '../lib/session';

/** Marco del cliente: cabecera, contenido y barra inferior con el resumen del carrito (DESIGN §4). */
export function ClientLayout() {
  const navigate = useNavigate();
  const { cart, totalUnits } = useCart();

  function handleLogout(): void {
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-dvh bg-paper pb-28">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
          <span className="text-lg font-bold text-ink">QRCheckout</span>
          <button
            type="button"
            onClick={handleLogout}
            className="min-h-[44px] rounded-button px-3 text-sm font-semibold text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-4">
        <Outlet />
      </main>

      <nav
        aria-label="Resumen del carrito"
        className="fixed inset-x-0 bottom-0 border-t border-line bg-surface"
      >
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-2">
          <div aria-live="polite">
            <p className="text-base font-semibold text-ink">Carrito ({totalUnits})</p>
            {cart !== null && totalUnits > 0 && (
              <p className="text-sm text-muted">
                <span className="font-semibold text-cmr">
                  {formatMoney(cart.summary.cmrTotalCents)}
                </span>{' '}
                con CMR
              </p>
            )}
          </div>

          <Link
            to="/cart"
            className="flex min-h-[44px] items-center rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Ver carrito
          </Link>
        </div>
      </nav>
    </div>
  );
}
