// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusSwitch } from './StatusSwitch';

afterEach(cleanup);

describe('StatusSwitch', () => {
  it('refleja el estado en aria-checked', () => {
    const { rerender } = render(
      <StatusSwitch checked label="Producto Redmi: activo" busy={false} onAsk={() => {}} />,
    );

    expect(screen.getByRole('switch', { name: 'Producto Redmi: activo' }).getAttribute('aria-checked')).toBe('true');

    rerender(
      <StatusSwitch checked={false} label="Producto Redmi: inactivo" busy={false} onAsk={() => {}} />,
    );

    expect(screen.getByRole('switch', { name: 'Producto Redmi: inactivo' }).getAttribute('aria-checked')).toBe('false');
  });

  it('avisa a quien lo usa al tocarlo', async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();

    render(<StatusSwitch checked label="Producto Redmi: activo" busy={false} onAsk={onAsk} />);

    await user.click(screen.getByRole('switch', { name: 'Producto Redmi: activo' }));
    expect(onAsk).toHaveBeenCalledTimes(1);
  });

  it('queda deshabilitado mientras está ocupado', () => {
    render(<StatusSwitch checked label="Producto Redmi: activo" busy onAsk={() => {}} />);

    expect((screen.getByRole('switch', { name: 'Producto Redmi: activo' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
