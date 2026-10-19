import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { MiniCart } from '../features/cart/MiniCart';
import { BrandLogo } from './BrandLogo';
import { headerLinksFor } from '../lib/headerLinks';
import { clearSession, readSession } from '../lib/session';

const headerLinkClass = ({ isActive }: { isActive: boolean }): string =>
  `flex min-h-[44px] items-center whitespace-nowrap rounded-button px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
    isActive ? 'bg-ink text-surface' : 'text-ink'
  }`;

/** Marco del cliente: cabecera, contenido y barra inferior con el resumen del carrito (DESIGN §4). */
export function ClientLayout() {
  const navigate = useNavigate();
  const session = readSession();
  const headerLinks = session === null ? [] : headerLinksFor(session.user.role);

  function handleLogout(): void {
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-dvh bg-paper pb-28">
      <header className="border-b border-line bg-header">
        <div className="mx-auto flex max-w-md flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
          <Link
            to="/"
            aria-label="Ir al escáner"
            className="rounded-button focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <BrandLogo />
          </Link>
          <div className="flex items-center gap-2">
            {headerLinks.map((link) => (
              <NavLink key={link.to} to={link.to} className={headerLinkClass}>
                {link.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[44px] rounded-button px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-4">
        <Outlet />
      </main>

      <MiniCart />
    </div>
  );
}
