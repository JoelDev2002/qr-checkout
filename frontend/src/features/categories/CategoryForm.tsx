import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { emptyCategoryForm } from './converters';
import { FieldsTable } from './FieldsTable';
import { categoryResolver } from './resolver';
import type { CategoryFormValues } from './schema';

const inputClasses =
  'mt-2 min-h-[44px] w-full rounded-button border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

const buttonClasses =
  'min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

type CategoryFormProps = {
  initial?: CategoryFormValues;
  onSubmit: (values: CategoryFormValues) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
  submitError: string | null;
};

export function CategoryForm({ initial, onSubmit, onCancel, submitting, submitError }: CategoryFormProps) {
  const form = useForm<CategoryFormValues>({
    resolver: categoryResolver as Resolver<CategoryFormValues>,
    defaultValues: initial ?? emptyCategoryForm(),
  });
  const { register, handleSubmit, formState: { errors } } = form;

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        await onSubmit(values);
      })}
      noValidate
      className="mt-6 rounded-sheet border border-line bg-surface px-4 py-6"
    >
      {submitError !== null && (
        <p role="alert" className="mb-4 rounded-tag border border-cmr px-3 py-2 text-sm text-cmr">
          {submitError}
        </p>
      )}

      <div className="max-w-md">
        <label htmlFor="category-name" className="block text-sm font-semibold text-ink">
          Nombre
        </label>
        <input
          id="category-name"
          {...register('name')}
          aria-invalid={errors.name !== undefined}
          className={inputClasses}
        />
        {errors.name !== undefined && (
          <p className="mt-1 text-sm text-cmr">{errors.name.message}</p>
        )}
      </div>

      <div className="mt-4">
        <label className="flex min-h-[44px] min-w-[44px] items-center gap-2 text-base text-ink">
          <input
            type="checkbox"
            {...register('active')}
            aria-label="Categoría activa"
            className="h-5 w-5"
          />
          Activa
        </label>
        {errors.active !== undefined && (
          <p className="text-sm text-cmr">{errors.active.message}</p>
        )}
      </div>

      <FieldsTable form={form} disabled={submitting} />

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting}
          className={`${buttonClasses} bg-ink text-surface`}
        >
          {submitting ? 'Guardando…' : 'Guardar categoría'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className={`${buttonClasses} border border-line bg-surface text-ink`}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}