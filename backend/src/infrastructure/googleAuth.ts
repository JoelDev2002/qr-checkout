import { OAuth2Client } from 'google-auth-library';

/** Solo estos campos se extraen del token verificado; nunca el token crudo ni datos extra. */
export type GoogleVerifiedProfile = {
  email: string;
  emailVerified: boolean;
  name: string | null;
  googleId: string;
};

/**
 * Verifica el ID token de Google contra un audience y devuelve solo los datos del perfil.
 * TypeScript tipa el payload con campos opcionales y de tipos amplios, así que se
 * validan y se aíslan aquí los cuatro campos que usa el negocio.
 */
export type GoogleIdTokenVerifier = (credential: string) => Promise<GoogleVerifiedProfile>;

export function createGoogleIdTokenVerifier(clientId: string): GoogleIdTokenVerifier {
  const client = new OAuth2Client();

  return async (credential) => {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });

    const payload = ticket.getPayload();

    if (!payload?.sub || typeof payload.email !== 'string') {
      throw new Error('El token de Google no trae los datos esperados');
    }

    return {
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' && payload.name.length > 0 ? payload.name : null,
      googleId: payload.sub,
    };
  };
}