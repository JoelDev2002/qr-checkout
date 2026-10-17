import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { readGoogleCredential } from '../features/auth/googleCredential';
import {
  clearSession,
  homeFor,
  isTokenExpired,
  readSession,
  saveSession,
  type Session,
} from '../lib/session';
import { ApiError, devLogin, loginWithGoogle, type LoginResult } from '../services/api';

const rawGoogleClientId: unknown = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const googleClientId = typeof rawGoogleClientId === 'string' ? rawGoogleClientId : '';

const GOOGLE_NOT_CONFIGURED_MESSAGE =
  'El inicio de sesión con Google no está configurado. Revisa VITE_GOOGLE_CLIENT_ID en frontend/.env.';
const GOOGLE_FAILED_MESSAGE = 'No pudimos entrar con Google. Inténtalo de nuevo.';
const UNEXPECTED_MESSAGE = 'Ocurrió un error inesperado. Inténtalo de nuevo.';

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

const secondaryButtonClasses = `mt-4 min-h-[44px] w-full rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink ${focusRing} disabled:opacity-60`;

function messageFromError(error: unknown): string {
  return error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE;
}

export function Home() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activa = session !== null && !isTokenExpired(session.token);

  function finish(result: LoginResult): void {
    saveSession(result);
    setSession(result);
    navigate(homeFor(result.user.role), { replace: true });
  }

  function startLogin(request: Promise<LoginResult>): void {
    setSubmitting(true);
    setError(null);

    request
      .then(finish)
      .catch((cause: unknown) => setError(messageFromError(cause)))
      .finally(() => setSubmitting(false));
  }

  function onGoogleSuccess(credentialResponse: Parameters<typeof readGoogleCredential>[0]): void {
    const credential = readGoogleCredential(credentialResponse);

    if (credential === null) {
      setError(GOOGLE_FAILED_MESSAGE);
      return;
    }

    startLogin(loginWithGoogle(credential));
  }

  function closeSession(): void {
    clearSession();
    setSession(null);
    setError(null);
  }

  if (activa && session !== null) {
    return (
      <main className="min-h-dvh bg-paper px-4 py-6">
        <div className="mx-auto max-w-sm rounded-sheet border border-line bg-surface p-6">
          <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-cmr" />
          <div className="mt-4">
            <BrandLogo className="h-14 w-auto" />
          </div>
          <p className="mt-2 text-base text-ink">Hola, {session.user.name}.</p>
          <p className="mt-1 text-base text-muted">
            Tu sesión está activa con {session.user.email}.
          </p>
          <button type="button" onClick={closeSession} className={secondaryButtonClasses}>
            Cerrar sesión
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-paper px-4 py-6">
      <div className="mx-auto max-w-sm rounded-sheet border border-line bg-surface p-6">
        <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-cmr" />
        <h1 className="mt-4 text-2xl font-bold text-ink">QRCheckout</h1>
        <p className="mt-2 text-base text-muted">Escanea, ve tu precio con CMR y paga rápido.</p>

        {error !== null && (
          <p role="alert" className="mt-6 rounded-tag border border-cmr px-3 py-2 text-sm text-cmr">
            {error}
          </p>
        )}

        <div className="mt-6">
          {submitting ? (
            <p aria-live="polite" className="min-h-[44px] py-3 text-base text-muted">
              Entrando…
            </p>
          ) : googleClientId !== '' ? (
            <GoogleOAuthProvider clientId={googleClientId} locale="es">
              <div className="flex min-h-[44px] items-center justify-center">
                <GoogleLogin
                  onSuccess={onGoogleSuccess}
                  onError={() => setError(GOOGLE_FAILED_MESSAGE)}
                  size="large"
                  theme="outline"
                  shape="rectangular"
                  text="signin_with"
                  containerProps={{ className: `rounded-button ${focusRing}` }}
                />
              </div>
            </GoogleOAuthProvider>
          ) : (
            <p role="alert" className="rounded-tag border border-cmr px-3 py-2 text-sm text-cmr">
              {GOOGLE_NOT_CONFIGURED_MESSAGE}
            </p>
          )}
        </div>

        {import.meta.env.DEV && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => startLogin(devLogin())}
            className={secondaryButtonClasses}
          >
            Entrar como cliente de prueba
          </button>
        )}
      </div>
    </main>
  );
}
