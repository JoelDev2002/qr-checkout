import { useId, useState, type FormEvent } from 'react';
import type { BarcodeFormat } from '@zxing/browser';
import { FlashlightIcon } from './Icons';
import { useScanner } from '../features/scanner/useScanner';

type ScannerProps = {
  /** Recibe el texto leído o escrito, ya normalizado. El componente no llama a la API. */
  onScan: (text: string) => void;
  /** Formatos que acepta el visor; por defecto todos (T1.13). En caja solo se pasa QR. */
  formats?: readonly BarcodeFormat[];
  /** Forma del visor; el cajero usa "square" porque solo lee QR. Por defecto "wide". */
  ratio?: 'wide' | 'square';
};

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
const primaryButton = `min-h-[44px] rounded-button bg-button px-4 text-base font-semibold text-surface hover:bg-button-hover disabled:opacity-60 ${focusRing}`;
const secondaryButton = `min-h-[44px] rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink motion-safe:transition-colors ${focusRing}`;

/** Ícono de cámara para el visor vacío (permiso pendiente o error). */
function CameraIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-10 w-10"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 4h-5L8 6H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-4l-1.5-2Z" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

/** Visor reutilizable con marco guía, linterna y entrada manual (DESIGN §3). */
export function Scanner({ onScan, formats, ratio = 'wide' }: ScannerProps) {
  const scanner = useScanner(onScan, formats);
  const [draft, setDraft] = useState('');
  const inputId = useId();

  const viewfinder = scanner.status === 'scanning' || scanner.status === 'read';
  const aspectClass = ratio === 'square' ? 'aspect-square' : 'aspect-[4/3]';
  const frameClass = ratio === 'square' ? 'h-3/4 w-3/4' : 'h-32 w-3/4';

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (scanner.submitManual(draft)) {
      setDraft('');
    }
  }

  return (
    <section aria-label="Escáner de códigos" className="flex flex-col gap-3">
      <div
        className={`relative ${aspectClass} w-full overflow-hidden rounded-sheet border ${
          viewfinder ? 'border-ink bg-ink' : 'border-line bg-paper'
        }`}
      >
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
            className={`pointer-events-none absolute left-1/2 top-1/2 ${frameClass} -translate-x-1/2 -translate-y-1/2 rounded-button border-2 border-surface shadow-[0_0_0_9999px_rgba(23,32,51,0.55)]`}
          />
        )}

        {viewfinder && scanner.canTorch && (
          <button
            type="button"
            onClick={() => void scanner.toggleTorch()}
            aria-pressed={scanner.torchOn}
            aria-label={scanner.torchOn ? 'Apagar linterna' : 'Encender linterna'}
            title={scanner.torchOn ? 'Apagar linterna' : 'Encender linterna'}
            className={`absolute right-3 top-3 z-10 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full motion-safe:transition-colors ${
              scanner.torchOn ? 'bg-primary text-surface' : 'bg-[rgba(23,32,51,0.7)] text-surface'
            } ${focusRing}`}
          >
            <FlashlightIcon />
          </button>
        )}

        {scanner.status === 'requesting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-muted">
            <CameraIcon />
            <p className="text-base">Pidiendo permiso de cámara…</p>
          </div>
        )}

        {scanner.status === 'error' && (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-cmr"
          >
            <CameraIcon />
            <p className="text-base">{scanner.errorMessage}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
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
