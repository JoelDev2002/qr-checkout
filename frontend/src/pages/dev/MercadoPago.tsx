import { useEffect, useRef, useState } from 'react';

// El script de MercadoPago.js y el controlador del Brick no traen tipos.
// Se declaran aquí para esta página de desarrollo; cualquier otro uso vive en
// los tipos mínimos de abajo.
type BrickController = { unmount: () => void };
type MercadoPagoSdk = { bricks: () => { create: (brick: string, containerId: string, settings: unknown) => Promise<BrickController> } };

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string) => MercadoPagoSdk;
    cardPaymentBrickController?: BrickController;
  }
}

type CardFormData = Record<string, unknown>;

const AMOUNT_SOLES = 10; // S/ 10.00, monto fijo de la prueba de humo.

export default function MercadoPagoDev() {
  const [formData, setFormData] = useState<CardFormData | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY;

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // El script se carga solo en esta página y se quita al salir.
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;

    script.onload = () => {
      if (!publicKey) {
        setError('Falta VITE_MP_PUBLIC_KEY en el .env del frontend.');
        return;
      }
      const MercadoPagoCtor = window.MercadoPago;
      if (!MercadoPagoCtor) {
        setError('No se pudo cargar MercadoPago.js.');
        return;
      }

      const bricksBuilder = new MercadoPagoCtor(publicKey).bricks();
      const settings = {
        initialization: { amount: AMOUNT_SOLES },
        callbacks: {
          onReady: () => {},
          onSubmit: (data: CardFormData) => {
            setFormData(data);
            return Promise.resolve();
          },
          onError: (brickError: unknown) => {
            setError('El Brick reportó un error. Revisa la consola.');
            console.error(brickError);
          },
        },
      };

      bricksBuilder
        .create('cardPayment', 'cardPaymentBrick_container', settings)
        .then((controller) => {
          window.cardPaymentBrickController = controller;
        })
        .catch((createError: unknown) => {
          setError('No se pudo crear el Card Payment Brick.');
          console.error(createError);
        });
    };

    script.onerror = () => setError('No se pudo descargar MercadoPago.js.');

    document.body.appendChild(script);

    return () => {
      try {
        window.cardPaymentBrickController?.unmount();
      } catch {
        // Ignorado: el Brick ya pudo haberse desmontado.
      }
      delete window.cardPaymentBrickController;
      script.remove();
    };
  }, [publicKey]);

  async function copyResult() {
    if (!formData) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(formData, null, 2));
      setCopied(true);
    } catch {
      setError('No se pudo copiar al portapapeles.');
    }
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 text-xl font-semibold">Prueba de humo: Card Payment Brick</h1>
      <p className="mb-4 text-sm text-neutral-600">
        Monto fijo S/ {AMOUNT_SOLES.toFixed(2)}. Al enviar se muestra el JSON completo del token. No se llama a nuestra API.
      </p>

      {error && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div id="cardPaymentBrick_container" ref={containerRef} />

      {formData && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-semibold">Respuesta del Brick</h2>
          <pre className="max-h-80 overflow-auto rounded bg-neutral-100 p-3 text-xs">{JSON.stringify(formData, null, 2)}</pre>
          <button
            type="button"
            onClick={copyResult}
            className="mt-2 min-h-[44px] rounded border border-neutral-300 px-4 py-2 text-sm"
          >
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </section>
      )}
    </main>
  );
}
