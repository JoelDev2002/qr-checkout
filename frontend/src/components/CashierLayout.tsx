import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearSession, readSession } from '../lib/session';
import { BrandLogo } from './BrandLogo';

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  `flex min-h-[44px] items-center rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
    isActive ? 'bg-ink text-surface' : 'border border-line bg-surface text-ink'
  }`;

/** Marco del cajero: cabecera con quién entró, navegación y contenido (DESIGN §4). */
export function CashierLayout() {
  const navigate = useNavigate();
  const session = readSession();

  function handleLogout(): void {
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-header">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2">
            <BrandLogo />
            <span className="text-lg font-bold text-ink">Caja</span>
          </span>
          <div className="flex items-center gap-3">
            {session !== null && (
              <span className="hidden text-sm text-ink sm:inline">{session.user.name}</span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[44px] rounded-button px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        <nav aria-label="Secciones de caja" className="mx-auto flex max-w-3xl gap-2 px-4 pb-3">
          <NavLink to="/cashier" end className={linkClass}>
            Cobrar
          </NavLink>
          <NavLink to="/cashier/today" className={linkClass}>
            Cobros de hoy
          </NavLink>
          <NavLink to="/cashier/exit" className={linkClass}>
            Verificar salida
          </NavLink>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        <Outlet />
      </main>
    </div>
  );
}
