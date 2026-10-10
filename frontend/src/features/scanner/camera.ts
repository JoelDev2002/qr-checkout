import { BarcodeFormat, BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';

/** Formatos que acepta el visor (T1.13): EAN-13, EAN-8, UPC (A y E), Code 128 y QR. */
export const SCAN_FORMATS: readonly BarcodeFormat[] = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.QR_CODE,
];

/** En la caja solo se lee el QR del carrito; el resto de formatos estorbaría. */
export const QR_SCAN_FORMATS: readonly BarcodeFormat[] = [BarcodeFormat.QR_CODE];

/** Abre la cámara trasera y llama a onText con cada código leído. */
export async function startCamera(
  video: HTMLVideoElement,
  onText: (text: string) => void,
  formats: readonly BarcodeFormat[] = SCAN_FORMATS,
): Promise<IScannerControls> {
  const reader = new BrowserMultiFormatReader(undefined, {
    delayBetweenScanAttempts: 250,
    delayBetweenScanSuccess: 250,
  });
  reader.possibleFormats = [...formats];

  return reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, video, (result) => {
    if (result !== undefined) {
      onText(result.getText());
    }
  });
}

/** Solo existe linterna si el dispositivo y el navegador la soportan. */
export function supportsTorch(controls: IScannerControls | null): boolean {
  return typeof controls?.switchTorch === 'function';
}

export async function setTorch(controls: IScannerControls | null, on: boolean): Promise<void> {
  await controls?.switchTorch?.(on);
}

/** Detiene el escaneo y libera la cámara. */
export function stopCamera(controls: IScannerControls | null): void {
  if (controls === null) {
    return;
  }

  try {
    controls.stop();
  } catch {
    // El navegador ya había cerrado el stream (por ejemplo, al pasar a segundo plano).
  }
}
