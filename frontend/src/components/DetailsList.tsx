import type { DisplayAttribute } from '../types/category';

type DetailsListProps = {
  details: DisplayAttribute[];
};

/** Bloque plegable "Detalles" con los campos de la categoría del producto (DESIGN §3). */
export function DetailsList({ details }: DetailsListProps) {
  if (details.length === 0) {
    return null;
  }

  return (
    <details className="mt-2 rounded-button border border-line bg-surface px-3 py-2">
      <summary className="min-h-[44px] cursor-pointer py-2 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        Detalles
      </summary>

      <dl className="mt-1 flex flex-col gap-1 text-base">
        {details.map((detail) => (
          <div key={detail.key} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">{detail.label}</dt>
            <dd className="tabular-nums text-ink">
              {detail.value}
              {detail.unit !== null ? ` ${detail.unit}` : ''}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
