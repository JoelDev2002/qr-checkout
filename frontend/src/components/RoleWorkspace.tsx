import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession, type Role } from '../lib/session';

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  CASHIER: 'Cajero',
  CUSTOMER: 'Cliente',
};

type RoleWorkspaceProps = {
  title: string;
  name: string;
  role: Role;
  children?: ReactNode;
};

/** Marco común de las pantallas de cajero y admin: encabezado, quién entró y salir. */
export function RoleWorkspace({ title, name, role, children }: RoleWorkspaceProps) {
  const navigate = useNavigate();

  function handleLogout() {
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <main className="min-h-dvh bg-paper px-4 py-6">
      <div className="mx-auto max-w-sm rounded-sheet border border-line bg-surface p-6">
        <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-cmr" />
        <h1 className="mt-4 text-2xl font-bold text-ink">{title}</h1>

        <p className="mt-6 text-base text-ink">{name}</p>
        <p className="text-sm text-muted">{ROLE_LABELS[role]}</p>

        {children}

        <button
          type="button"
          onClick={handleLogout}
          className="mt-6 min-h-[44px] w-full rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Cerrar sesión
        </button>
      </div>
    </main>
  );
}