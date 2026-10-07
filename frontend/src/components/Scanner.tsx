import { useId, useState, type FormEvent } from 'react';
import { useScanner } from '../features/scanner/useScanner';

type ScannerProps = {
  /** Recibe el texto leído o escrito, ya normalizado. El componente no llama a la API. */
  onScan: (text: string) => void;
};

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
const primaryButton = `min-h-[44px] rounded-button bg-ink px-4 text-base font-semibold text-surface disabled:opacity-60 ${focusRing}`;
const secondaryButton = `min-h-[44px] rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink motion-safe:transition-colors ${focusRing}`;
const torchButton = `min-h-[44px] rounded-button bg-ink px-4 text-base font-semibold text-surface motion-safe:transition-colors ${focusRing}`;

/** Visor reutilizable con marco guía, linterna y entrada manual (DESIGN §3). */
export function Scanner({ onScan }: ScannerProps) {
  const scanner = useScanner(onScan);
  const [draft, setDraft] = useState('');
  const inputId = useId();

  const viewfinder = scanner.status === 'scanning' || scanner.status === 'read';

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (scanner.submitManual(draft)) {
      setDraft('');
    }
  }

  return (
    <section aria-label="Escáner de códigos" className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-sheet bg-ink">
        <video
          ref={scanner.videoRef}
          aria-hidden="true"
          className={`h-full w-full object-cover ${viewfinder ? '' : 'invisible'}`}
          autoPlay
          muted
          playsInline
        />

        {viewfinder && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-button border-2 border-surface"
          />
        )}

        {scanner.status === 'requesting' && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-base text-surface">
            Pidiendo permiso de cámara…
          </p>
        )}

        {scanner.status === 'error' && (
          <p
            role="alert"
            className="absolute inset-0 flex items-center justify-center p-6 text-center text-base text-surface"
          >
            {scanner.errorMessage}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        {scanner.canTorch && (
          <button
            type="button"
            onClick={() => void scanner.toggleTorch()}
            aria-pressed={scanner.torchOn}
            className={scanner.torchOn ? torchButton : secondaryButton}
          >
            {scanner.torchOn ? 'Apagar linterna' : 'Linterna'}
          </button>
        )}

        <button
          type="button"
          onClick={scanner.manualOpen ? scanner.closeManual : scanner.openManual}
          aria-expanded={scanner.manualOpen}
          className={`${secondaryButton} flex-1`}
        >
          Escribir código
        </button>
      </div>

      {scanner.manualOpen && (
        <form onSubmit={handleManualSubmit} className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-sm font-semibold text-ink">
            Código de barras o QR
          </label>
          <input
            id={inputId}
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escribe el código"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className={`min-h-[44px] w-full rounded-button border border-line bg-surface px-3 text-base tabular-nums text-ink ${focusRing}`}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={draft.trim() === ''}
              className={`${primaryButton} flex-1`}
            >
              Usar código
            </button>
            <button type="button" onClick={scanner.closeManual} className={`${secondaryButton} flex-1`}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {scanner.status === 'scanning' && (
        <p role="status" aria-live="polite" className="text-sm text-muted">
          Escaneando…
        </p>
      )}

      {scanner.status === 'read' && (
        <p role="status" aria-live="polite" className="text-sm font-semibold text-saving">
          Código leído
        </p>
      )}
    </section>
  );
}
