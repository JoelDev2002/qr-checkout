import { formatDateLima } from '../../lib/date';
import type { Cashier } from '../../types/user';

const buttonClasses =
  'min-h-[44px] rounded-button border border-line bg-surface px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50';

type CashierListProps = {
  cashiers: Cashier[];
  busyId: number | null;
  /** Cajero cuyo interruptor se pulsó y aún no se confirmó en esta misma pantalla. */
  confirmingId: number | null;
  onAsk: (cashier: Cashier) => void;
  onConfirm: (cashier: Cashier) => void;
  onCancel: () => void;
};

export function CashierList({
  cashiers,
  busyId,
  confirmingId,
  onAsk,
  onConfirm,
  onCancel,
}: CashierListProps) {
  return (
    <div className="overflow-x-auto rounded-tag border border-line">
      <table className="w-full min-w-[40rem] border-collapse bg-surface text-base">
        <caption className="sr-only">Lista de cajeros</caption>
        <thead>
          <tr className="bg-paper text-sm font-semibold text-ink">
            <th scope="col" className="p-2 text-left">
              Nombre
            </th>
            <th scope="col" className="p-2 text-left">
              Correo
            </th>
            <th scope="col" className="p-2 text-left">
              Estado
            </th>
            <th scope="col" className="p-2 text-left">
              Creado
            </th>
          </tr>
        </thead>
        <tbody>
          {cashiers.map((cashier) => {
            const busy = busyId === cashier.id;
            const confirming = confirmingId === cashier.id;
            const action = cashier.active ? 'Desactivar' : 'Activar';

            return (
              <tr key={cashier.id} className="border-t border-line">
                <td className="p-2">{cashier.name}</td>
                <td className="p-2">{cashier.email}</td>
                <td className="p-2">
                  {confirming ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-ink">
                        ¿{action} a «{cashier.name}»?
                      </span>
                      <button
                        type="button"
                        onClick={() => onConfirm(cashier)}
                        disabled={busy}
                        className={`${buttonClasses} bg-ink text-surface`}
                      >
                        Sí, {action.toLowerCase()}
                      </button>
                      <button type="button" onClick={onCancel} disabled={busy} className={buttonClasses}>
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={cashier.active}
                      aria-label={`Cajero ${cashier.name}: ${cashier.active ? 'activo' : 'inactivo'}`}
                      onClick={() => onAsk(cashier)}
                      disabled={busy}
                      className={`${buttonClasses} flex items-center gap-2`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-4 w-8 rounded-full ${cashier.active ? 'bg-saving' : 'bg-line'}`}
                      />
                      <span>{cashier.active ? 'Activo' : 'Inactivo'}</span>
                    </button>
                  )}
                </td>
                <td className="p-2">{formatDateLima(cashier.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
