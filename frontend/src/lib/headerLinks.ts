import type { Role } from './session';

export type HeaderLink = {
  to: string;
  label: string;
};

/**
 * Enlaces de navegación de la cabecera según el rol. El historial es solo del cliente
 * (T2.8); el cajero y el admin usan su propia cabecera y no lo ven.
 */
export function headerLinksFor(role: Role): HeaderLink[] {
  if (role !== 'CUSTOMER') {
    return [];
  }

  return [{ to: '/history', label: 'Historial' }];
}
