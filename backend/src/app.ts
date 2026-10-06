import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { createAuthRouter } from './modules/auth/routes.js';
import { createCampaignsRouter } from './modules/campaigns/routes.js';
import { createCartsRouter } from './modules/carts/routes.js';
import { createCategoriesRouter } from './modules/categories/routes.js';
import { createCheckoutRouter } from './modules/checkout/routes.js';
import { createProductsRouter } from './modules/products/routes.js';
import { createPurchasesRouter } from './modules/purchases/routes.js';
import { createUsersRouter } from './modules/users/routes.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });

  app.use('/api/auth', createAuthRouter());
  app.use('/api/categories', createCategoriesRouter());
  app.use('/api/campaigns', createCampaignsRouter());
  app.use('/api/products', createProductsRouter());
  app.use('/api/users', createUsersRouter());
  app.use('/api/cart', createCartsRouter());
  app.use('/api/purchases', createPurchasesRouter());
  app.use('/api/checkout', createCheckoutRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}