import { formatMoney } from '../../lib/money';
import type { CartSummary as CartSummaryData } from '../../services/cart';

type SummaryLineProps = {
  label: string;
  value: string;
  emphasis?: 'default' | 'cmr' | 'saving';
};

function SummaryLine({ label, value, emphasis = 'default' }: SummaryLineProps) {
  const labelClass =
    emphasis === 'cmr'
      ? 'font-semibold text-ink'
      : emphasis === 'saving'
        ? 'font-semibold text-saving'
        : 'text-muted';
  const valueClass =
    emphasis === 'cmr'
      ? 'text-lg font-bold text-cmr'
      : emphasis === 'saving'
        ? 'font-semibold text-saving'
        : 'text-ink';

  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={labelClass}>{label}</dt>
      <dd className={`tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  );
}

/**
 * Las cuatro líneas del resumen de Falabella más el ahorro (RN-02, DESIGN §3). Los montos vienen
 * del resumen que ya calculó el servidor: aquí no se recalcula nada.
 */
export function CartSummary({ summary }: { summary: CartSummaryData }) {
  return (
    <section
      aria-label="Resumen del carrito"
      className="rounded-sheet border border-line bg-surface p-4 text-base"
    >
      <dl className="flex flex-col gap-1">
        <SummaryLine label="Productos" value={formatMoney(summary.originalTotalCents)} />
        <SummaryLine label="Descuentos" value={formatMoney(-summary.discountTotalCents)} />
        <SummaryLine label="Total" value={formatMoney(summary.normalTotalCents)} />
        <div className="mt-1 border-t border-line pt-2">
          <SummaryLine label="Total con CMR" value={formatMoney(summary.cmrTotalCents)} emphasis="cmr" />
        </div>
        {summary.cmrSavingCents > 0 && (
          <SummaryLine
            label="Ahorras con CMR"
            value={formatMoney(summary.cmrSavingCents)}
            emphasis="saving"
          />
        )}
      </dl>
    </section>
  );
}
