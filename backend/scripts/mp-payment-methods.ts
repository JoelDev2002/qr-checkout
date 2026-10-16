// Script de solo lectura (T3.5a): lista los medios de pago disponibles para la
// cuenta usando el endpoint documentado GET /v1/payment_methods
// (ver docs/MERCADOPAGO_REFERENCE.md). Nunca imprime ni registra la llave.

import { fileURLToPath } from 'node:url';
import { requireAccessToken } from './mp-args.js';

const envFilePath = fileURLToPath(new URL('../.env', import.meta.url));
try {
  process.loadEnvFile(envFilePath);
} catch {
  // Sin .env se usan solo las variables de la sesión actual.
}

type PaymentMethod = { id?: string; name?: string; status?: string };

async function main(): Promise<void> {
  const token = requireAccessToken(process.env.MP_ACCESS_TOKEN);
  if (!token.ok) {
    console.error(token.message);
    process.exit(1);
  }

  const response = await fetch('https://api.mercadopago.com/v1/payment_methods', {
    headers: { Authorization: `Bearer ${token.value.accessToken}` },
  });

  if (!response.ok) {
    console.error(
      `Mercado Pago devolvió ${response.status}. No se pudo obtener la lista de medios de pago.`,
    );
    process.exit(1);
  }

  const data = (await response.json()) as unknown;
  const list = (Array.isArray(data) ? (data as PaymentMethod[]) : []).map((method) => ({
    id: method.id,
    name: method.name,
    status: method.status,
  }));

  console.log(JSON.stringify(list, null, 2));
}

main().catch((error: unknown) => {
  console.error('No se pudo completar la consulta:', error instanceof Error ? error.message : error);
  process.exit(1);
});
