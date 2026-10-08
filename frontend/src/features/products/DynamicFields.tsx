import { useId } from 'react';
import type { UseFormRegister } from 'react-hook-form';
import type { ProductFormValues } from './schema';
import type { CategoryField } from '../../types/category';

const fieldClasses =
  'min-h-[44px] w-full rounded-button border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

type DynamicFieldsProps = {
  /** Solo los campos activos de la categoría elegida, en su orden (RN-15). */
  fields: CategoryField[];
  register: UseFormRegister<ProductFormValues>;
  /** Mensaje de error por clave de campo, ya resuelto. */
  attributeErrors: Record<string, string | undefined>;
};

function RequiredMark({ required }: { required: boolean }) {
  if (!required) {
    return null;
  }

  return (
    <span className="ml-1 font-normal text-muted" aria-hidden="true">
      (obligatorio)
    </span>
  );
}

/** Dibuja los campos adicionales de una categoría: texto, número con unidad, lista y sí/no (DESIGN §3). */
export function DynamicFields({ fields, register, attributeErrors }: DynamicFieldsProps) {
  const groupId = useId();

  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => {
        const error = attributeErrors[field.key];
        const errorId = `${groupId}-${field.key}-error`;
        const describedBy = error === undefined ? undefined : errorId;
        const common = {
          'aria-invalid': error !== undefined,
          'aria-describedby': describedBy,
        } as const;

        if (field.type === 'BOOLEAN') {
          return (
            <fieldset key={field.key}>
              <legend className="text-sm font-semibold text-ink">
                {field.label}
                <RequiredMark required={field.required} />
              </legend>
              <div className="mt-1 flex gap-x-6">
                <label className="flex min-h-[44px] min-w-[44px] items-center gap-2 text-base text-ink">
                  <input
                    type="radio"
                    value="true"
                    {...register(`attributes.${field.key}`)}
                    className="h-5 w-5"
                  />
                  Sí
                </label>
                <label className="flex min-h-[44px] min-w-[44px] items-center gap-2 text-base text-ink">
                  <input
                    type="radio"
                    value="false"
                    {...register(`attributes.${field.key}`)}
                    className="h-5 w-5"
                  />
                  No
                </label>
              </div>
              {error !== undefined && (
                <p id={errorId} className="mt-1 text-sm text-cmr">
                  {error}
                </p>
              )}
            </fieldset>
          );
        }

        const label = (
          <label htmlFor={`${groupId}-${field.key}`} className="block text-sm font-semibold text-ink">
            {field.label}
            <RequiredMark required={field.required} />
            {field.type === 'NUMBER' && field.unit !== null && (
              <span className="ml-1 font-normal text-muted">({field.unit})</span>
            )}
          </label>
        );

        if (field.type === 'SELECT') {
          return (
            <div key={field.key}>
              {label}
              <select
                id={`${groupId}-${field.key}`}
                {...register(`attributes.${field.key}`)}
                {...common}
                className={`${fieldClasses} mt-2`}
              >
                <option value="">Elige una opción</option>
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {error !== undefined && (
                <p id={errorId} className="mt-1 text-sm text-cmr">
                  {error}
                </p>
              )}
            </div>
          );
        }

        return (
          <div key={field.key}>
            {label}
            <div className="mt-2 flex items-center gap-2">
              <input
                id={`${groupId}-${field.key}`}
                type="text"
                inputMode={field.type === 'NUMBER' ? 'decimal' : 'text'}
                autoComplete="off"
                {...register(`attributes.${field.key}`)}
                {...common}
                className={fieldClasses}
              />
              {field.type === 'NUMBER' && field.unit !== null && (
                <span className="text-base font-semibold text-muted">{field.unit}</span>
              )}
            </div>
            {error !== undefined && (
              <p id={errorId} className="mt-1 text-sm text-cmr">
                {error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
