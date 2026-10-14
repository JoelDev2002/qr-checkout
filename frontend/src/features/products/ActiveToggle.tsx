const buttonClasses =
  'min-h-[44px] rounded-button border border-line bg-surface px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50';

type ActiveToggleTarget = {
  name: string;
  active: boolean;
};

type ActiveToggleProps = {
  product: ActiveToggleTarget;
  busy: boolean;
  /** Pide confirmación en un modal antes de cambiar el estado (RN-12). */
  onAsk: () => void;
};

/** RN-12: activar o desactivar un producto, siempre con confirmación. */
export function ActiveToggle({ product, busy, onAsk }: ActiveToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={product.active}
      aria-label={`Producto ${product.name}: ${product.active ? 'activo' : 'inactivo'}`}
      onClick={onAsk}
      disabled={busy}
      className={`${buttonClasses} flex items-center gap-2`}
    >
      <span
        aria-hidden="true"
        className={`h-4 w-8 rounded-full ${product.active ? 'bg-saving' : 'bg-line'}`}
      />
      <span>{product.active ? 'Activo' : 'Inactivo'}</span>
    </button>
  );
}
