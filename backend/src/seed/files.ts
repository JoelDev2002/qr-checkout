import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SeedCatalogError } from './error.js';
import type { SeedCatalogInput } from './schemas.js';

export const SEED_DATA_FILES = {
  categories: 'categories.json',
  campaigns: 'campaigns.json',
  products: 'products.json',
} as const;

function readJson(directory: string, fileName: string): unknown {
  const path = join(directory, fileName);

  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    const motivo = error instanceof Error ? error.message : 'error desconocido.';
    throw new SeedCatalogError(`No se pudo leer ${path}: ${motivo}`);
  }
}

/** Lee los tres archivos del catálogo sin validar: la validación es de loadCatalog. */
export function readSeedData(directory: string): SeedCatalogInput {
  return {
    categories: readJson(directory, SEED_DATA_FILES.categories),
    campaigns: readJson(directory, SEED_DATA_FILES.campaigns),
    products: readJson(directory, SEED_DATA_FILES.products),
  };
}
