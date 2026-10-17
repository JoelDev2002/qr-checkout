import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useCart } from '../features/cart/CartContext';
import { BrandLogo } from './BrandLogo';
import { headerLinksFor } from '../lib/headerLinks';
import { formatMoney } from '../lib/money';
import { clearSession, readSession } from '../lib/session';

const headerLinkClass = ({ isActive }: { isActive: boolean }): string =>
  `flex min-h-[44px] items-center whitespace-nowrap rounded-button px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
    isActive ? 'bg-ink text-surface' : 'text-muted'
  }`;

/** Marco del cliente: cabecera, contenido y barra inferior con el resumen del carrito (DESIGN §4). */
export function ClientLayout() {
  const navigate = useNavigate();
  const { cart, totalUnits } = useCart();
  const session = readSession();
  const headerLinks = session === null ? [] : headerLinksFor(session.user.role);

  function handleLogout(): void {
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-dvh bg-paper pb-28">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-md flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
          <BrandLogo />
          <div className="flex items-center gap-2">
            {headerLinks.map((link) => (
              <NavLink key={link.to} to={link.to} className={headerLinkClass}>
                {link.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[44px] rounded-button px-3 text-sm font-semibold text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Cerrar sesión
            </button>
          </div>
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
