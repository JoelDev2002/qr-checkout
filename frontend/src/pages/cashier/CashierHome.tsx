import { RoleWorkspace } from '../../components/RoleWorkspace';
import { readSession } from '../../lib/session';

export function CashierHome() {
  const session = readSession();

  if (session === null) {
    return null;
  }

  return <RoleWorkspace title="Caja" name={session.user.name} role={session.user.role} />;
}