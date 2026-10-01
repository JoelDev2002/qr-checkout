import { useEffect, useState } from 'react';
import { ApiError, get } from '../services/api';

type Health = { status: string };

type ApiState =
  | { kind: 'loading' }
  | { kind: 'ok'; status: string }
  | { kind: 'error'; message: string };

export function Home() {
  const [api, setApi] = useState<ApiState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;

    get<Health>('/health')
      .then((health) => {
        if (active) {
          setApi({ kind: 'ok', status: health.status });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        const message =
          error instanceof ApiError ? error.message : 'Ocurrió un error inesperado.';
        setApi({ kind: 'error', message });
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-dvh bg-paper px-4 py-6">
      <div className="mx-auto max-w-sm rounded-sheet border border-line bg-surface p-6">
        <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-cmr" />
        <h1 className="mt-4 text-2xl font-bold text-ink">QRCheckout</h1>
        <p className="mt-2 text-base text-muted">Escanea, ve tu precio con CMR y paga rápido.</p>

        <p aria-live="polite" className="mt-6 border-t border-line pt-4 text-sm">
          {api.kind === 'loading' && <span className="text-muted">API: comprobando…</span>}
          {api.kind === 'ok' && <span className="text-saving">API: {api.status}</span>}
          {api.kind === 'error' && <span className="text-cmr">API: {api.message}</span>}
        </p>
      </div>
    </main>
  );
}