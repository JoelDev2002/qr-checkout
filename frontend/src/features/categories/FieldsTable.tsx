import { useFieldArray, type FieldErrors, type UseFormReturn } from 'react-hook-form';
import { FieldRow, type RowErrors } from './FieldRow';
import type { CategoryFormValues } from './schema';

export const FIELDS_NOTICE =
  'Los campos no se borran, solo se desactivan. Su tipo no se puede cambiar después de crearlos.';

const buttonClasses =
  'mt-3 min-h-[44px] rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50';

/** React Hook Form guarda los errores de un arreglo con la posición como clave. */
function rowErrorsAt(errors: FieldErrors<CategoryFormValues>, index: number): RowErrors {
  const rows = errors.fields as unknown as Record<string, unknown> | undefined;
  const row = rows?.[String(index)];

  return typeof row === 'object' && row !== null ? (row as RowErrors) : {};
}

type FieldsTableProps = {
  form: UseFormReturn<CategoryFormValues>;
  disabled: boolean;
};

export function FieldsTable({ form, disabled }: FieldsTableProps) {
  const { register, control, watch, setValue, formState } = form;
  const { fields, append, swap } = useFieldArray({ control, name: 'fields' });
  const rows = watch('fields');

  function addField() {
    append({
      key: '',
      label: '',
      type: 'TEXT',
      required: false,
      optionsText: '',
      unit: '',
      active: true,
    });
  }

  function toggleActive(index: number) {
    const row = rows[index];

    if (row === undefined) {
      return;
    }

    setValue(`fields.${index}.active`, !row.active, { shouldDirty: true });
  }

  return (
    <section className="mt-6" aria-labelledby="campos-adicionales">
      <h2 id="campos-adicionales" className="text-lg font-semibold text-ink">
        Campos adicionales
      </h2>
      <p className="mt-1 text-sm text-muted">{FIELDS_NOTICE}</p>

      <div className="mt-3 overflow-x-auto rounded-tag border border-line">
        <table className="w-full min-w-[64rem] border-collapse bg-surface text-base">
          <caption className="sr-only">
            Campos adicionales de la categoría, en el orden en que se mostrarán
          </caption>
          <thead>
            <tr className="bg-paper text-sm font-semibold text-ink">
              <th scope="col" className="p-2 text-left">
                Clave
              </th>
              <th scope="col" className="p-2 text-left">
                Nombre visible
              </th>
              <th scope="col" className="p-2 text-left">
                Tipo
              </th>
              <th scope="col" className="p-2 text-center">
                Obligatorio
              </th>
              <th scope="col" className="p-2 text-left">
                Opciones (solo lista)
              </th>
              <th scope="col" className="p-2 text-left">
                Unidad (solo número)
              </th>
              <th scope="col" className="p-2 text-left">
                Orden
              </th>
              <th scope="col" className="p-2 text-left">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => {
              const row = rows[index];

              if (row === undefined) {
                return null;
              }

              return (
                <FieldRow
                  key={field.id}
                  index={index}
                  row={row}
                  rowCount={rows.length}
                  rowErrors={rowErrorsAt(formState.errors, index)}
                  register={register}
                  onMoveUp={() => swap(index, index - 1)}
                  onMoveDown={() => swap(index, index + 1)}
                  onToggleActive={() => toggleActive(index)}
                  disabled={disabled}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="mt-2 text-sm text-muted">
          Esta categoría todavía no tiene campos. Puedes añadir los que necesites.
        </p>
      )}

      <button type="button" onClick={addField} disabled={disabled} className={buttonClasses}>
        Añadir campo
      </button>
    </section>
  );
}
