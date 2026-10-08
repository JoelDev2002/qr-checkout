import type { CredentialResponse } from '@react-oauth/google';

/**
 * El botón de Google puede cerrarse sin token (por ejemplo si la persona cancela el
 * popup a medias); en ese caso no se manda nada al servidor.
 */
export function readGoogleCredential(response: CredentialResponse): string | null {
  const { credential } = response;

  return typeof credential === 'string' && credential !== '' ? credential : null;
}
