export type InstallmentsConfig = {
  /** Cantidades ofrecidas, por ejemplo 3, 6 y 12. */
  options: readonly number[];
  /** Con un total menor no se ofrece ninguna cuota (RN-10). */
  minTotalCents: number;
};

export type InstallmentOption = {
  count: number;
  /** Monto de las cuotas 2 a n. */
  installmentCents: number;
  /** La primera cuota absorbe los céntimos sobrantes (RN-10). */
  firstInstallmentCents: number;
};

function usableCounts(options: readonly number[]): number[] {
  const valid = options.filter((count) => Number.isInteger(count) && count > 0);

  return [...new Set(valid)].sort((a, b) => a - b);
}

/** Cuotas informativas de un total: la app no financia nada, solo muestra cuánto sería. */
export function getInstallments(totalCents: number, config: InstallmentsConfig): InstallmentOption[] {
  if (totalCents < config.minTotalCents) {
    return [];
  }

  return usableCounts(config.options).map((count) => {
    const installmentCents = Math.floor(totalCents / count);

    return {
      count,
      installmentCents,
      firstInstallmentCents: installmentCents + (totalCents % count),
    };
  });
}
