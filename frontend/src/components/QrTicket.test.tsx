// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QrTicket } from './QrTicket';

// El QR real no expone su contenido como texto accesible; se sustituye por un SVG que conserva el valor.
vi.mock('qrcode.react', async () => {
  const { createElement } = await import('react');

  return {
    QRCodeSVG: (props: { value: string }) =>
      createElement('svg', { 'data-testid': 'qr', 'data-value': props.value }),
  };
});

const now = new Date('2026-10-08T12:00:00.000Z');
const code = 'C-8F3K2';

function renderTicket(expiresAt: string, busy = false) {
  const user = userEvent.setup();
  const onCancel = vi.fn();
  const onBack = vi.fn();

  render(
    <QrTicket
      code={code}
      expiresAt={expiresAt}
      now={now}
      onCancel={onCancel}
      onBack={onBack}
      busy={busy}
    />,
  );

  return { user, onCancel, onBack };
}

afterEach(cleanup);

describe('QrTicket', () => {
  it('el QR codifica solo el código del carrito, no productos ni precios', () => {
    renderTicket(new Date(now.getTime() + 10 * 60_000).toISOString());

    const svg = screen.getByTestId('qr');
    expect(svg.getAttribute('data-value')).toBe(code);
    expect(svg.getAttribute('data-value')).not.toMatch(/S[/]|price|precio/i);
  });

  it('muestra el código en texto grande y el texto para el cajero', () => {
    renderTicket(new Date(now.getTime() + 10 * 60_000).toISOString());

    expect(screen.getByText(code)).toBeTruthy();
    expect(screen.getByText('Muéstraselo al cajero')).toBeTruthy();
  });

  it('muestra la cuenta regresiva en mm:ss', () => {
    renderTicket(new Date(now.getTime() + 10 * 60_000).toISOString());

    expect(screen.getByRole('timer').textContent).toBe('10:00');
    expect(screen.getByRole('timer').className).toContain('text-ink');
  });

  it('con menos de dos minutos la cuenta regresiva pasa a warn', () => {
    renderTicket(new Date(now.getTime() + 90_000).toISOString());

    expect(screen.getByRole('timer').textContent).toBe('01:30');
    expect(screen.getByRole('timer').className).toContain('text-warn');
  });

  it('los botones avisan a quien los usa', async () => {
    const { user, onCancel, onBack } = renderTicket(
      new Date(now.getTime() + 10 * 60_000).toISOString(),
    );

    await user.click(screen.getByRole('button', { name: 'Cancelar QR' }));
    await user.click(screen.getByRole('button', { name: 'Volver al carrito' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});