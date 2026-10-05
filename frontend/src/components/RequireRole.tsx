import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { homeFor, isTokenExpired, readSession, type Role } from '../lib/session';

type RequireRoleProps = {
  roles: Role[];
  children: ReactNode;
};

/** El servidor igual revisa el rol en cada ruta; esto solo evita mostrar pantallas ajenas. */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const session = readSession();

  if (session === null || isTokenExpired(session.token)) {
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(session.user.role)) {
    return <Navigate to={homeFor(session.user.role)} replace />;
  }

  return <>{children}</>;
}