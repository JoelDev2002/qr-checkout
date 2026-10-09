// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { InstallmentOption } from '../../services/cart';
import { InstallmentPicker } from './InstallmentPicker';

afterEach(cleanup);

const options: InstallmentOption[] = [
  { count: 3, installmentCents: 315763, firstInstallmentCents: 315764 },
  { count: 6, installmentCents: 157882, firstInstallmentCents: 157880 },
  { count: 12, installmentCents: 78941, firstInstallmentCents: 78940 },
];

describe('InstallmentPicker', () => {
  it('con opciones muestra el selector y la línea con 6 por defecto', () => {
    render(<InstallmentPicker installments={options} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(screen.getByRole('button', { name: '6' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/o 6 cuotas de aprox\.\s+con CMR/)).toBeTruthy();
    expect(screen.getByText('S/ 1,578.82')).toBeTruthy();
  });

  it('al elegir 3 cambia la línea a 3 cuotas', async () => {
    const user = userEvent.setup();
    render(<InstallmentPicker installments={options} />);

    await user.click(screen.getByRole('button', { name: '3' }));

    expect(screen.getByRole('button', { name: '3' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/o 3 cuotas de aprox\.\s+con CMR/)).toBeTruthy();
    expect(screen.getByText('S/ 3,157.63')).toBeTruthy();
  });

  it('sin opciones no muestra nada', () => {
    const { container } = render(<InstallmentPicker installments={[]} />);

    expect(container.querySelector('section')).toBeNull();
  });

  it('sin la cuota 6 usa la primera opción', () => {
    const withoutSix = options.filter((option) => option.count !== 6);
    render(<InstallmentPicker installments={withoutSix} />);

    expect(screen.getByRole('button', { name: '3' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/o 3 cuotas de aprox\.\s+con CMR/)).toBeTruthy();
  });
});