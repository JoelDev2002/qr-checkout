import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Los .test.ts corren en node. Los .test.tsx piden jsdom con el docblock
    // `@vitest-environment jsdom`, así el entorno de DOM queda solo para componentes.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});