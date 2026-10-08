import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Scanner } from '../../components/Scanner';
import { generateInternalBarcode, isValidEan13 } from '../../lib/barcode';
import { productResolver } from './resolver';
import { DynamicFields } from './DynamicFields';
import { BarcodeCard } from './BarcodeCard';
import { PricePreview } from './PricePreview';
import type { ProductFormMode, ProductFormValues } from './schema';
import type { AdminProduct } from '../../types/product';
import type { Category, CategoryField } from '../../types/category';

const inputClasses =
  'mt-2 min-h-[44px] w-full rounded-button border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

const buttonClasses =
  'min-h-[44px] rounded-button px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

const secondaryButton = `${buttonClasses} border border-line bg-surface text-ink`;

type ProductFormProps = {
  mode: ProductFormMode;
  /** Solo al editar: lo que ya guarda el servidor. */
  product?: AdminProduct;
  /** Solo las categorías activas, con sus campos activos (GET /categories). */
  categories: Category[];
  defaultValues: ProductFormValues;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
  submitError: string | null;
  /** Producto existente cuando el código está repetido (409 DUPLICATE_BARCODE). */
  duplicate: AdminProduct | null;
  /** Aviso del servidor al cambiar de categoría sin confirmar el descarte (409 CONFLICT). */
  conflict: string | null;
  onConfirmDiscard: () => void;
  onCancelDiscard: () => void;
};

function activeFieldsOf(category: Category | undefined): CategoryField[] {
  if (category === undefined) {
    return [];
  }

  return [...category.fields]
    .filter((field) => field.active)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
}

function attributeErrorMessages(errors: {
  attributes?: Record<string, { message?: string } | undefined>;
}): Record<string, string | undefined> {
  const messages: Record<string, string | undefined> = {};
  const attributes = errors.attributes;

  if (attributes === undefined) {
    return messages;
  }

  for (const [key, value] of Object.entries(attributes)) {
    messages[key] = value?.message;
  }

  return messages;
}

