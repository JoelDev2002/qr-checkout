import { describe, expect, it } from 'vitest';
import { buildProductListQuery } from './productQuery';

const base = {
  search: '',
  categoryId: null,
  status: 'all' as const,
  page: 1,
  pageSize: 20,
};

describe('buildProductListQuery', () => {
  it('siempre lleva page y pageSize y omite lo que está vacío', () => {
    expect(buildProductListQuery(base)).toBe('?page=1&pageSize=20');
  });

  it('incluye la búsqueda solo si tiene texto y la recorta', () => {
    expect(buildProductListQuery({ ...base, search: '  redmi buds  ' })).toBe('?q=redmi+buds&page=1&pageSize=20');
    expect(buildProductListQuery({ ...base, search: '   ' })).toBe('?page=1&pageSize=20');
  });

  it('omite categoryId sin filtro y lo incluye cuando hay uno', () => {
    expect(buildProductListQuery({ ...base, categoryId: 4 })).toBe('?categoryId=4&page=1&pageSize=20');
  });

  it('traduce el estado a active=true o active=false y omite «todos»', () => {
    expect(buildProductListQuery({ ...base, status: 'active' })).toBe('?active=true&page=1&pageSize=20');
    expect(buildProductListQuery({ ...base, status: 'inactive' })).toBe('?active=false&page=1&pageSize=20');
    expect(buildProductListQuery({ ...base, status: 'all' })).toBe('?page=1&pageSize=20');
  });

  it('respeta el orden de los parámetros', () => {
    expect(
      buildProductListQuery({
        search: 'cama',
        categoryId: 2,
        status: 'active',
        page: 3,
        pageSize: 50,
      }),
    ).toBe('?q=cama&categoryId=2&active=true&page=3&pageSize=50');
  });
});
