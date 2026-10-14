import { sileo } from 'sileo';

/** Un aviso dura lo suficiente para leerlo sin estorbar la siguiente acción. */
const DURATION_MS = 4000;

/** Aviso de éxito, por ejemplo tras guardar o desactivar. */
export function toastSuccess(title: string, description?: string): void {
  sileo.success({ title, description, duration: DURATION_MS });
}

/** Aviso de error, con el mensaje que devolvió la API o uno genérico. */
export function toastError(title: string, description?: string): void {
  sileo.error({ title, description, duration: DURATION_MS });
}

/** Aviso neutral para informar sin sugerir que algo falló. */
export function toastInfo(title: string, description?: string): void {
  sileo.info({ title, description, duration: DURATION_MS });
}
