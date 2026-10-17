// El SDK de MercadoPago.js y el controlador del Brick no traen tipos.
type BrickController = { unmount: () => void };
type MercadoPagoSdk = {
  bricks: () => {
    create: (brick: string, containerId: string, settings: unknown) => Promise<BrickController>;
  };
};

type MercadoPagoCtor = new (publicKey: string) => MercadoPagoSdk;

declare global {
  interface Window {
    MercadoPago?: MercadoPagoCtor;
  }
}

/** Lo que entrega el Brick al enviar (`CardData`) más los datos adicionales de la tarjeta. */
export type CardFormData = {
  token: string;
  payment_method_id: string;
};

export type AdditionalData = {
  lastFourDigits?: string;
};

/** De dónde vino el error del Brick, para que la pantalla elija el mensaje (T3.5e). */
export type CardBrickError = 'download' | 'load' | 'create' | 'brick';

export type CardBrickHandlers = {
  onReady: () => void;
  onSubmit: (data: CardFormData, additionalData: AdditionalData) => Promise<void>;
  onError: (source: CardBrickError) => void;
};

export type MountCardBrickOptions = {
  containerId: string;
  publicKey: string;
  amount: number;
  handlers: CardBrickHandlers;
};

const SDK_URL = 'https://sdk.mercadopago.com/js/v2';

type BricksBuilder = ReturnType<MercadoPagoSdk['bricks']>;

type SdkLoad = { ok: true; sdk: MercadoPagoCtor } | { ok: false; source: 'download' | 'load' };

// El SDK se carga una sola vez para toda la app. StrictMode ejecuta los efectos dos veces: si cada
// montaje insertara su propio script, se dispararían dos `create` sobre el mismo contenedor y el
// segundo fallaría (T3.5e).
let sdkLoad: Promise<SdkLoad> | null = null;

function loadSdk(): Promise<SdkLoad> {
  if (sdkLoad !== null) {
    return sdkLoad;
  }

  sdkLoad = new Promise<SdkLoad>((resolve) => {
    if (window.MercadoPago) {
      resolve({ ok: true, sdk: window.MercadoPago });
      return;
    }

    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;

    script.onload = () => {
      if (window.MercadoPago) {
        resolve({ ok: true, sdk: window.MercadoPago });
        return;
      }

      sdkLoad = null;
      resolve({ ok: false, source: 'load' });
    };

    script.onerror = () => {
      sdkLoad = null;
      resolve({ ok: false, source: 'download' });
    };

    document.body.appendChild(script);
  });

  return sdkLoad;
}

/**
 * Monta el Card Payment Brick una sola vez por pantalla. Devuelve un cleanup idempotente que
 * desmonta la instancia, incluso si `create` resuelve después de que la pantalla se desmontó
 * (StrictMode en desarrollo): así nunca queda un segundo formulario ni falla el `create` (T3.5e).
 */
export function mountCardBrick({ containerId, publicKey, amount, handlers }: MountCardBrickOptions): () => void {
  let controller: BrickController | null = null;
  let cancelled = false;

  void loadSdk().then((load) => {
    if (cancelled) {
      return;
    }

    if (!load.ok) {
      handlers.onError(load.source);
      return;
    }

    const settings = {
      initialization: { amount },
      callbacks: {
        onReady: handlers.onReady,
        onSubmit: handlers.onSubmit,
        onError: () => handlers.onError('brick'),
      },
    };

    let bricksBuilder: BricksBuilder;

    try {
      bricksBuilder = new load.sdk(publicKey).bricks();
    } catch {
      handlers.onError('create');
      return;
    }

    return bricksBuilder
      .create('cardPayment', containerId, settings)
      .then((created) => {
        if (cancelled) {
          created.unmount();
          return;
        }

        controller = created;
      })
      .catch(() => {
        if (!cancelled) {
          handlers.onError('create');
        }
      });
  });

  return () => {
    cancelled = true;
    controller?.unmount();
    controller = null;
  };
}
