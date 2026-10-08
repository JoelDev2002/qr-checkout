import { z } from 'zod';
import { parseOptionsText } from './converters';

export const CATEGORY_NAME_MAX_LENGTH = 80;
export const FIELD_KEY_MAX_LENGTH = 40;
export const FIELD_LABEL_MAX_LENGTH = 80;
export const FIELD_OPTION_MAX_LENGTH = 60;
export const FIELD_OPTIONS_MAX = 30;
export const FIELD_UNIT_MAX_LENGTH = 20;
export const MIN_SELECT_OPTIONS = 2;

const KEY_PATTERN = /^[a-z0-9_]+$/;

const categoryName = z
  .string({ required_error: 'El nombre de la categoría es obligatorio.' })
  .trim()
  .min(1, 'El nombre de la categoría no puede estar vacío.')
  .max(CATEGORY_NAME_MAX_LENGTH, `El nombre no puede tener más de ${CATEGORY_NAME_MAX_LENGTH} caracteres.`);

const fieldKey = z
  .string({ required_error: 'La clave del campo es obligatoria.' })
  .trim()
  .min(1, 'La clave del campo no puede estar vacía.')
  .max(FIELD_KEY_MAX_LENGTH, `La clave no puede tener más de ${FIELD_KEY_MAX_LENGTH} caracteres.`)
  .regex(KEY_PATTERN, 'La clave solo puede tener letras minúsculas, números y guion bajo.');

const fieldLabel = z
  .string({ required_error: 'La etiqueta del campo es obligatoria.' })
  .trim()
  .min(1, 'El nombre visible del campo no puede estar vacío.')
  .max(FIELD_LABEL_MAX_LENGTH, `El nombre visible no puede tener más de ${FIELD_LABEL_MAX_LENGTH} caracteres.`);

const fieldType = z.enum(['TEXT', 'NUMBER', 'SELECT', 'BOOLEAN'], {
  errorMap: () => ({ message: 'El tipo del campo debe ser texto, número, lista o sí/no.' }),
});

export const fieldFormSchema = z.object({
  /** id del campo en el servidor; si no existe, la fila es un campo nuevo. */
  id: z.number({ invalid_type_error: 'El identificador del campo debe ser un número.' }).int().optional(),
  key: fieldKey,
  label: fieldLabel,
  type: fieldType,
  required: z.boolean({ invalid_type_error: 'Indica si el campo es obligatorio.' }),
  /** Una opción por línea. El servidor guarda una lista, no este texto. */
  optionsText: z.string({ required_error: 'Escribe las opciones del campo.' }),
  unit: z.string({ required_error: 'Escribe la unidad del campo.' }),
  active: z.boolean({ invalid_type_error: 'Indica si el campo queda activo.' }),
});

export const categoryFormSchema = z
  .object({
    name: categoryName,
    active: z.boolean({ invalid_type_error: 'Indica si la categoría queda activa.' }),
    fields: z.array(fieldFormSchema),
  })
  .superRefine((form, ctx) => {
    const usedKeys = new Set<string>();

    form.fields.forEach((field, index) => {
      const path = (leaf: 'key' | 'optionsText' | 'unit'): (string | number)[] => [
        'fields',
        index,
        leaf,
      ];
      const options = parseOptionsText(field.optionsText);

      if (field.type === 'SELECT') {
        if (options.length < MIN_SELECT_OPTIONS) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Una lista necesita al menos ${MIN_SELECT_OPTIONS} opciones distintas y no vacías.`,
            path: path('optionsText'),
          });
        } else if (options.length > FIELD_OPTIONS_MAX) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Un campo puede tener hasta ${FIELD_OPTIONS_MAX} opciones.`,
            path: path('optionsText'),
          });
        } else if (options.some((option) => option.length > FIELD_OPTION_MAX_LENGTH)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Cada opción puede tener hasta ${FIELD_OPTION_MAX_LENGTH} caracteres.`,
            path: path('optionsText'),
          });
        }
      } else if (options.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Solo un campo de tipo lista puede tener opciones.',
          path: path('optionsText'),
        });
      }

      const unit = field.unit.trim();

      if (field.type === 'NUMBER') {
        if (unit.length > FIELD_UNIT_MAX_LENGTH) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `La unidad puede tener hasta ${FIELD_UNIT_MAX_LENGTH} caracteres.`,
            path: path('unit'),
          });
        }
      } else if (unit.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La unidad solo se permite en un campo de tipo número.',
          path: path('unit'),
        });
      }

      if (field.key !== '') {
        if (usedKeys.has(field.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `La clave "${field.key}" ya se usa en esta categoría.`,
            path: path('key'),
          });
        }

        usedKeys.add(field.key);
      }
    });
  });

export type FieldFormValues = z.infer<typeof fieldFormSchema>;
export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
