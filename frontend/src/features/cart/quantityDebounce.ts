/**
 * Espera desde el último toque antes de enviar la cantidad al servidor (RN-19). Agrupa los toques
 * rápidos en una sola petición y se puede forzar el envío (`flush`) al salir del campo.
 */
export const QUANTITY_DEBOUNCE_MS = 400;

export type QuantityDebouncer<T> = {
  /** Programa un envío; reemplaza al anterior y reinicia la espera. */
  schedule: (payload: T) => void;
  /** Envía ahora lo pendiente, si hay algo. */
  flush: () => void;
  /** Descarta lo pendiente sin enviar. */
  cancel: () => void;
};

export function createQuantityDebouncer<T>(
  onCommit: (payload: T) => void,
  delayMs: number = QUANTITY_DEBOUNCE_MS,
): QuantityDebouncer<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | undefined;
  let hasPending = false;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function commit(): void {
    clearTimer();

    if (!hasPending) {
      return;
    }

    const payload = pending as T;
    hasPending = false;
    pending = undefined;
    onCommit(payload);
  }

  return {
    schedule(payload) {
      pending = payload;
      hasPending = true;
      clearTimer();
      timer = setTimeout(commit, delayMs);
    },
    flush() {
      commit();
    },
    cancel() {
      clearTimer();
      hasPending = false;
      pending = undefined;
    },
  };
}