export function ProductForm({
  mode,
  product,
  categories,
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
  submitError,
  duplicate,
  conflict,
  onConfirmDiscard,
  onCancelDiscard,
}: ProductFormProps) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const fieldsRef = useRef<CategoryField[]>([]);
  const resolver = useMemo(() => productResolver(() => fieldsRef.current, mode), [mode]);
  const form = useForm<ProductFormValues>({ resolver, defaultValues });
  const { register, handleSubmit, watch, setValue, formState } = form;
  const { errors } = formState;

  const barcode = watch('barcode');
  const categoryId = watch('categoryId');
  const hasCmrDiscount = watch('hasCmrDiscount');
  const selectedCategory = categories.find((candidate) => String(candidate.id) === categoryId.trim());
  const fields = activeFieldsOf(selectedCategory);

  // El esquema valida contra los campos de la categoría elegida en este momento.
  fieldsRef.current = fields;

  function handleScan(text: string) {
    setValue('barcode', text, { shouldValidate: true, shouldDirty: true });
    setScannerOpen(false);
  }

  function handleGenerateInternal() {
    setValue('barcode', generateInternalBarcode(), { shouldValidate: true, shouldDirty: true });
  }

  return (
    <form
      onSubmit={handleSubmit((values) => onSubmit(values))}
      noValidate
      className="mt-6 rounded-sheet border border-line bg-surface px-4 py-6"
    >
      {submitError !== null && (
        <p role="alert" className="mb-4 rounded-tag border border-cmr px-3 py-2 text-sm text-cmr">
          {submitError}
        </p>
      )}

      {duplicate !== null && (
        <div role="alert" className="mb-4 rounded-tag border border-cmr px-3 py-2">
          <p className="text-sm font-semibold text-cmr">Este producto ya existe</p>
          <p className="mt-1 text-sm text-ink">
            {duplicate.name} · {duplicate.brand}
          </p>
          <Link
            to={`/admin/products/${duplicate.id}`}
            className={`${secondaryButton} mt-2 inline-flex`}
          >
            Editar producto
          </Link>
        </div>
      )}

      {conflict !== null && (
        <div role="alert" className="mb-4 rounded-tag border border-warn px-3 py-2">
          <p className="text-sm font-semibold text-warn">{conflict}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onConfirmDiscard}
              disabled={submitting}
              className={`${buttonClasses} bg-ink text-surface`}
            >
              {submitting ? 'Guardando…' : 'Sí, descartar y guardar'}
            </button>
            <button
              type="button"
              onClick={onCancelDiscard}
              disabled={submitting}
              className={secondaryButton}
            >
              Seguir editando
            </button>
          </div>
        </div>
      )}

      <fieldset className="max-w-md">
        <legend className="text-sm font-semibold text-ink">Código de barras</legend>

        {mode === 'create' && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setScannerOpen((open) => !open)}
              aria-expanded={scannerOpen}
              className={`${secondaryButton} flex-1`}
            >
              {scannerOpen ? 'Cerrar escáner' : 'Escanear código'}
            </button>
            <button
              type="button"
              onClick={handleGenerateInternal}
              className={`${secondaryButton} flex-1`}
            >
              Generar código interno
            </button>
          </div>
        )}

        {scannerOpen && (
          <div className="mt-3 rounded-sheet border border-line bg-paper p-4">
            <Scanner onScan={handleScan} />
          </div>
        )}

        <label htmlFor="product-barcode" className="mt-3 block text-sm font-semibold text-ink">
          Código
        </label>
        <input
          id="product-barcode"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          {...register('barcode')}
          readOnly={mode === 'edit'}
          aria-readonly={mode === 'edit'}
          aria-invalid={errors.barcode !== undefined}
          className={inputClasses}
        />
        {mode === 'edit' && (
          <p className="mt-1 text-sm text-muted">
            El código no se puede cambiar. El stock tampoco: cambia con ajustes.
          </p>
        )}
        {errors.barcode !== undefined && (
          <p className="mt-1 text-sm text-cmr">{errors.barcode.message}</p>
        )}

        {isValidEan13(barcode.trim()) && <BarcodeCard barcode={barcode.trim()} />}
      </fieldset>

      <div className="mt-4 grid max-w-2xl gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label htmlFor="product-name" className="block text-sm font-semibold text-ink">
            Nombre
          </label>
          <input
            id="product-name"
            type="text"
            autoComplete="off"
            {...register('name')}
            aria-invalid={errors.name !== undefined}
            className={inputClasses}
          />
          {errors.name !== undefined && (
            <p className="mt-1 text-sm text-cmr">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="product-brand" className="block text-sm font-semibold text-ink">
            Marca
          </label>
          <input
            id="product-brand"
            type="text"
            autoComplete="off"
            {...register('brand')}
            aria-invalid={errors.brand !== undefined}
            className={inputClasses}
          />
          {errors.brand !== undefined && (
            <p className="mt-1 text-sm text-cmr">{errors.brand.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="product-color" className="block text-sm font-semibold text-ink">
            Color
          </label>
          <input
            id="product-color"
            type="text"
            autoComplete="off"
            {...register('color')}
            aria-invalid={errors.color !== undefined}
            className={inputClasses}
          />
          {errors.color !== undefined && (
            <p className="mt-1 text-sm text-cmr">{errors.color.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="product-category" className="block text-sm font-semibold text-ink">
            Categoría
          </label>
          <select
            id="product-category"
            {...register('categoryId')}
            aria-invalid={errors.categoryId !== undefined}
            className={inputClasses}
          >
            <option value="">Elige una categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors.categoryId !== undefined && (
            <p className="mt-1 text-sm text-cmr">{errors.categoryId.message}</p>
          )}
        </div>
      </div>

      {categoryId.trim() !== '' && (
        <fieldset className="mt-4 max-w-2xl">
          <legend className="text-base font-semibold text-ink">
            Detalles de {selectedCategory?.name ?? 'la categoría'}
          </legend>
          <div className="mt-3">
            {fields.length === 0 ? (
              <p className="text-sm text-muted">Esta categoría no tiene campos adicionales.</p>
            ) : (
              <DynamicFields
                fields={fields}
                register={register}
                attributeErrors={attributeErrorMessages(errors)}
              />
            )}
          </div>
          {selectedCategory === undefined && (
            <p className="mt-2 text-sm text-warn">
              No encontramos esa categoría en el catálogo activo. Elige otra.
            </p>
          )}
        </fieldset>
      )}

      <div className="mt-4 max-w-xs">
        <label htmlFor="product-price" className="block text-sm font-semibold text-ink">
          Precio original
        </label>
        <div className="flex items-center gap-2">
          <input
            id="product-price"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            {...register('originalPrice')}
            aria-invalid={errors.originalPrice !== undefined}
            className={inputClasses}
          />
          <span aria-hidden="true" className="mt-2 text-base font-semibold text-muted">
            S/
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">En soles, con hasta 2 decimales.</p>
        {errors.originalPrice !== undefined && (
          <p className="mt-1 text-sm text-cmr">{errors.originalPrice.message}</p>
        )}
      </div>

      <div className="mt-4 max-w-xs">
        <label className="flex min-h-[44px] min-w-[44px] items-center gap-2 text-base text-ink">
          <input
            type="checkbox"
            {...register('hasCmrDiscount')}
            aria-label="Tiene descuento CMR"
            className="h-5 w-5"
          />
          Tiene descuento CMR
        </label>

        {hasCmrDiscount && (
          <div className="mt-2">
            <label htmlFor="product-cmr-percent" className="block text-sm font-semibold text-ink">
              Porcentaje CMR
            </label>
            <div className="flex items-center gap-2">
              <input
                id="product-cmr-percent"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                {...register('cmrPercent')}
                aria-invalid={errors.cmrPercent !== undefined}
                className={inputClasses}
              />
              <span aria-hidden="true" className="mt-2 text-base font-semibold text-muted">
                %
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">Mayor que 0 y hasta 90.</p>
            {errors.cmrPercent !== undefined && (
              <p className="mt-1 text-sm text-cmr">{errors.cmrPercent.message}</p>
            )}
          </div>
        )}
      </div>

      <PricePreview
        originalPrice={watch('originalPrice')}
        categoryId={categoryId}
        hasCmrDiscount={hasCmrDiscount}
        cmrPercent={watch('cmrPercent')}
        productId={product?.id}
      />

      <div className="mt-4 grid max-w-2xl gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="product-stock" className="block text-sm font-semibold text-ink">
            Stock inicial
          </label>
          <input
            id="product-stock"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            {...register('stock')}
            readOnly={mode === 'edit'}
            aria-readonly={mode === 'edit'}
            aria-invalid={errors.stock !== undefined}
            className={inputClasses}
          />
          {mode === 'create' ? (
            <p className="mt-1 text-sm text-muted">Unidades disponibles al crear el producto.</p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              El stock cambia con los ajustes, nunca desde aquí.
            </p>
          )}
          {errors.stock !== undefined && (
            <p className="mt-1 text-sm text-cmr">{errors.stock.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="product-max-per-purchase" className="block text-sm font-semibold text-ink">
            Máximo por compra
          </label>
          <input
            id="product-max-per-purchase"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            {...register('maxPerPurchase')}
            aria-invalid={errors.maxPerPurchase !== undefined}
            className={inputClasses}
          />
          <p className="mt-1 text-sm text-muted">Unidades máximas de este producto por compra.</p>
          {errors.maxPerPurchase !== undefined && (
            <p className="mt-1 text-sm text-cmr">{errors.maxPerPurchase.message}</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="submit" disabled={submitting} className={`${buttonClasses} bg-ink text-surface`}>
          {submitting ? 'Guardando…' : 'Guardar producto'}
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
