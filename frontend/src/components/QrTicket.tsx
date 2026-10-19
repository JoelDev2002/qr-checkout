import { QRCodeSVG } from 'qrcode.react';
import { formatCountdown, isExpiringSoon, remainingMs } from '../features/qr/qrCountdown';

const primaryButton =
  'flex min-h-[44px] w-full items-center justify-center rounded-button bg-button px-4 text-base font-semibold text-surface hover:bg-button-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';
const secondaryButton =
  'flex min-h-[44px] w-full items-center justify-center rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

type QrTicketProps = {
  /** Código corto del carrito: lo único que lleva el QR (RN-05). */
  code: string;
  expiresAt: string;
  /** Hora actual que va pasando el reloj de la pantalla; la cuenta regresiva se calcula de aquí. */
  now: Date;
  onCancel: () => void;
  onBack: () => void;
  busy?: boolean;
};

/** Tarjeta de ticket con el QR, el código en texto y la cuenta regresiva (DESIGN §3, cliente §4.4). */
export function QrTicket({ code, expiresAt, now, onCancel, onBack, busy = false }: QrTicketProps) {
  const remaining = remainingMs(expiresAt, now);
  const countdown = formatCountdown(remaining);
  const warn = isExpiringSoon(remaining);

  return (
    <section aria-label="Código QR del carrito" className="mx-auto w-full max-w-sm">
      <div className="rounded-tag border border-line bg-surface p-6 text-center">
        <div className="mx-auto flex w-fit items-center justify-center rounded-tag border border-line bg-surface p-3">
          <QRCodeSVG value={code} size={190} level="M" />
        </div>

        <p className="mt-4 text-2xl font-bold tracking-[0.25em] text-ink tabular-nums">{code}</p>
        <p className="mt-1 text-base text-muted">Muéstraselo al cajero</p>

        <div className="mt-4 border-t border-dashed border-line pt-3">
          <p
            role="timer"
            className={`text-lg font-semibold tabular-nums ${warn ? 'text-warn' : 'text-ink'}`}
          >
            {countdown}
          </p>
          {warn && <p className="text-sm text-warn">El QR está por vencer</p>}
        </div>
      </div>
      <div className="ticket-notch" aria-hidden="true" />

      <div className="mt-4 flex flex-col gap-3">
        <button type="button" onClick={onCancel} disabled={busy} className={primaryButton}>
          Cancelar QR
        </button>
        <button type="button" onClick={onBack} disabled={busy} className={secondaryButton}>
          Volver al carrito
        </button>
      </div>
    </section>
  );
}