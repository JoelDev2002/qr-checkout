// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CartSummary } from './CartSummary';

afterEach(cleanup);

const withSaving = {
  originalTotalCents: 1685590,
  discountTotalCents: 699100,
  normalTotalCents: 986490,
  cmrTotalCents: 947290,
  cmrSavingCents: 39200,
};

const withoutSaving = {
  originalTotalCents: 50000,
  discountTotalCents: 10000,
  normalTotalCents: 40000,
  cmrTotalCents: 40000,
  cmrSavingCents: 0,
};

describe('CartSummary', () => {
  it('muestra las cuatro líneas de Falabella con el ahorro', () => {
    render(<CartSummary summary={withSaving} />);

    expect(screen.getByText('Productos')).toBeTruthy();
    expect(screen.getByText('S/ 16,855.90')).toBeTruthy();
    expect(screen.getByText('Descuentos')).toBeTruthy();
    expect(screen.getByText('− S/ 6,991.00')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('S/ 9,864.90')).toBeTruthy();
    expect(screen.getByText('Total con CMR')).toBeTruthy();
    expect(screen.getByText('S/ 9,472.90').className).toContain('text-cmr');
    expect(screen.getByText('Ahorras con CMR')).toBeTruthy();
    expect(screen.getByText('S/ 392.00').className).toContain('text-saving');
  });

  it('sin ahorro no muestra la línea de ahorro', () => {
    render(<CartSummary summary={withoutSaving} />);

    expect(screen.queryByText('Ahorras con CMR')).toBeNull();
    expect(screen.queryByText('S/ 392.00')).toBeNull();
    expect(screen.getByText('Total con CMR')).toBeTruthy();
  });
});