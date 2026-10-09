import { formatMoney } from '../lib/money';
import { formatDiscountPercent } from '../lib/percent';

type PriceTagProps = {
  originalCents: number;
  /** Precio de oferta: el original menos la campaña que ganó (RN-01). */
  normalCents: number;
  cmrCents: number;
  hasCmr: boolean;
  /** Porcentaje ya redondeado que calcula el servidor (RN-18). */
  discountPercent: number | null;
  campaignName?: string | null;
  /** En la vista del escáner el precio CMR se muestra más grande (DESIGN §2). */
  large?: boolean;
};

/** El bloque de precio que aparece igual en el escáner, el carrito y el cajero (DESIGN §3). */
export function PriceTag({
  originalCents,
  normalCents,
  cmrCents,
  hasCmr,
  discountPercent,
  campaignName,
  large = false,
}: PriceTagProps) {
  const hasCampaign = campaignName !== null && campaignName !== undefined && campaignName !== '';
  const offerLabel = hasCampaign ? 'Oferta' : 'Normal';
  const showOriginal = normalCents < originalCents;
  const percent = formatDiscountPercent(discountPercent);
  const cmrSize = large ? 'text-4xl' : 'text-2xl';

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

      {hasCampaign && <p className="text-sm text-muted">{campaignName}</p>}

      {hasCmr && (
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="rounded-tag bg-cmr px-1.5 py-0.5 text-sm font-semibold text-surface">
            CMR
          </span>
          <span className={`${cmrSize} font-bold text-cmr`}>{formatMoney(cmrCents)}</span>
        </div>
      )}

      {percent !== null && <p className="text-sm font-semibold text-ink">{percent}</p>}
    </section>
  );
}
