import { useId, useState, type FormEvent } from 'react';
import { Scanner } from '../../components/Scanner';
import {
  exitVerifyErrorMessage,
  isValidExitCode,
  normalizeExitCode,
} from '../../features/checkout/exit';
import { QR_SCAN_FORMATS } from '../../features/scanner/camera';
import { formatMoney } from '../../lib/money';
import { verifyExit, type ExitVerification } from '../../services/checkout';

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
const buttonBase = `min-h-[44px] rounded-button px-4 text-base font-semibold disabled:opacity-60 ${focusRing}`;
const primaryButton = `${buttonBase} bg-button text-surface hover:bg-button-hover`;
const secondaryButton = `${buttonBase} border border-line bg-surface text-ink`;

/** Pantalla "Verificar salida" del cajero (T3.6; DESIGN §4, cajero punto 5). */
export function ExitVerification() {
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<ExitVerification | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleVerify(raw: string): Promise<void> {
    const normalized = normalizeExitCode(raw);
    setMessage(null);

    if (normalized === '') {
      return;
    }

    if (!isValidExitCode(normalized)) {
      setMessage('El código de salida debe tener el formato O-XXXXX.');
      return;
    }

    setLoading(true);
    try {
      setResult(await verifyExit(normalized));
    } catch (error) {
      setMessage(exitVerifyErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void handleVerify(draft);
  }

  function handleNext(): void {
    setResult(null);
    setDraft('');
    setMessage(null);
  }

  if (result !== null) {
    return (
      <section className="flex flex-col items-center gap-4">
        <div className="w-full rounded-sheet border border-line bg-surface p-6 text-center">
          <h1 className="text-2xl font-bold text-saving">Entregado</h1>
          <p className="mt-3 text-sm text-muted">Código de salida</p>
          <p className="text-lg font-semibold tabular-nums text-ink">{result.code}</p>
          <p className="mt-3 text-base text-ink">{result.customerName}</p>
          <p className="text-2xl font-bold tabular-nums text-ink">{formatMoney(result.totalCents)}</p>
          <p className="mt-1 text-sm text-muted">{result.receiptNumber}</p>
        </div>
        <button type="button" onClick={handleNext} className={`${secondaryButton} w-full`}>
          Verificar otro
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">Verificar salida</h1>
        <p className="mt-1 text-sm text-muted">
          Escanea o escribe el código de salida que muestra el cliente.
        </p>
      </div>

      {message !== null && (
        <div role="alert" className="rounded-tag border border-cmr bg-surface px-3 py-2">
          <p className="text-sm text-cmr">{message}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-sheet border border-line bg-surface p-4">
        <label htmlFor={inputId} className="text-sm font-semibold text-ink">
          Código de salida
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id={inputId}
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="O-XXXXX"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className={`min-h-[44px] w-full rounded-button border border-line bg-surface px-3 text-base tabular-nums text-ink ${focusRing}`}
          />
          <button type="submit" disabled={draft.trim() === '' || loading} className={primaryButton}>
            Ir
          </button>
        </div>
      </form>

      <Scanner onScan={(text) => void handleVerify(text)} formats={QR_SCAN_FORMATS} ratio="square" />

      {loading && (
        <p role="status" className="text-sm text-muted">
          Verificando la salida…
        </p>
      )}
    </section>
  );
}
