import { Link } from 'react-router-dom';
import { RoleWorkspace } from '../../components/RoleWorkspace';
import { readSession } from '../../lib/session';

export function AdminHome() {
  const session = readSession();

  if (session === null) {
    return null;
  }

  return (
    <RoleWorkspace title="Administración" name={session.user.name} role={session.user.role}>
      <nav className="mt-6" aria-label="Secciones de administración">
        <Link
          to="/admin/categories"
          className="flex min-h-[44px] items-center rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Categorías
        </Link>
      </nav>
    </RoleWorkspace>
  );
}