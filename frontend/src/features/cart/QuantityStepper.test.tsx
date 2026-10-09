// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuantityStepper } from './QuantityStepper';

afterEach(cleanup);

function plus(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Agregar una unidad' }) as HTMLButtonElement;
}

function minus(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Quitar una unidad' }) as HTMLButtonElement;
}

describe('QuantityStepper', () => {
  it('suma una unidad con +', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <QuantityStepper
        quantity={2}
        maxQuantity={10}
        onChange={onChange}
        onRequestRemove={vi.fn()}
      />,
    );

    await user.click(plus());
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('resta una unidad con − cuando hay más de una', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <QuantityStepper
        quantity={2}
        maxQuantity={10}
        onChange={onChange}
        onRequestRemove={vi.fn()}
      />,
    );

    await user.click(minus());
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('con cantidad 1, − pide quitar en vez de cambiar la cantidad', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onRequestRemove = vi.fn();

    render(
      <QuantityStepper
        quantity={1}
        maxQuantity={10}
        onChange={onChange}
        onRequestRemove={onRequestRemove}
      />,
    );

    await user.click(minus());
    expect(onRequestRemove).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('deshabilita + al llegar al máximo', () => {
    render(
      <QuantityStepper
        quantity={3}
        maxQuantity={3}
        onChange={vi.fn()}
        onRequestRemove={vi.fn()}
      />,
    );

    expect(plus().disabled).toBe(true);
  });

  it('deshabilita todo el contador si el carrito está bloqueado', () => {
    render(
      <QuantityStepper
        quantity={2}
        maxQuantity={10}
        disabled
        onChange={vi.fn()}
        onRequestRemove={vi.fn()}
      />,
    );

    expect(plus().disabled).toBe(true);
    expect(minus().disabled).toBe(true);
    expect((screen.getByLabelText('Cantidad') as HTMLInputElement).disabled).toBe(true);
  });

  it('ajusta lo escrito a los límites al salir del campo', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <QuantityStepper
        quantity={2}
        maxQuantity={5}
        onChange={onChange}
        onRequestRemove={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('Cantidad') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '9');
    await user.tab();

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('no avisa si lo escrito no cambia la cantidad', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <QuantityStepper
        quantity={3}
        maxQuantity={5}
        onChange={onChange}
        onRequestRemove={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('Cantidad') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '3');
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
  });
});
