import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { cashierResolver } from './resolver';
import type { CashierFormValues } from './schema';

const inputClasses =
  'mt-2 min-h-[44px] w-full rounded-button border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

const buttonClasses =
  'min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

const emptyForm: CashierFormValues = { name: '', email: '', password: '' };

type CashierFormProps = {
  onSubmit: (values: CashierFormValues) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
  submitError: string | null;
};

export function CashierForm({ onSubmit, onCancel, submitting, submitError }: CashierFormProps) {
  const form = useForm<CashierFormValues>({
    resolver: cashierResolver as Resolver<CashierFormValues>,
    defaultValues: emptyForm,
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
        <label htmlFor="cashier-name" className="block text-sm font-semibold text-ink">
          Nombre
        </label>
        <input
          id="cashier-name"
          autoComplete="name"
          {...register('name')}
          aria-invalid={errors.name !== undefined}
          className={inputClasses}
        />
        {errors.name !== undefined && <p className="mt-1 text-sm text-cmr">{errors.name.message}</p>}
      </div>

      <div className="mt-4 max-w-md">
        <label htmlFor="cashier-email" className="block text-sm font-semibold text-ink">
          Correo
        </label>
        <input
          id="cashier-email"
          type="email"
          autoComplete="off"
          {...register('email')}
          aria-invalid={errors.email !== undefined}
          className={inputClasses}
        />
        {errors.email !== undefined && (
          <p className="mt-1 text-sm text-cmr">{errors.email.message}</p>
        )}
      </div>

      <div className="mt-4 max-w-md">
        <label htmlFor="cashier-password" className="block text-sm font-semibold text-ink">
          Contraseña
        </label>
        <input
          id="cashier-password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
          aria-invalid={errors.password !== undefined}
          className={inputClasses}
        />
        {errors.password !== undefined && (
          <p className="mt-1 text-sm text-cmr">{errors.password.message}</p>
        )}
        <p className="mt-1 text-sm text-muted">Al menos 8 caracteres.</p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="submit" disabled={submitting} className={`${buttonClasses} bg-ink text-surface`}>
          {submitting ? 'Guardando…' : 'Crear cajero'}
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
