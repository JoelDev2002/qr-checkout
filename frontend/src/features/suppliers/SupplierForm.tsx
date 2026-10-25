import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import type { Supplier } from '../../types/supplier';
import { supplierResolver } from './resolver';
import { emptySupplierForm, type SupplierFormOutput, type SupplierFormValues } from './schema';

const inputClasses =
  'mt-2 min-h-[44px] w-full rounded-button border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

const buttonClasses =
  'min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

type SupplierFormProps = {
  /** Si llega, el formulario edita ese proveedor y el RUC queda bloqueado. */
  supplier: Supplier | null;
  onSubmit: (values: SupplierFormOutput) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
  submitError: string | null;
};

function toFormValues(supplier: Supplier | null): SupplierFormValues {
  if (supplier === null) {
    return emptySupplierForm;
  }

  return {
    ruc: supplier.ruc,
    businessName: supplier.businessName,
    contactName: supplier.contactName ?? '',
    phone: supplier.phone ?? '',
    email: supplier.email ?? '',
    address: supplier.address ?? '',
  };
}

type FieldName = keyof SupplierFormValues;

const FIELDS: Array<{ name: FieldName; label: string; type?: string; autoComplete: string; hint?: string }> = [
  { name: 'ruc', label: 'RUC', autoComplete: 'off', hint: '11 dígitos. No se puede cambiar después.' },
  { name: 'businessName', label: 'Razón social', autoComplete: 'organization' },
  { name: 'contactName', label: 'Contacto (opcional)', autoComplete: 'name' },
  { name: 'phone', label: 'Teléfono (opcional)', type: 'tel', autoComplete: 'tel' },
  { name: 'email', label: 'Correo (opcional)', type: 'email', autoComplete: 'email' },
  { name: 'address', label: 'Dirección (opcional)', autoComplete: 'street-address' },
];

export function SupplierForm({ supplier, onSubmit, onCancel, submitting, submitError }: SupplierFormProps) {
  const editing = supplier !== null;
  const form = useForm<SupplierFormValues, unknown, SupplierFormOutput>({
    resolver: supplierResolver as unknown as Resolver<SupplierFormValues, unknown, SupplierFormOutput>,
    defaultValues: toFormValues(supplier),
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        await onSubmit(values);
      })}
      noValidate
      className="mt-6 rounded-sheet border border-line bg-surface px-4 py-6"
    >
      <h3 className="text-lg font-semibold text-ink">
        {editing ? `Editar «${supplier.businessName}»` : 'Nuevo proveedor'}
      </h3>

      {submitError !== null && (
        <p role="alert" className="mt-4 rounded-tag border border-cmr px-3 py-2 text-sm text-cmr">
          {submitError}
        </p>
      )}

      <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
        {FIELDS.map((field) => {
          const id = `supplier-${field.name}`;
          const error = errors[field.name];
          const locked = editing && field.name === 'ruc';

          return (
            <div key={field.name} className="mt-4">
              <label htmlFor={id} className="block text-sm font-semibold text-ink">
                {field.label}
              </label>
              <input
                id={id}
                type={field.type ?? 'text'}
                inputMode={field.name === 'ruc' ? 'numeric' : undefined}
                autoComplete={field.autoComplete}
                readOnly={locked}
                {...register(field.name)}
                aria-invalid={error !== undefined}
                className={`${inputClasses} ${locked ? 'bg-paper' : ''}`}
              />
              {error !== undefined && <p className="mt-1 text-sm text-cmr">{error.message}</p>}
              {error === undefined && field.hint !== undefined && !editing && (
                <p className="mt-1 text-sm text-muted">{field.hint}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting}
          className={`${buttonClasses} bg-button text-surface hover:bg-button-hover`}
        >
          {submitting ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear proveedor'}
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
