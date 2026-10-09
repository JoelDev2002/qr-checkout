import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { normalizeQuantity, parseQuantityInput, stepQuantity } from './quantity';

type QuantityStepperProps = {
  /** Cantidad que muestra el contador; la maneja quien lo usa. */
  quantity: number;
  /** Menor entre el máximo por compra y el stock (RN-04). */
  maxQuantity: number;
  /** Con el carrito bloqueado por un QR, el contador no se puede tocar. */
  disabled?: boolean;
  /** Cantidad nueva dentro del rango [1, maxQuantity]. */
  onChange: (quantity: number) => void;
  /** Se pulsa − con cantidad 1: quien lo usa decide si pregunta por el quitar. */
  onRequestRemove: () => void;
};

const buttonClasses =
  'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-button border border-line bg-surface text-lg font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40';

const inputClasses =
  'min-h-[44px] w-14 rounded-button border border-line bg-surface text-center text-base tabular-nums text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40';

/** Contador − / + con número editable (DESIGN §3). No baja de 1 ni supera maxQuantity (RN-04, RN-19). */
export function QuantityStepper({
  quantity,
  maxQuantity,
  disabled = false,
  onChange,
  onRequestRemove,
}: QuantityStepperProps) {
  const inputId = useId();
  const max = Math.max(1, maxQuantity);
  const [draft, setDraft] = useState(String(quantity));

  useEffect(() => {
    setDraft(String(quantity));
  }, [quantity]);

  function commitDraft(): void {
    const parsed = parseQuantityInput(draft);
    const next = normalizeQuantity(parsed ?? quantity, max);

    setDraft(String(next));

    if (next !== quantity) {
      onChange(next);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    }
  }

  function decrement(): void {
    if (quantity <= 1) {
      onRequestRemove();
      return;
    }

    onChange(stepQuantity(quantity, -1, max));
  }

  function increment(): void {
    if (quantity >= max) {
      return;
    }

    onChange(stepQuantity(quantity, 1, max));
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Quitar una unidad"
        onClick={decrement}
        disabled={disabled}
        className={buttonClasses}
      >
        <span aria-hidden="true">−</span>
      </button>

      <label htmlFor={inputId} className="sr-only">
        Cantidad
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
        className={inputClasses}
      />

      <button
        type="button"
        aria-label="Agregar una unidad"
        onClick={increment}
        disabled={disabled || quantity >= max}
        className={buttonClasses}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
