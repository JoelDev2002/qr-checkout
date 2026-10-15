const buttonClasses =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-button focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50';

const trackClasses =
  'relative inline-flex h-7 w-12 items-center rounded-full p-0.5 transition-colors motion-reduce:transition-none';

const knobClasses =
  'inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface transition-transform duration-200 motion-reduce:transition-none';

type StatusSwitchProps = {
  checked: boolean;
  /** Texto que leen los lectores de pantalla, por ejemplo "Producto Redmi: activo". */
  label: string;
  busy: boolean;
  /** Pide confirmación en un modal antes de cambiar el estado (RN-12). */
  onAsk: () => void;
};

/** Ícono de visto bueno: el estado está activo. */
function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-3.5 w-3.5"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Ícono de aspa: el estado está inactivo. */
function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-3.5 w-3.5"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * Interruptor de activo/inactivo con un ícono dentro de la bolita (visto bueno o aspa), para que el
 * estado no dependa solo del color (DESIGN §6). Al tocarlo pide confirmación mediante `onAsk` (RN-12).
 */
export function StatusSwitch({ checked, label, busy, onAsk }: StatusSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onAsk}
      disabled={busy}
      className={buttonClasses}
    >
      <span aria-hidden="true" className={`${trackClasses} ${checked ? 'bg-saving' : 'bg-line'}`}>
        <span className={`${knobClasses} ${checked ? 'translate-x-5 text-saving' : 'translate-x-0 text-muted'}`}>
          {checked ? <CheckIcon /> : <XIcon />}
        </span>
      </span>
    </button>
  );
}
