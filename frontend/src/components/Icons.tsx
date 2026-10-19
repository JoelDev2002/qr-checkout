/** Íconos sueltos para botones de solo icono (llevan `aria-label` y `title` en el botón). */

type IconProps = {
  className?: string;
};

/** Lápiz: editar un registro. */
export function PencilIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

/** Caja con el signo ±: ajustar el stock (subir o bajar la cantidad). */
export function StockAdjustIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M12 8v4" />
      <path d="M10 10h4" />
      <path d="M10 15.5h4" />
    </svg>
  );
}
