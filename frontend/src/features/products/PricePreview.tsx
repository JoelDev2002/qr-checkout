import { useEffect, useState } from 'react';
import { PriceTag } from '../../components/PriceTag';
import { formatMoney } from '../../lib/money';
import { parseCmrPercent, parseOriginalPrice } from '../../lib/productForm';
import { ApiError } from '../../services/api';
import { previewPrice, type PricePreview as PricePreviewResult } from '../../services/products';

/** La espera antes de consultar, para no mandar una petición por cada tecla. */
const PREVIEW_DEBOUNCE_MS = 300;

const buttonClasses =
  'min-h-[44px] rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

type PricePreviewProps = {
  originalPrice: string;
  categoryId: string;
  hasCmrDiscount: boolean;
  cmrPercent: string;
  /** Solo al editar: para que las campañas por producto también aparezcan en la vista previa. */
  productId?: number;
};

function toMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/** Vista previa de precios calculada por el servidor (DESIGN §4, admin punto 6). */
export function PricePreview({
  originalPrice,
  categoryId,
  hasCmrDiscount,
  cmrPercent,
  productId,
}: PricePreviewProps) {
  const [preview, setPreview] = useState<PricePreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const price = parseOriginalPrice(originalPrice);
  const percent = hasCmrDiscount ? parseCmrPercent(cmrPercent) : ({ ok: true, value: 0 } as const);
  const categoryReady = /^[1-9]\d*$/.test(categoryId.trim());
  const ready = categoryReady && price.ok && percent.ok;

  useEffect(() => {
    if (!ready || !price.ok || !percent.ok) {
      setPreview(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);

      previewPrice({
        originalPriceCents: price.value,
        categoryId: Number(categoryId),
        hasCmrDiscount,
        cmrDiscountBps: percent.value,
        productId,
      })
        .then((result) => {
          if (!cancelled) {
            setPreview(result);
          }
        })
        .catch((caught: unknown) => {
          if (!cancelled) {
            setPreview(null);
            setError(toMessage(caught));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // Los textos son las dependencias reales: price y percent se derivan de ellos en cada vuelta.
  }, [originalPrice, categoryId, hasCmrDiscount, cmrPercent, productId, retryKey]);

  return (
    <section aria-label="Vista previa de precios" className="mt-4">
      <h3 className="text-sm font-semibold text-ink">Vista previa de precios</h3>

      {!ready && (
        <p className="mt-2 text-sm text-muted">
          Elige la categoría y escribe el precio (y el porcentaje CMR, si corresponde) para ver la
          vista previa.
        </p>
      )}

      {ready && loading && preview === null && (
        <p role="status" className="mt-2 text-sm text-muted">
          Calculando precios…
        </p>
      )}

      {ready && error !== null && (
        <div role="alert" className="mt-2 rounded-tag border border-cmr px-3 py-2">
          <p className="text-sm text-cmr">{error}</p>
          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
            className={`${buttonClasses} mt-2`}
          >
            Reintentar
          </button>
        </div>
      )}

      {ready && error === null && preview !== null && (
        <div className="mt-2 max-w-sm">
          <PriceTag
            originalCents={price.ok ? price.value : 0}
            normalCents={preview.offerPriceCents}
            cmrCents={preview.cmrPriceCents}
            hasCmr={hasCmrDiscount}
            campaignName={preview.campaignName}
          />
          {hasCmrDiscount && preview.cmrSavingCents > 0 && (
            <p className="mt-1 text-sm text-saving">
              Ahorras {formatMoney(preview.cmrSavingCents)} con CMR
            </p>
          )}
        </div>
      )}
    </section>
  );
}
