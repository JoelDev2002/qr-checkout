import { formatMoney } from '../lib/money';

type PriceTagProps = {
  originalCents: number;
  /** Precio de oferta: el original menos la campaña que ganó (RN-01). */
  normalCents: number;
  cmrCents: number;
  hasCmr: boolean;
  campaignName?: string | null;
};

/** Porcentaje contra el precio original, redondeado a entero (DESIGN §3). */
function savingPercent(originalCents: number, priceCents: number): number | null {
  if (originalCents <= 0 || priceCents >= originalCents) {
    return null;
  }

  return Math.round((1 - priceCents / originalCents) * 100);
}

/** El bloque de precio que aparece igual en el escáner, el carrito y el cajero (DESIGN §3). */
export function PriceTag({ originalCents, normalCents, cmrCents, hasCmr, campaignName }: PriceTagProps) {
  const offerLabel = campaignName !== null && campaignName !== undefined && campaignName !== ''
    ? 'Oferta'
    : 'Normal';
  const showOriginal = normalCents < originalCents;
  const percent = hasCmr ? savingPercent(originalCents, cmrCents) : null;

  return (
    <section
      aria-label="Precios"
      className="rounded-tag border border-line bg-surface px-3 py-2 text-base tabular-nums"
    >
      {showOriginal && (
        <p className="text-base text-muted line-through">{formatMoney(originalCents)}</p>
      )}

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-muted">{offerLabel}</span>
        <span className="font-semibold text-ink">{formatMoney(normalCents)}</span>
      </div>

      {campaignName !== null && campaignName !== undefined && campaignName !== '' && (
        <p className="text-sm text-muted">{campaignName}</p>
      )}

      {hasCmr && (
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="rounded-tag bg-cmr px-1.5 py-0.5 text-sm font-semibold text-surface">
            CMR
          </span>
          <span className="text-2xl font-bold text-cmr">{formatMoney(cmrCents)}</span>
        </div>
      )}

      {percent !== null && <p className="text-sm font-semibold text-ink">−{percent}%</p>}
    </section>
  );
}
