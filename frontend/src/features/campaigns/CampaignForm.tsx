import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { emptyCampaignForm } from './converters';
import { ProductPicker } from './ProductPicker';
import { campaignResolver } from './resolver';
import type { CampaignFormValues } from './schema';
import { SCOPE_TEXT } from './status';
import type { CampaignScope, DiscountType } from '../../types/campaign';
import type { ProductListItem } from '../../types/product';
import type { Category } from '../../types/category';

const inputClasses =
  'mt-2 min-h-[44px] w-full rounded-button border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

const buttonClasses =
  'min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

const radioClasses = 'h-5 w-5';

const SCOPES: CampaignScope[] = ['PRODUCTS', 'CATEGORIES', 'STORE'];
const DISCOUNT_TYPES: DiscountType[] = ['PERCENT', 'FIXED'];

type CampaignFormProps = {
  initial?: CampaignFormValues;
  knownProducts: Map<number, ProductListItem>;
  categories: Category[];
  /** Solo al editar: lo calcula el servidor. */
  affectedProducts?: number;
  onSubmit: (values: CampaignFormValues) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
  submitError: string | null;
};

export function CampaignForm({
  initial,
  knownProducts,
  categories,
  affectedProducts,
  onSubmit,
  onCancel,
  submitting,
  submitError,
}: CampaignFormProps) {
  const form = useForm<CampaignFormValues>({
    resolver: campaignResolver as Resolver<CampaignFormValues>,
    defaultValues: initial ?? emptyCampaignForm(),
  });
  const { register, handleSubmit, watch, setValue, formState } = form;
  const { errors } = formState;

  const scope = watch('scope');
  const discountType = watch('discountType');
  const productIds = watch('productIds');
  const categoryIds = watch('categoryIds');

  function handleScopeChange(next: CampaignScope): void {
    setValue('scope', next);
  }

  function handleDiscountTypeChange(next: DiscountType): void {
    setValue('discountType', next);
  }

  function handleAddProduct(product: ProductListItem): void {
    if (!productIds.includes(product.id)) {
      setValue('productIds', [...productIds, product.id]);
    }
  }

  function handleRemoveProduct(id: number): void {
    setValue('productIds', productIds.filter((productId) => productId !== id));
  }

  function handleToggleCategory(id: number, checked: boolean): void {
    setValue(
      'categoryIds',
      checked ? [...categoryIds, id] : categoryIds.filter((categoryId) => categoryId !== id),
    );
  }

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
        <label htmlFor="campaign-name" className="block text-sm font-semibold text-ink">
          Nombre
        </label>
        <input
          id="campaign-name"
          {...register('name')}
          aria-invalid={errors.name !== undefined}
          className={inputClasses}
        />
        {errors.name !== undefined && (
          <p className="mt-1 text-sm text-cmr">{errors.name.message}</p>
        )}
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-ink">Alcance</legend>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          {SCOPES.map((value) => (
            <label
              key={value}
              className="flex min-h-[44px] min-w-[44px] items-center gap-2 text-base text-ink"
            >
              <input
                type="radio"
                value={value}
                checked={scope === value}
                onChange={() => handleScopeChange(value)}
                disabled={submitting}
                className={radioClasses}
              />
              {SCOPE_TEXT[value]}
            </label>
          ))}
        </div>
        {errors.scope !== undefined && (
          <p className="mt-1 text-sm text-cmr">{errors.scope.message}</p>
        )}

        {scope === 'PRODUCTS' && (
          <div className="mt-3">
            <ProductPicker
              selectedIds={productIds}
              knownProducts={knownProducts}
              onAdd={handleAddProduct}
              onRemove={handleRemoveProduct}
              disabled={submitting}
            />
            {errors.productIds !== undefined && (
              <p className="mt-1 text-sm text-cmr">{errors.productIds.message}</p>
            )}
          </div>
        )}

        {scope === 'CATEGORIES' && (
          <div className="mt-3">
            {categories.length === 0 ? (
              <p className="text-sm text-muted">Todavía no hay categorías activas.</p>
            ) : (
              <ul className="flex flex-wrap gap-x-6 gap-y-1">
                {categories.map((category) => (
                  <li key={category.id}>
                    <label className="flex min-h-[44px] min-w-[44px] items-center gap-2 text-base text-ink">
                      <input
                        type="checkbox"
                        checked={categoryIds.includes(category.id)}
                        onChange={(event) => handleToggleCategory(category.id, event.target.checked)}
                        disabled={submitting}
                        aria-label={`Categoría ${category.name}`}
                        className="h-5 w-5"
                      />
                      {category.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {errors.categoryIds !== undefined && (
              <p className="mt-1 text-sm text-cmr">{errors.categoryIds.message}</p>
            )}
          </div>
        )}

        {scope === 'STORE' && (
          <p className="mt-3 text-base text-muted">
            La campaña aplica a todos los productos de la tienda.
          </p>
        )}

        {affectedProducts !== undefined && (
          <p className="mt-3 text-base text-ink">
            Afecta a {affectedProducts} {affectedProducts === 1 ? 'producto' : 'productos'} hoy.
          </p>
        )}
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-ink">Tipo de descuento</legend>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          {DISCOUNT_TYPES.map((value) => (
            <label
              key={value}
              className="flex min-h-[44px] min-w-[44px] items-center gap-2 text-base text-ink"
            >
              <input
                type="radio"
                value={value}
                checked={discountType === value}
                onChange={() => handleDiscountTypeChange(value)}
                disabled={submitting}
                className={radioClasses}
              />
              {value === 'PERCENT' ? 'Porcentaje' : 'Monto fijo en S/'}
            </label>
          ))}
        </div>

        <div className="mt-2 max-w-xs">
          <label htmlFor="campaign-discount-value" className="block text-sm font-semibold text-ink">
            {discountType === 'PERCENT' ? 'Porcentaje' : 'Monto fijo'}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="campaign-discount-value"
              {...register('discountValue')}
              inputMode="decimal"
              aria-invalid={errors.discountValue !== undefined}
              className={inputClasses}
            />
            <span aria-hidden="true" className="mt-2 text-base font-semibold text-muted">
              {discountType === 'PERCENT' ? '%' : 'S/'}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {discountType === 'PERCENT'
              ? 'Mayor que 0 y hasta 90; admite 2 decimales.'
              : 'En soles por unidad, con 2 decimales como máximo.'}
          </p>
          {errors.discountValue !== undefined && (
            <p className="mt-1 text-sm text-cmr">{errors.discountValue.message}</p>
          )}
        </div>
      </fieldset>

      <div className="mt-4 max-w-xs">
        <label htmlFor="campaign-priority" className="block text-sm font-semibold text-ink">
          Prioridad
        </label>
        <input
          id="campaign-priority"
          type="number"
          step={1}
          {...register('priority')}
          aria-invalid={errors.priority !== undefined}
          className={inputClasses}
        />
        <p className="mt-1 text-sm text-muted">Mayor número gana: si varias campañas llegan al mismo producto, se aplica la de mayor prioridad.</p>
        {errors.priority !== undefined && (
          <p className="mt-1 text-sm text-cmr">{errors.priority.message}</p>
        )}
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-ink">Fechas</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          <div>
            <label htmlFor="campaign-starts-at" className="block text-sm font-semibold text-ink">
              Inicio
            </label>
            <input
              id="campaign-starts-at"
              type="date"
              {...register('startsAt')}
              aria-invalid={errors.startsAt !== undefined}
              className={inputClasses}
            />
            {errors.startsAt !== undefined && (
              <p className="mt-1 text-sm text-cmr">{errors.startsAt.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="campaign-ends-at" className="block text-sm font-semibold text-ink">
              Fin
            </label>
            <input
              id="campaign-ends-at"
              type="date"
              {...register('endsAt')}
              aria-invalid={errors.endsAt !== undefined}
              className={inputClasses}
            />
            {errors.endsAt !== undefined && (
              <p className="mt-1 text-sm text-cmr">{errors.endsAt.message}</p>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-muted">
          Hora de Lima; la fecha final incluye todo ese día.
        </p>
      </fieldset>

      <div className="mt-4">
        <label className="flex min-h-[44px] min-w-[44px] items-center gap-2 text-base text-ink">
          <input
            type="checkbox"
            {...register('active')}
            aria-label="Campaña activa"
            className="h-5 w-5"
          />
          Activa
        </label>
        {errors.active !== undefined && (
          <p className="text-sm text-cmr">{errors.active.message}</p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting}
          className={`${buttonClasses} bg-button text-surface hover:bg-button-hover`}
        >
          {submitting ? 'Guardando…' : 'Guardar campaña'}
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
