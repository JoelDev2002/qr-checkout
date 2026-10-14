import { useEffect, useId, useRef, type ReactNode } from 'react';

const SIZE_CLASSES = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
} as const;

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Con una operación en curso, Escape y el fondo no cierran el modal. */
  busy?: boolean;
  /** 'lg' para contenido ancho, como el historial de ajustes de stock. */
  size?: keyof typeof SIZE_CLASSES;
  children: ReactNode;
};

/** Modal accesible: cierra con Escape y con clic en el fondo, y enfoca el panel al abrir. */
export function Modal({ open, title, onClose, busy = false, size = 'md', children }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(0,0,0,0.45)] px-4 py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${SIZE_CLASSES[size]} rounded-sheet border border-line bg-surface p-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`}
      >
        <h2 id={titleId} className="text-lg font-semibold text-ink">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
