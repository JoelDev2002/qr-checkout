import { useEffect, useState } from 'react';
import { formatMoney } from '../../lib/money';
import type { InstallmentOption } from '../../services/cart';
import { defaultInstallmentCount } from './cartRules';

const optionButtonClasses = (selected: boolean) =>
  `min-h-[44px] min-w-[44px] rounded-button border px-3 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
    selected
      ? 'border-ink bg-ink text-surface'
      : 'border-line bg-surface text-ink'
  }`;

type InstallmentPickerProps = {
  /** Opciones que entrega el servidor según el total (RN-10); vacío si no aplican cuotas. */
  installments: readonly InstallmentOption[];
};

/**
 * Cuotas informativas del carrito (RN-10, T3.2): selector de 3, 6 y 12 y la línea informativa. La
 * app no financia nada; solo muestra cuánto sería cada cuota con el total CMR que ya calculó la API.
 */
export function InstallmentPicker({ installments }: InstallmentPickerProps) {
  const [count, setCount] = useState<number | null>(() => defaultInstallmentCount(installments));

  useEffect(() => {
    setCount((current) => {
      if (installments.length === 0) {
        return null;
      }

      if (current !== null && installments.some((option) => option.count === current)) {
        return current;
      }

      return defaultInstallmentCount(installments);
    });
  }, [installments]);

  if (count === null) {
    return null;
  }

  const selected = installments.find((option) => option.count === count) ?? null;

  if (selected === null) {
    return null;
  }

  return (
    <section
      aria-label="Cuotas sin intereses"
      className="rounded-sheet border border-line bg-surface p-4"
    >
      <p className="text-sm font-semibold text-ink">Cuotas sin intereses</p>
      <div className="mt-2 flex gap-2">
        {installments.map((option) => (
          <button
            key={option.count}
            type="button"
            aria-pressed={option.count === count}
            onClick={() => setCount(option.count)}
            className={optionButtonClasses(option.count === count)}
          >
            {option.count}
          </button>
        ))}
      </div>
      <p className="mt-3 text-base text-ink">
        o {selected.count} cuotas de aprox.{' '}
        <span className="font-semibold tabular-nums">{formatMoney(selected.installmentCents)}</span>{' '}
        con CMR
      </p>
      <p className="mt-1 text-sm text-muted">Solo referencial: no cambia lo que pagas.</p>
    </section>
  );
}