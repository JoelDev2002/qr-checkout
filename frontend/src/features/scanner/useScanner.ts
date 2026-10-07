import type { IScannerControls } from '@zxing/browser';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { setTorch, startCamera, stopCamera, supportsTorch } from './camera';
import { isInAppBrowser } from './inAppBrowser';
import { CAMERA_BLOCKED_MESSAGE, IN_APP_BROWSER_MESSAGE } from './messages';
import { normalizeScanText } from './normalize';
import { createScanGate, SCAN_PAUSE_MS } from './scanGate';

export type ScannerStatus = 'requesting' | 'scanning' | 'read' | 'error';

export type UseScannerResult = {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: ScannerStatus;
  errorMessage: string | null;
  canTorch: boolean;
  torchOn: boolean;
  toggleTorch: () => Promise<void>;
  manualOpen: boolean;
  openManual: () => void;
  closeManual: () => void;
  /** Entrega el texto escrito a mano; devuelve false si venía vacío. */
  submitManual: (raw: string) => boolean;
};

/**
 * Lógica del visor (DESIGN §3): pide la cámara trasera, entrega cada lectura
 * normalizada con una pausa de 1 s entre ellas, la libera al desmontar y al
 * pasar a segundo plano, y no hace peticiones a la API.
 */
export function useScanner(onScan: (text: string) => void): UseScannerResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const gateRef = useRef(createScanGate());
  const onScanRef = useRef(onScan);
  const statusRef = useRef<ScannerStatus>('requesting');
  const cameraFailedRef = useRef(false);
  const manualOpenRef = useRef(false);
  const startIdRef = useRef(0);
  const mountedRef = useRef(false);
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<ScannerStatus>('requesting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canTorch, setCanTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const updateStatus = useCallback((next: ScannerStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const clearReadTimer = useCallback(() => {
    if (readTimerRef.current !== null) {
      clearTimeout(readTimerRef.current);
      readTimerRef.current = null;
    }
  }, []);

  const showRead = useCallback(() => {
    clearReadTimer();
    updateStatus('read');
    readTimerRef.current = setTimeout(() => {
      readTimerRef.current = null;
      if (statusRef.current === 'read') {
        updateStatus(cameraFailedRef.current ? 'error' : 'scanning');
      }
    }, SCAN_PAUSE_MS);
  }, [clearReadTimer, updateStatus]);

  const handleScanText = useCallback(
    (raw: string) => {
      if (manualOpenRef.current) {
        return;
      }
      const text = normalizeScanText(raw);
      if (text === '') {
        return;
      }
      if (!gateRef.current.tryAccept()) {
        return;
      }
      onScanRef.current(text);
      showRead();
    },
    [showRead],
  );

  const stopViewer = useCallback(() => {
    startIdRef.current += 1;
    const controls = controlsRef.current;
    controlsRef.current = null;
    stopCamera(controls);
    setCanTorch(false);
    setTorchOn(false);
  }, []);

  const startViewer = useCallback(async () => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }

    if (statusRef.current !== 'read') {
      updateStatus('requesting');
    }
    const startId = (startIdRef.current += 1);

    try {
      const controls = await startCamera(video, handleScanText);
      if (!mountedRef.current || startId !== startIdRef.current) {
        stopCamera(controls);
        return;
      }
      controlsRef.current = controls;
      cameraFailedRef.current = false;
      setCanTorch(supportsTorch(controls));
      if (statusRef.current === 'requesting') {
        updateStatus('scanning');
      }
    } catch {
      if (!mountedRef.current || startId !== startIdRef.current) {
        return;
      }
      cameraFailedRef.current = true;
      setErrorMessage(CAMERA_BLOCKED_MESSAGE);
      updateStatus('error');
    }
  }, [handleScanText, updateStatus]);

  useEffect(() => {
    mountedRef.current = true;

    if (isInAppBrowser(navigator.userAgent)) {
      cameraFailedRef.current = true;
      setErrorMessage(IN_APP_BROWSER_MESSAGE);
      updateStatus('error');
      return () => {
        mountedRef.current = false;
      };
    }

    void startViewer();

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopViewer();
      } else if (!cameraFailedRef.current) {
        void startViewer();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopViewer();
      clearReadTimer();
      gateRef.current.dispose();
    };
  }, [clearReadTimer, startViewer, stopViewer, updateStatus]);

  const toggleTorch = useCallback(async () => {
    const controls = controlsRef.current;
    if (controls === null) {
      return;
    }
    const next = !torchOn;
    try {
      await setTorch(controls, next);
      setTorchOn(next);
    } catch {
      setCanTorch(false);
      setTorchOn(false);
    }
  }, [torchOn]);

  const openManual = useCallback(() => {
    manualOpenRef.current = true;
    setManualOpen(true);
  }, []);

  const closeManual = useCallback(() => {
    manualOpenRef.current = false;
    setManualOpen(false);
  }, []);

  const submitManual = useCallback(
    (raw: string): boolean => {
      const text = normalizeScanText(raw);
      if (text === '') {
        return false;
      }
      // La escritura manual es una acción explícita: se entrega aunque la cámara
      // esté en pausa, pero vuelve a bloquearla un segundo para no duplicar lecturas.
      gateRef.current.tryAccept();
      onScanRef.current(text);
      manualOpenRef.current = false;
      setManualOpen(false);
      showRead();
      return true;
    },
    [showRead],
  );

  return {
    videoRef,
    status,
    errorMessage,
    canTorch,
    torchOn,
    toggleTorch,
    manualOpen,
    openManual,
    closeManual,
    submitManual,
  };
}
