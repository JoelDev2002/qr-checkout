import { useState } from 'react';
import { Scanner } from '../../components/Scanner';

type Read = { text: string; at: string };

/** Página temporal de la T1.13 para probar el Scanner; se elimina en la T1.14. */
export function DevScanner() {
  const [reads, setReads] = useState<Read[]>([]);

  return (
    <main className="min-h-dvh bg-paper px-4 py-6">
      <div className="mx-auto flex max-w-sm flex-col gap-4 rounded-sheet border border-line bg-surface p-6">
        <div>
          <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-cmr" />
          <h1 className="mt-4 text-2xl font-bold text-ink">Scanner</h1>
          <p className="mt-2 text-sm text-muted">
            Página temporal de pruebas. La cámara pide HTTPS; con el celular usa el túnel. Se elimina en la T1.14.
          </p>
        </div>

        <Scanner
          onScan={(text) =>
            setReads((previous) => [{ text, at: new Date().toLocaleTimeString('es-PE') }, ...previous])
          }
        />

        <section aria-label="Textos leídos" className="border-t border-line pt-4">
          <h2 className="text-sm font-semibold text-ink">Textos leídos ({reads.length})</h2>

          {reads.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Todavía no se leyó ningún código.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {reads.map((read, index) => (
                <li key={`${read.at}-${index}`} className="flex items-baseline justify-between gap-3">
                  <code className="text-sm font-semibold tabular-nums text-ink">{read.text}</code>
                  <span className="text-xs tabular-nums text-muted">{read.at}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
