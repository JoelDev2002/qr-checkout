import { StatusSwitch } from '../../components/StatusSwitch';
import type { Category } from '../../types/category';

const buttonClasses =
  'min-h-[44px] rounded-button border border-line bg-surface px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50';

type CategoryListProps = {
  categories: Category[];
  busyId: number | null;
  onEdit: (category: Category) => void;
  /** Pide confirmación en un modal antes de cambiar el estado (RN-12). */
  onAsk: (category: Category) => void;
};

export function CategoryList({ categories, busyId, onEdit, onAsk }: CategoryListProps) {
  return (
    <div className="overflow-x-auto rounded-tag border border-line">
      <table className="w-full min-w-[40rem] border-collapse bg-surface text-base">
        <caption className="sr-only">Lista de categorías</caption>
        <thead>
          <tr className="bg-paper text-sm font-semibold text-ink">
            <th scope="col" className="p-2 text-left">
              Nombre
            </th>
            <th scope="col" className="p-2 text-left">
              Estado
            </th>
            <th scope="col" className="p-2 text-center">
              Campos
            </th>
            <th scope="col" className="p-2 text-left">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => {
            const busy = busyId === category.id;

            return (
              <tr key={category.id} className="border-t border-line">
                <td className="p-2">{category.name}</td>
                <td className="p-2">
                  <StatusSwitch
                    checked={category.active}
                    label={`Categoría ${category.name}: ${category.active ? 'activa' : 'inactiva'}`}
                    busy={busy}
                    onAsk={() => onAsk(category)}
                  />
                </td>
                <td className="p-2 text-center">{category.fields.length}</td>
                <td className="p-2">
                  <button
                    type="button"
                    onClick={() => onEdit(category)}
                    disabled={busy}
                    className={buttonClasses}
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