import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import type { GoogleIdTokenVerifier } from './infrastructure/googleAuth.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { createAuthRouter, type AuthRouterOptions } from './modules/auth/routes.js';
import { createCampaignsRouter } from './modules/campaigns/routes.js';
import { createCartsRouter } from './modules/carts/routes.js';
import { createCategoriesRouter } from './modules/categories/routes.js';
import { createCheckoutRouter } from './modules/checkout/routes.js';
import { createDashboardRouter } from './modules/dashboard/routes.js';
import { createProductsRouter } from './modules/products/routes.js';
import { createPurchasesRouter } from './modules/purchases/routes.js';
import { createUsersRouter } from './modules/users/routes.js';

export type CreateAppOptions = {
  /** NODE_ENV real, o el que se quiera simular en las pruebas. */
  nodeEnv?: string;
  /** DEV_LOGIN: true solo registra dev-login si además NODE_ENV es "development". */
  devLogin?: boolean;
  /** '' (vacío) significa Google no configurado: /auth/google responde 503. */
  googleClientId?: string;
  /** Verificador de Google inyectado: las pruebas usan uno falso sin red. */
  googleVerifier?: GoogleIdTokenVerifier;
};

export function createApp(options: CreateAppOptions = {}) {
  const app = express();

  app.use(helmet());
  // Solo el origen del frontend recibe cabeceras CORS; el resto pasa sin ellas.
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || origin === env.FRONTEND_URL) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });

  const authOptions: AuthRouterOptions = {
    devLoginEnabled:
      (options.nodeEnv ?? env.NODE_ENV) === 'development' && (options.devLogin ?? env.DEV_LOGIN),
    googleClientId: options.googleClientId ?? env.GOOGLE_CLIENT_ID,
    googleVerifier: options.googleVerifier,
  };

  app.use('/api/auth', createAuthRouter(authOptions));
  app.use('/api/categories', createCategoriesRouter());
  app.use('/api/campaigns', createCampaignsRouter());
  app.use('/api/products', createProductsRouter());
  app.use('/api/users', createUsersRouter());
  app.use('/api/cart', createCartsRouter());
  app.use('/api/purchases', createPurchasesRouter());
  app.use('/api/checkout', createCheckoutRouter());
  app.use('/api/dashboard', createDashboardRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}