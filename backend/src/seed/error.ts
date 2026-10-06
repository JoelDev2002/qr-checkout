export class SeedCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedCatalogError';
  }
}

export function fail(message: string): never {
  throw new SeedCatalogError(message);
}
