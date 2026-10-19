import { GoogleLogin, GoogleOAuthProvider, type CredentialResponse } from '@react-oauth/google';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { PasswordInput } from '../../components/PasswordInput';
import { readGoogleCredential } from '../../features/auth/googleCredential';
import { homeFor, isTokenExpired, readSession, saveSession } from '../../lib/session';
import { ApiError, devLogin, login, loginWithGoogle } from '../../services/api';

type LoginFields = {
  email: string;
  password: string;
};

type FieldErrors = Partial<Record<keyof LoginFields, string>>;

const loginSchema = z.object({
  email: z.string().min(1, 'Escribe tu correo.').email('Escribe un correo válido.'),
  password: z.string().min(1, 'Escribe tu contraseña.'),
});

function collectFieldErrors(error: z.ZodError<LoginFields>): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (typeof field === 'string' && !(field in errors)) {
      errors[field as keyof LoginFields] = issue.message;
    }
  }

  return errors;
}

const inputClasses =
  'min-h-[44px] w-full rounded-button border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

export function Login() {
  const navigate = useNavigate();
  const { register, handleSubmit } = useForm<LoginFields>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loginError, setLoginError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [devError, setDevError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, setGoogleSubmitting] = useState(false);
  const [devSubmitting, setDevSubmitting] = useState(false);

  const session = readSession();
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const isDev = import.meta.env.DEV;

  const onSubmit = handleSubmit((values) => {
    const parsed = loginSchema.safeParse(values);

    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      setLoginError(null);
      return;
    }

    setFieldErrors({});
    setLoginError(null);
    setSubmitting(true);

    login(parsed.data.email, parsed.data.password)
      .then((result) => {
        saveSession(result);
        navigate(homeFor(result.user.role), { replace: true });
      })
      .catch((error: unknown) => {
        setLoginError(
          error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.',
        );
      })
      .finally(() => {
        setSubmitting(false);
      });
  });

  const handleGoogleSuccess = (response: CredentialResponse) => {
    const credential = readGoogleCredential(response);

    if (credential === null) {
      setGoogleError('No pudimos leer las credenciales de Google. Inténtalo de nuevo.');
      setGoogleSubmitting(false);
      return;
    }

    setGoogleError(null);
    setGoogleSubmitting(true);

    loginWithGoogle(credential)
      .then((result) => {
        saveSession(result);
        navigate(homeFor(result.user.role), { replace: true });
      })
      .catch((error: unknown) => {
        setGoogleError(
          error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.',
        );
      })
      .finally(() => {
        setGoogleSubmitting(false);
      });
  };

  const handleGoogleError = () => {
    setGoogleError('No pudimos iniciar sesión con Google. Inténtalo de nuevo.');
  };

  const handleDevLogin = () => {
    setDevError(null);
    setDevSubmitting(true);

    devLogin()
      .then((result) => {
        saveSession(result);
        navigate(homeFor(result.user.role), { replace: true });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code === 'NOT_FOUND') {
          setDevError('El acceso de prueba está desactivado en el servidor');
          return;
        }

        setDevError(error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.');
      })
      .finally(() => {
        setDevSubmitting(false);
      });
  };

  if (session !== null && !isTokenExpired(session.token)) {
    return <Navigate to={homeFor(session.user.role)} replace />;
  }

  return (
    <main className="min-h-dvh bg-paper px-4 py-6">
      <div className="mx-auto max-w-sm rounded-sheet border border-line bg-surface p-6">
        <span aria-hidden="true" className="block h-1 w-10 rounded-tag bg-primary" />
        <h1 className="mt-4 text-2xl font-bold text-ink">Iniciar sesión</h1>
        <p className="mt-2 text-base text-muted">Clientes, cajeros y administración.</p>

        {loginError !== null && (
          <p role="alert" className="mt-6 rounded-tag border border-cmr px-3 py-2 text-sm text-cmr">
            {loginError}
          </p>
        )}

        <form onSubmit={onSubmit} noValidate className="mt-6">
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-ink">
              Correo
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              aria-invalid={fieldErrors.email !== undefined}
              {...register('email')}
              className={`mt-2 ${inputClasses}`}
            />
            {fieldErrors.email !== undefined && (
              <p className="mt-1 text-sm text-cmr">{fieldErrors.email}</p>
            )}
          </div>

          <div className="mt-4">
            <label htmlFor="password" className="block text-sm font-semibold text-ink">
              Contraseña
            </label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              registration={register('password')}
              invalid={fieldErrors.password !== undefined}
            />
            {fieldErrors.password !== undefined && (
              <p className="mt-1 text-sm text-cmr">{fieldErrors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 min-h-[44px] w-full rounded-button bg-button px-4 text-base font-semibold text-surface hover:bg-button-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
          >
            {submitting ? 'Entrando.' : 'Entrar'}
          </button>
        </form>

        <div className="mt-6">
          <h2 className="text-base font-semibold text-ink">Clientes</h2>
          <p className="mt-1 text-sm text-muted">Escanea, ve tu precio con CMR y paga rápido.</p>

          {googleError !== null && (
            <p role="alert" className="mt-3 rounded-tag border border-cmr px-3 py-2 text-sm text-cmr">
              {googleError}
            </p>
          )}

          {googleClientId === undefined || googleClientId === '' ? (
            <p className="mt-3 text-sm text-cmr">El acceso con Google no está configurado</p>
          ) : (
            <div className="mt-3">
              <GoogleOAuthProvider clientId={googleClientId}>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  useOneTap={false}
                  text="continue_with"
                  theme="outline"
                  type="standard"
                  size="large"
                  width="100%"
                />
              </GoogleOAuthProvider>
            </div>
          )}

          {isDev && (
            <div className="mt-4">
              {devError !== null && (
                <p role="alert" className="mt-3 rounded-tag border border-cmr px-3 py-2 text-sm text-cmr">
                  {devError}
                </p>
              )}
              <button
                type="button"
                disabled={devSubmitting}
                onClick={handleDevLogin}
                className="min-h-[44px] w-full rounded-button border border-line bg-surface px-4 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
              >
                {devSubmitting ? 'Entrando.' : 'Entrar como cliente de prueba'}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
