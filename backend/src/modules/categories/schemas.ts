import { z } from 'zod';

export const CATEGORY_NAME_MAX_LENGTH = 80;
export const FIELD_KEY_MAX_LENGTH = 40;
export const FIELD_LABEL_MAX_LENGTH = 80;
export const FIELD_OPTION_MAX_LENGTH = 60;
export const FIELD_OPTIONS_MAX = 30;
export const FIELD_UNIT_MAX_LENGTH = 20;

const categoryName = z
  .string({ required_error: 'El nombre de la categoría es obligatorio.' })
  .trim()
  .min(1, 'El nombre de la categoría no puede estar vacío.')
  .max(CATEGORY_NAME_MAX_LENGTH, `El nombre no puede tener más de ${CATEGORY_NAME_MAX_LENGTH} caracteres.`);

export const createCategorySchema = z.object({
  name: categoryName,
});

export const updateCategorySchema = z.object({
  name: categoryName,
});

export const setCategoryActiveSchema = z.object({
  active: z.boolean({ invalid_type_error: 'Indica si la categoría queda activa.' }),
});

export const listCategoriesQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => value === 'true' || value === '1'),
});

const fieldType = z.enum(['TEXT', 'NUMBER', 'SELECT', 'BOOLEAN'], {
  errorMap: () => ({ message: 'El tipo del campo debe ser TEXT, NUMBER, SELECT o BOOLEAN.' }),
});

const fieldKey = z
  .string({ required_error: 'La clave del campo es obligatoria.' })
  .trim()
  .min(1, 'La clave del campo no puede estar vacía.')
  .max(FIELD_KEY_MAX_LENGTH, `La clave no puede tener más de ${FIELD_KEY_MAX_LENGTH} caracteres.`);

const fieldLabel = z
  .string({ required_error: 'La etiqueta del campo es obligatoria.' })
  .trim()
  .min(1, 'La etiqueta del campo no puede estar vacía.')
  .max(FIELD_LABEL_MAX_LENGTH, `La etiqueta no puede tener más de ${FIELD_LABEL_MAX_LENGTH} caracteres.`);

const fieldOptions = z
  .array(
    z
      .string({ required_error: 'Cada opción debe ser un texto.' })
      .trim()
      .min(1, 'Cada opción debe tener texto.')
      .max(FIELD_OPTION_MAX_LENGTH, `Cada opción puede tener hasta ${FIELD_OPTION_MAX_LENGTH} caracteres.`),
  )
  .max(FIELD_OPTIONS_MAX, `Un campo puede tener hasta ${FIELD_OPTIONS_MAX} opciones.`)
  .optional();

const fieldUnit = z
  .string()
  .trim()
  .max(FIELD_UNIT_MAX_LENGTH, `La unidad puede tener hasta ${FIELD_UNIT_MAX_LENGTH} caracteres.`)
  .optional();

const fieldSortOrder = z
  .number({ invalid_type_error: 'El orden debe ser un número entero.' })
  .int('El orden debe ser un número entero.')
  .optional();

export const createFieldSchema = z.object({
  key: fieldKey,
  label: fieldLabel,
  type: fieldType,
  required: z.boolean().optional(),
  options: fieldOptions,
  unit: fieldUnit,
  sortOrder: fieldSortOrder,
});

export const updateFieldSchema = z
  .object({
    key: fieldKey.optional(),
    label: fieldLabel.optional(),
    type: fieldType.optional(),
    required: z.boolean().optional(),
    options: fieldOptions,
    unit: fieldUnit,
    sortOrder: fieldSortOrder,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Envía al menos un dato para editar el campo.',
  });

export const setFieldActiveSchema = z.object({
  active: z.boolean({ invalid_type_error: 'Indica si el campo queda activo.' }),
});

export const categoryIdParamSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: 'El identificador debe ser un número.' })
    .int('El identificador debe ser un número entero.')
    .positive('El identificador debe ser mayor que cero.'),
});

export const categoryFieldParamSchema = categoryIdParamSchema.extend({
  fieldId: z.coerce
    .number({ invalid_type_error: 'El identificador del campo debe ser un número.' })
    .int('El identificador del campo debe ser un número entero.')
    .positive('El identificador del campo debe ser mayor que cero.'),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type SetCategoryActiveInput = z.infer<typeof setCategoryActiveSchema>;
export type CreateFieldInput = z.infer<typeof createFieldSchema>;
export type UpdateFieldInput = z.infer<typeof updateFieldSchema>;
export type SetFieldActiveInput = z.infer<typeof setFieldActiveSchema>;