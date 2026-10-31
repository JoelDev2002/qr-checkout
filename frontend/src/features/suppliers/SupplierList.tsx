import { StatusSwitch } from '../../components/StatusSwitch';
import type { Supplier } from '../../types/supplier';

type SupplierListProps = {
  suppliers: Supplier[];
  busyId: number | null;
  onEdit: (supplier: Supplier) => void;
  /** Pide confirmación en un modal antes de cambiar el estado: los proveedores no se borran. */
  onAsk: (supplier: Supplier) => void;
};

export function SupplierList({ suppliers, busyId, onEdit, onAsk }: SupplierListProps) {
  return (
    <div className="overflow-x-auto rounded-tag border border-line">
      <table className="w-full min-w-[44rem] border-collapse bg-surface text-base">
        <caption className="sr-only">Lista de proveedores</caption>
        <thead>
          <tr className="bg-paper text-sm font-semibold text-ink">
            <th scope="col" className="p-2 text-left">
              RUC
            </th>
            <th scope="col" className="p-2 text-left">
              Razón social
            </th>
            <th scope="col" className="p-2 text-left">
              Contacto
            </th>
            <th scope="col" className="p-2 text-left">
              Estado
            </th>
            <th scope="col" className="p-2 text-left">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((supplier) => {
            const contact = [supplier.contactName, supplier.phone, supplier.email]
              .filter((value): value is string => value !== null)
              .join(' · ');

            return (
              <tr key={supplier.id} className="border-t border-line">
                <td className="p-2 font-mono">{supplier.ruc}</td>
                <td className="p-2">{supplier.businessName}</td>
                <td className="p-2 text-sm text-muted">{contact === '' ? '—' : contact}</td>
                <td className="p-2">
                  <StatusSwitch
                    checked={supplier.active}
                    label={`Proveedor ${supplier.businessName}: ${supplier.active ? 'activo' : 'inactivo'}`}
                    busy={busyId === supplier.id}
                    onAsk={() => onAsk(supplier)}
                  />
                </td>
                <td className="p-2 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit(supplier)}
                    className="min-h-[44px] rounded-button border border-line bg-surface px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
