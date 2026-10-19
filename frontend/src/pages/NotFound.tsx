import { Link } from 'react-router-dom';
import { landingFor, readSession } from '../lib/session';

/**
 * Pantalla 404 (T2.10): una ruta desconocida muestra este aviso con un enlace al inicio del
 * rol que tiene sesión, o al login si no hay sesión.
 */
export function NotFound() {
  const destination = landingFor(readSession());

  return (
    <main className="min-h-dvh bg-paper px-4 py-6">
      <div className="mx-auto max-w-sm rounded-sheet border border-line bg-surface p-6 text-center">
        <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-primary" />
        <h1 className="mt-4 text-2xl font-bold text-ink">Página no encontrada</h1>
        <p className="mt-2 text-base text-muted">
          La página que buscas no existe o ya no está disponible.
        </p>
        <Link
          to={destination}
          className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center rounded-button bg-button px-4 text-base font-semibold text-surface hover:bg-button-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Volver a mi inicio
        </Link>
      </div>
    </main>
  );
}