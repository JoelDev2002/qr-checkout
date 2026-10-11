/**
 * Sonda de entorno para T3.3 parte B. Se ejecuta en un proceso aparte (tsx) y solo importa
 * la validación de `config/env.ts`. Ignora el `.env` real para controlar las variables desde
 * el proceso padre, de modo que la prueba pueda simular un `JWT_SECRET` corto o ausente.
 */

process.loadEnvFile = () => {
  throw new Error('envProbe: se ignora .env a propósito, el entorno lo fija la prueba');
};

await import('../../src/config/env.js');

console.log('ENV_OK');
