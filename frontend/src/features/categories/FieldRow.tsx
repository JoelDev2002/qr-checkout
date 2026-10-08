import type { UseFormRegister } from 'react-hook-form';
import type { CategoryFormValues, FieldFormValues } from './schema';

export type RowErrors = Partial<Record<keyof FieldFormValues, { message?: string }>>;

const inputClasses =
  'min-h-[44px] w-full rounded-button border border-line bg-surface px-2 py-1 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

const buttonClasses =
  'min-h-[44px] min-w-[44px] rounded-button border border-line bg-surface px-2 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50';

const TYPE_LABELS: Record<FieldFormValues['type'], string> = {
  TEXT: 'texto',
  NUMBER: 'número',
  SELECT: 'lista',
  BOOLEAN: 'sí/no',
};

type FieldRowProps = {
  index: number;
  row: FieldFormValues;
  rowCount: number;
  rowErrors: RowErrors;
  register: UseFormRegister<CategoryFormValues>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleActive: () => void;
  disabled: boolean;
};

function ErrorMessage({ message }: { message?: string }) {
  if (message === undefined) {
    return null;
  }

  return <p className="mt-1 text-sm text-cmr">{message}</p>;
}

export function FieldRow({
  index,
  row,
  rowCount,
  rowErrors,
  register,
  onMoveUp,
  onMoveDown,
  onToggleActive,
  disabled,
}: FieldRowProps) {
  const exists = typeof row.id === 'number';
  const dim = row.active ? '' : 'opacity-60';

  return (
    <tr className={`border-t border-line ${row.active ? '' : 'bg-paper'}`}>
      <td className={`p-2 align-top ${dim}`}>
        {exists ? (
          <p className="flex min-h-[44px] items-center text-base text-ink">{row.key}</p>
        ) : (
          <>
            <input
              {...register(`fields.${index}.key`)}
              aria-label="Clave del campo"
              placeholder="talla"
              className={inputClasses}
            />
            <ErrorMessage message={rowErrors.key?.message} />
          </>
        )}
      </td>
      <td className={`p-2 align-top ${dim}`}>
        <input
          {...register(`fields.${index}.label`)}
          aria-label="Nombre visible del campo"
          className={inputClasses}
        />
        <ErrorMessage message={rowErrors.label?.message} />
      </td>
      <td className={`p-2 align-top ${dim}`}>
        {exists ? (
          <p className="flex min-h-[44px] items-center text-base text-ink">{TYPE_LABELS[row.type]}</p>
        ) : (
          <>
            <select
              {...register(`fields.${index}.type`)}
              aria-label="Tipo del campo"
              className={inputClasses}
            >
              <option value="TEXT">texto</option>
              <option value="NUMBER">número</option>
              <option value="SELECT">lista</option>
              <option value="BOOLEAN">sí/no</option>
            </select>
            <ErrorMessage message={rowErrors.type?.message} />
          </>
        )}
      </td>
      <td className={`p-2 align-top ${dim}`}>
        <label className="flex min-h-[44px] min-w-[44px] items-center justify-center">
          <input
            type="checkbox"
            {...register(`fields.${index}.required`)}
            aria-label="Campo obligatorio"
            className="h-5 w-5"
          />
        </label>
        <ErrorMessage message={rowErrors.required?.message} />
      </td>
      <td className={`p-2 align-top ${dim}`}>
        {row.type === 'SELECT' && (
          <>
            <textarea
              rows={3}
              {...register(`fields.${index}.optionsText`)}
              aria-label="Opciones del campo, una por línea"
              placeholder={'Una opción por línea'}
              className={inputClasses}
            />
            <ErrorMessage message={rowErrors.optionsText?.message} />
          </>
        )}
      </td>
      <td className={`p-2 align-top ${dim}`}>
        {row.type === 'NUMBER' && (
          <>
            <input
              {...register(`fields.${index}.unit`)}
              aria-label="Unidad del campo"
              placeholder="Opcional"
              className={inputClasses}
            />
            <ErrorMessage message={rowErrors.unit?.message} />
          </>
        )}
      </td>
      <td className="p-2 align-top">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={disabled || index === 0}
            aria-label={`Subir ${row.label === '' ? 'el campo' : row.label}`}
            className={buttonClasses}
          >
            Subir
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={disabled || index === rowCount - 1}
            aria-label={`Bajar ${row.label === '' ? 'el campo' : row.label}`}
            className={buttonClasses}
          >
            Bajar
          </button>
        </div>
      </td>
      <td className="p-2 align-top">
        <div className="flex flex-col items-start gap-1">
          {row.active ? (
            <button
              type="button"
              onClick={onToggleActive}
              disabled={disabled}
              className={buttonClasses}
            >
              Desactivar
            </button>
          ) : (
            <>
              <span className="flex min-h-[44px] items-center text-sm font-semibold text-warn">
                Inactivo
              </span>
              <button
                type="button"
                onClick={onToggleActive}
                disabled={disabled}
                className={buttonClasses}
              >
                Reactivar
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
