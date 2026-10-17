// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardBrickHandlers } from './cardBrick';

type FakeController = { unmount: ReturnType<typeof vi.fn> };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function fakeMercadoPago(
  create: (brick: string, containerId: string, settings: unknown) => Promise<FakeController>,
) {
  return class {
    bricks() {
      return { create };
    }
  };
}

function buildHandlers(overrides: Partial<CardBrickHandlers> = {}): CardBrickHandlers {
  return {
    onReady: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onError: vi.fn(),
    ...overrides,
  };
}

function options(handlers: CardBrickHandlers) {
  return {
    containerId: 'cardPaymentBrick_container',
    publicKey: 'TEST-public-key',
    amount: 10,
    handlers,
  };
}

function getScript(): HTMLScriptElement {
  const script = document.querySelector('script[src="https://sdk.mercadopago.com/js/v2"]');

  if (!(script instanceof HTMLScriptElement)) {
    throw new Error('No se agregó el script del SDK.');
  }

  return script;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadModule() {
  // El módulo recuerda la promesa del SDK; se reinicia para que cada prueba parta de cero.
  return import('./cardBrick');
}

describe('mountCardBrick', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.MercadoPago;
  });

  it('monta un solo Brick aunque los efectos se ejecuten dos veces (StrictMode)', async () => {
    const controller: FakeController = { unmount: vi.fn() };
    const create = vi.fn().mockResolvedValue(controller);
    window.MercadoPago = fakeMercadoPago(create) as unknown as typeof window.MercadoPago;

    const { mountCardBrick } = await loadModule();

    const cleanup = mountCardBrick(options(buildHandlers()));
    cleanup();
    mountCardBrick(options(buildHandlers()));
    await flush();

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('desmonta el Brick en el cleanup', async () => {
    const controller: FakeController = { unmount: vi.fn() };
    const create = vi.fn().mockResolvedValue(controller);
    window.MercadoPago = fakeMercadoPago(create) as unknown as typeof window.MercadoPago;

    const { mountCardBrick } = await loadModule();
    const cleanup = mountCardBrick(options(buildHandlers()));
    await flush();

    expect(create).toHaveBeenCalledTimes(1);

    cleanup();
    expect(controller.unmount).toHaveBeenCalledTimes(1);
  });

  it('desmonta el Brick si create resuelve después del cleanup', async () => {
    const controller: FakeController = { unmount: vi.fn() };
    const pending = deferred<FakeController>();
    const create = vi.fn().mockReturnValue(pending.promise);
    window.MercadoPago = fakeMercadoPago(create) as unknown as typeof window.MercadoPago;

    const { mountCardBrick } = await loadModule();
    const cleanup = mountCardBrick(options(buildHandlers()));
    await flush();
    cleanup();
    pending.resolve(controller);
    await flush();

    expect(controller.unmount).toHaveBeenCalledTimes(1);
  });

  it('avisa cuando el script del SDK no se descarga', async () => {
    const onError = vi.fn();
    const { mountCardBrick } = await loadModule();
    mountCardBrick(options(buildHandlers({ onError })));
    await flush();

    getScript().onerror?.(new Event('error'));
    await flush();

    expect(onError).toHaveBeenCalledWith('download');
  });

  it('avisa cuando el SDK no dejó el constructor en window', async () => {
    const onError = vi.fn();
    const { mountCardBrick } = await loadModule();
    mountCardBrick(options(buildHandlers({ onError })));
    await flush();

    getScript().onload?.(new Event('load'));
    await flush();

    expect(onError).toHaveBeenCalledWith('load');
  });
});
