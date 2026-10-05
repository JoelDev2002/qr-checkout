import { RoleWorkspace } from '../../components/RoleWorkspace';
import { readSession } from '../../lib/session';

export function AdminHome() {
  const session = readSession();

  if (session === null) {
    return null;
  }

  return <RoleWorkspace title="Administración" name={session.user.name} role={session.user.role} />;
}