// Lógica pura de los scripts de Mercado Pago (T3.5a).
// Sin llamadas de red ni lectura de entorno: solo se encarga de validar la
// entrada para poder probarla con Vitest.

export type ArgResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** Comprueba que exista el Access Token sin exponerlo nunca. */
export function requireAccessToken(value: string | undefined): ArgResult<{ accessToken: string }> {
  const accessToken = value?.trim() ?? '';
  if (accessToken === '') {
    return {
      ok: false,
      message: 'MP_ACCESS_TOKEN no está configurado. Revisa backend/.env (ver .env.example).',
    };
  }
  return { ok: true, value: { accessToken } };
}
