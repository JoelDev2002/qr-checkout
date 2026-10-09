import { PriceTag } from '../../components/PriceTag';
import type { CartItem } from '../../services/cart';
import { itemIssueMessage } from './cartRules';
import { QuantityStepper } from './QuantityStepper';

const removeButtonClasses =
  'min-h-[44px] shrink-0 rounded-button border border-line bg-surface px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40';

type ProductRowProps = {
  item: CartItem;
  /** Cantidad que muestra el contador; puede adelantarse al servidor mientras se envía. */
  quantity: number;
  /** Con el carrito bloqueado por un QR, todos los controles quedan deshabilitados (RN-06). */
  disabled: boolean;
  /** Cantidad nueva dentro del rango [1, maxQuantity]. */
  onChangeQuantity: (quantity: number) => void;
  /** Se pulsó − con cantidad 1. */
  onRequestRemove: () => void;
  /** Botón quitar. */
  onRemove: () => void;
};

/**
 * Fila de un producto del carrito (DESIGN §3): nombre, marca, PriceTag compacto, contador y quitar.
 * Un ítem inactivo o sin stock muestra su aviso y bloquea el QR hasta quitarlo o ajustarlo.
 */
export function ProductRow({
  item,
  quantity,
  disabled,
  onChangeQuantity,
  onRequestRemove,
  onRemove,
}: ProductRowProps) {
  const issue = itemIssueMessage(item.issue);

  return (
    <li className="rounded-sheet border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{item.name}</p>
          <p className="text-sm text-muted">{item.brand}</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Quitar ${item.name} del carrito`}
          className={removeButtonClasses}
        >
          Quitar
        </button>
      </div>

      <div className="mt-3">
        <PriceTag
          originalCents={item.originalPriceCents}
          normalCents={item.offerPriceCents}
          cmrCents={item.cmrPriceCents}
          hasCmr={item.hasCmrDiscount}
          discountPercent={null}
          campaignName={item.campaignName}
        />
      </div>

      {issue !== null && (
        <p
          role="alert"
          className="mt-3 rounded-tag border border-warn bg-paper px-3 py-2 text-sm text-warn"
        >
          {issue}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <QuantityStepper
          quantity={quantity}
          maxQuantity={item.maxQuantity}
          disabled={disabled}
          onChange={onChangeQuantity}
          onRequestRemove={onRequestRemove}
        />
        <span className="text-sm text-muted">máx. {item.maxQuantity}</span>
      </div>
    </li>
  );
}
