const buttonClasses =
  'min-h-[44px] rounded-button border border-line bg-surface px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50';

type ActiveToggleTarget = {
  name: string;
  active: boolean;
};

type ActiveToggleProps = {
  product: ActiveToggleTarget;
  busy: boolean;
  /** true cuando el admin puso el interruptor y aún no confirmó en esta misma pantalla. */
  awaiting: boolean;
  onAsk: () => void;
  onConfirm: () => void;
  onCancel: () => void;
};

/** RN-12: activar o desactivar un producto, siempre con confirmación en la misma pantalla. */
export function ActiveToggle({ product, busy, awaiting, onAsk, onConfirm, onCancel }: ActiveToggleProps) {
  if (awaiting) {
    const action = product.active ? 'Desactivar' : 'Activar';

    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink">
          ¿{action} «{product.name}»?
        </span>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`${buttonClasses} bg-ink text-surface`}
        >
          Sí, {action.toLowerCase()}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={buttonClasses}>
          No
        </button>
      </div>
    );
  }

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
