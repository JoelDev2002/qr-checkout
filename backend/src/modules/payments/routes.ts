import { Router } from 'express';
import { env } from '../../config/env.js';
import {
  createMercadoPagoClient,
  type MercadoPagoClient,
} from '../../infrastructure/mercadopago.js';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { createUserRateLimiter } from '../../middlewares/rateLimit.js';
import { LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS } from '../auth/routes.js';
import { createOnlinePaymentController } from './controller.js';

export type PaymentsRouterOptions = {
  /** Cliente inyectado por las pruebas; en producción se crea con MP_ACCESS_TOKEN. */
  mercadoPagoClient?: MercadoPagoClient;
  /** '' (vacío) significa que Mercado Pago no está configurado: la ruta responde 503. */
  mpAccessToken?: string;
};

/**
 * El cobro en línea es solo del cliente (RN-20). Lleva el mismo límite de intentos que el login,
 * pero por usuario y no por IP: en la tienda varios clientes comparten la misma salida a internet.
 */
export function createPaymentsRouter(options: PaymentsRouterOptions = {}): Router {
  const router = Router();
  const accessToken = options.mpAccessToken ?? env.MP_ACCESS_TOKEN;
  const client =
    options.mercadoPagoClient ??
    (accessToken === '' ? null : createMercadoPagoClient({ accessToken }));
  const onlyCustomer = requireRole('CUSTOMER');
  const attemptLimiter = createUserRateLimiter(LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS);

  router.post(
    '/online',
    authenticate,
    onlyCustomer,
    attemptLimiter,
    asyncHandler(createOnlinePaymentController(client)),
  );

  return router;
}
