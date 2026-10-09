// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PriceTag } from './PriceTag';

afterEach(cleanup);

describe('PriceTag', () => {
  it('muestra original tachado, oferta, CMR y porcentaje cuando hay campaña', () => {
    render(
      <PriceTag
        originalCents={8990}
        normalCents={3990}
        cmrCents={3790}
        hasCmr
        discountPercent={58}
        campaignName="Campaña Dormitorio"
      />,
    );

    expect(screen.getByText('S/ 89.90').className).toContain('line-through');
    expect(screen.getByText('Oferta')).toBeTruthy();
    expect(screen.getByText('Campaña Dormitorio')).toBeTruthy();
    expect(screen.getByText('CMR')).toBeTruthy();
    expect(screen.getByText('S/ 37.90').className).toContain('text-cmr');
    expect(screen.getByText('\u221258%')).toBeTruthy();
  });

  it('sin campaña, la etiqueta de precio es Normal', () => {
    render(
      <PriceTag
        originalCents={10000}
        normalCents={8500}
        cmrCents={8000}
        hasCmr
        discountPercent={20}
      />,
    );

    expect(screen.getByText('Normal')).toBeTruthy();
    expect(screen.queryByText('Oferta')).toBeNull();
  });

  it('sin descuento CMR no muestra la fila CMR', () => {
    render(
      <PriceTag
        originalCents={10000}
        normalCents={8500}
        cmrCents={8500}
        hasCmr={false}
        discountPercent={15}
      />,
    );

    expect(screen.queryByText('CMR')).toBeNull();
  });

  it('sin descuento, no tacha el precio ni muestra porcentaje', () => {
    render(
      <PriceTag
        originalCents={10000}
        normalCents={10000}
        cmrCents={10000}
        hasCmr={false}
        discountPercent={0}
      />,
    );

    const price = screen.getByText('S/ 100.00');
    expect(price.className).not.toContain('line-through');
    expect(screen.queryByText(/−\d+%/)).toBeNull();
  });
});
