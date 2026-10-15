import { StatusSwitch } from '../../components/StatusSwitch';
import { formatDateLima } from '../../lib/date';
import type { Cashier } from '../../types/user';

type CashierListProps = {
  cashiers: Cashier[];
  busyId: number | null;
  /** Pide confirmación en un modal antes de cambiar el estado (RN-12). */
  onAsk: (cashier: Cashier) => void;
};

export function CashierList({ cashiers, busyId, onAsk }: CashierListProps) {
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

            return (
              <tr key={cashier.id} className="border-t border-line">
                <td className="p-2">{cashier.name}</td>
                <td className="p-2">{cashier.email}</td>
                <td className="p-2">
                  <StatusSwitch
                    checked={cashier.active}
                    label={`Cajero ${cashier.name}: ${cashier.active ? 'activo' : 'inactivo'}`}
                    busy={busy}
                    onAsk={() => onAsk(cashier)}
                  />
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
