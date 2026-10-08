import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { formatBarcode } from '../../lib/productDisplay';

const buttonClasses =
  'min-h-[44px] rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

type BarcodeCardProps = {
  /** Solo se muestra con un EAN-13 completo; el aviso del código malo vive en el campo. */
  barcode: string;
};

/** Código de barras del producto con su botón Imprimir (ARCHITECTURE.md §11). */
export function BarcodeCard({ barcode }: BarcodeCardProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current === null) {
      return;
    }

    try {
      JsBarcode(svgRef.current, barcode, {
        format: 'EAN13',
        displayValue: true,
        fontSize: 14,
        height: 60,
        width: 2,
        margin: 10,
        lineColor: '#172033',
        background: '#FFFFFF',
      });
    } catch {
      // Un código que JsBarcode no sabe dibujar ya está avisado en el campo.
    }
  }, [barcode]);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <div className="print-area rounded-tag border border-line bg-surface p-3">
        <svg ref={svgRef} aria-hidden="true" />
        <p className="mt-1 text-center text-base font-semibold tabular-nums text-ink">
          {formatBarcode(barcode)}
        </p>
      </div>
      <button type="button" onClick={() => window.print()} className={buttonClasses}>
        Imprimir
      </button>
    </div>
  );
}
