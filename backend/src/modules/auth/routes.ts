import { Router } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { authenticate } from '../../middlewares/auth.js';
import { createRateLimiter } from '../../middlewares/rateLimit.js';
import { ApiError } from '../../middlewares/errorHandler.js';
import {
  createGoogleIdTokenVerifier,
  type GoogleIdTokenVerifier,
} from '../../infrastructure/googleAuth.js';
import {
  createGoogleLoginController,
  devLoginController,
  loginController,
  meController,
} from './controller.js';

export const LOGIN_RATE_LIMIT_MAX = 10;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export type AuthRouterOptions = {
  /** true solo si NODE_ENV=development y DEV_LOGIN=true: recién entonces existe dev-login. */
  devLoginEnabled: boolean;
  /** '' significa que Google no está configurado: /google responde 503, el server igual arranca. */
  googleClientId: string;
  /** Verificador inyectado para las pruebas; por defecto se crea uno real con google-auth-library. */
  googleVerifier?: GoogleIdTokenVerifier;
};

function googleNotConfigured(): never {
  throw new ApiError(
    503,
    'SERVICE_UNAVAILABLE',
    'El inicio de sesión con Google no está configurado en este servidor. Revisa GOOGLE_CLIENT_ID.',
  );
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();
  const loginLimiter = createRateLimiter(LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS);

  router.post('/login', loginLimiter, asyncHandler(loginController));
  router.get('/me', authenticate, asyncHandler(meController));

  if (options.googleClientId !== '') {
    const verifier = options.googleVerifier ?? createGoogleIdTokenVerifier(options.googleClientId);
    router.post('/google', loginLimiter, asyncHandler(createGoogleLoginController(verifier)));
  } else {
    router.post('/google', loginLimiter, asyncHandler(googleNotConfigured));
  }

  if (options.devLoginEnabled) {
    router.post('/dev-login', loginLimiter, asyncHandler(devLoginController));
  }

  return router;
}