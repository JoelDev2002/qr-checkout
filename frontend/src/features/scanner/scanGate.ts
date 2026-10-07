/** Pausa mínima entre dos lecturas aceptadas (T1.13). */
export const SCAN_PAUSE_MS = 1000;

export type ScanGate = {
  /** Devuelve true si la lectura se acepta; bloquea las siguientes durante la pausa. */
  tryAccept: () => boolean;
  /** Limpia la pausa en curso; se usa al desmontar. */
  dispose: () => void;
};

export function createScanGate(pauseMs: number = SCAN_PAUSE_MS): ScanGate {
  let locked = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    tryAccept() {
      if (locked) {
        return false;
      }
      locked = true;
      timer = setTimeout(() => {
        locked = false;
        timer = null;
      }, pauseMs);
      return true;
    },
    dispose() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      locked = false;
    },
  };
}
