import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Las pruebas de API comparten la base de pruebas, así que no se ejecutan en paralelo.
    fileParallelism: false,
  },
});