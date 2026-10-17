import { describe, expect, it } from 'vitest';
import { headerLinksFor } from './headerLinks';

describe('headerLinksFor', () => {
  it('muestra el enlace al historial al cliente', () => {
    expect(headerLinksFor('CUSTOMER')).toEqual([{ to: '/history', label: 'Historial' }]);
  });

  it('no muestra enlaces al cajero', () => {
    expect(headerLinksFor('CASHIER')).toEqual([]);
  });

  it('no muestra enlaces al administrador', () => {
    expect(headerLinksFor('ADMIN')).toEqual([]);
  });
});
