import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useCart } from '../../features/cart/CartContext';
import {
  buildPaymentBody,
  isComprobanteValid,
  validateComprobante,
  type ComprobanteForm,
} from '../../features/payments/comprobante';
import { mapApiError, type MappedPaymentResult } from '../../features/payments/errorMapper';
import { formatMoney } from '../../lib/money';
import { ApiError } from '../../services/api';
import { postOnlinePayment, type DocType, type OnlineSaleView } from '../../services/payments';

// El SDK de MercadoPago.js y el controlador del Brick no traen tipos.
type BrickController = { unmount: () => void };
type MercadoPagoSdk = {
  bricks: () => {
    create: (brick: string, containerId: string, settings: unknown) => Promise<BrickController>;
  };
};

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string) => MercadoPagoSdk;
    cardPaymentBrickController?: BrickController;
  }
}

/** Lo que entrega el Brick al enviar (`CardData`) más los datos adicionales de la tarjeta. */
type CardFormData = {
  token: string;
  payment_method_id: string;
};

type AdditionalData = {
  lastFourDigits?: string;
};

const primaryButton =
  'flex min-h-[44px] w-full items-center justify-center rounded-button bg-ink px-4 text-base font-semibold text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';
const secondaryButton =
  'flex min-h-[44px] w-full items-center justify-center rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

/**
 * Pantalla de pago en línea (T3.5e; DESIGN §4 cliente puntos 6 y 7): comprobante, aviso fijo y el
 * Card Payment Brick de Mercado Pago. Los datos de tarjeta van directo a la pasarela (RN-20).
 */
export function PayOnlinePage() {
  const navigate = useNavigate();
  const { cart, loading, error, reload } = useCart();
  const containerId = 'cardPaymentBrick_container';
  const submittingRef = useRef(false);

  const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY;

  const [docType, setDocType] = useState<DocType>('TICKET');
  const [buyerDocNumber, setBuyerDocNumber] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [brickError, setBrickError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<MappedPaymentResult | null>(null);
  const [sale, setSale] = useState<OnlineSaleView | null>(null);

  // El Brick se monta una sola vez; al enviar leemos el comprobante actual desde una referencia
  // para no desmontarlo en cada tecla.
  const formRef = useRef<ComprobanteForm>({ docType, buyerDocNumber, buyerName });
  formRef.current = { docType, buyerDocNumber, buyerName };

  const form: ComprobanteForm = { docType, buyerDocNumber, buyerName };
  const comprobanteError = validateComprobante(form);
  const comprobanteValid = isComprobanteValid(form);

  const offerTotalCents = cart?.summary.normalTotalCents ?? 0;
  const payable = cart !== null && cart.status === 'OPEN' && cart.items.length > 0;

  useEffect(() => {
    if (cart !== null && !payable) {
      navigate('/cart', { replace: true });
    }
  }, [cart, payable, navigate]);

  useEffect(() => {
    if (!comprobanteValid || !payable || result !== null) {
      return;
    }

    if (!publicKey) {
      setBrickError('Falta VITE_MP_PUBLIC_KEY en el .env del frontend.');
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;

    script.onload = () => {
      const MercadoPagoCtor = window.MercadoPago;

      if (!MercadoPagoCtor) {
        setBrickError('No se pudo cargar MercadoPago.js.');
        return;
      }

      const bricksBuilder = new MercadoPagoCtor(publicKey).bricks();
      const settings = {
        initialization: { amount: offerTotalCents / 100 },
        callbacks: {
          onReady: () => setBrickError(null),
          onSubmit: (data: CardFormData, additionalData: AdditionalData) => {
            if (submittingRef.current) {
              return Promise.reject();
            }

            submittingRef.current = true;
            setSubmitting(true);

            const lastFour = additionalData?.lastFourDigits;
            const current = formRef.current;

            return postOnlinePayment(
              buildPaymentBody({
                token: data.token,
                paymentMethodId: data.payment_method_id,
                docType: current.docType,
                buyerDocNumber: current.buyerDocNumber.trim() || undefined,
                buyerName: current.buyerName.trim() || undefined,
                expectedAmountCents: offerTotalCents,
                cardLast4: lastFour ? String(lastFour) : undefined,
              }),
            )
              .then((created) => {
                setSale(created);
                setResult({ kind: 'approved' });
                void reload();
              })
              .catch((caught: unknown) => {
                if (caught instanceof ApiError) {
                  setResult(mapApiError(caught.code, caught.message, caught.details));
                } else {
                  setResult({ kind: 'error', message: 'Ocurrió un error inesperado.' });
                }
              })
              .finally(() => {
                submittingRef.current = false;
                setSubmitting(false);
              });
          },
          onError: () => {
            setBrickError('El formulario de tarjeta reportó un error. Inténtalo de nuevo.');
          },
        },
      };

      bricksBuilder
        .create('cardPayment', containerId, settings)
        .then((controller) => {
          window.cardPaymentBrickController = controller;
        })
        .catch(() => {
          setBrickError('No se pudo crear el formulario de tarjeta.');
        });
    };

    script.onerror = () => setBrickError('No se pudo descargar MercadoPago.js.');

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
  }, [comprobanteValid, payable, result, offerTotalCents, publicKey, reload]);

  if (cart === null) {
    if (loading) {
      return (
        <p role="status" className="text-base text-muted">
          Cargando…
        </p>
      );
    }

    return (
      <section className="rounded-sheet border border-line bg-surface p-4">
        <p role="alert" className="text-base text-cmr">
          {error ?? 'Ocurrió un error inesperado. Inténtalo de nuevo.'}
        </p>
        <button type="button" onClick={() => void reload()} className={`${primaryButton} mt-3`}>
          Reintentar
        </button>
      </section>
    );
  }

  if (result?.kind === 'approved' && sale) {
    return (
      <section className="flex flex-col items-center gap-6 rounded-sheet border border-line bg-surface p-6 text-center">
        <h1 className="text-lg font-semibold text-ink">Pago aprobado</h1>
        <p className="text-base text-ink">
          Total: <span className="font-semibold tabular-nums">{formatMoney(sale.totalCents)}</span>
        </p>
        <div className="flex flex-col items-center gap-2">
          <QRCodeSVG value={sale.code} size={220} />
          <p className="text-base font-semibold tabular-nums text-ink">{sale.code}</p>
          <p className="text-sm text-muted">Muestra este QR al salir de la tienda</p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <Link to={`/history/${sale.id}`} className={primaryButton}>
            Ver comprobante
          </Link>
          <Link to="/" className={secondaryButton}>
            Seguir comprando
          </Link>
        </div>
      </section>
    );
  }

  if (result?.kind === 'amount_changed') {
    return (
      <section className="flex flex-col gap-4 rounded-sheet border border-line bg-surface p-4">
        <h1 className="text-lg font-semibold text-ink">El monto cambió</h1>
        <p className="text-base text-ink">
          {result.amountCents !== undefined ? (
            <>
              El nuevo total de oferta es{' '}
              <span className="font-semibold tabular-nums">{formatMoney(result.amountCents)}</span>. Revisa el
              carrito y vuelve a intentarlo.
            </>
          ) : (
            'El total de la compra cambió. Revisa el carrito y vuelve a intentarlo.'
          )}
        </p>
        <Link to="/cart" className={primaryButton}>
          Revisar el carrito
        </Link>
      </section>
    );
  }

  if (result?.kind === 'declined') {
    return (
      <section className="flex flex-col gap-4 rounded-sheet border border-line bg-surface p-4">
        <h1 className="text-lg font-semibold text-ink">No se pudo cobrar</h1>
        <p role="alert" className="text-base text-cmr">
          El banco rechazó la tarjeta. Prueba con otra tarjeta.
        </p>
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setSale(null);
          }}
          className={primaryButton}
        >
          Probar con otra tarjeta
        </button>
      </section>
    );
  }

  if (result?.kind === 'uncertain' || result?.kind === 'manual_review') {
    const code = result.attemptId !== undefined ? String(result.attemptId) : null;

    return (
      <section className="flex flex-col gap-4 rounded-sheet border border-line bg-surface p-4">
        <h1 className="text-lg font-semibold text-ink">Avisa en caja</h1>
        <p role="alert" className="text-base text-ink">
          No pudimos confirmar tu pago. No lo repitas: avisa en caja.
        </p>
        {code && (
          <p className="text-base text-ink">
            Muestra este código: <span className="font-semibold tabular-nums">{code}</span>
          </p>
        )}
        <Link to="/" className={secondaryButton}>
          Volver al escáner
        </Link>
      </section>
    );
  }

  if (result?.kind === 'not_available') {
    return (
      <section className="flex flex-col gap-4 rounded-sheet border border-line bg-surface p-4">
        <h1 className="text-lg font-semibold text-ink">Pago no disponible</h1>
        <p role="alert" className="text-base text-ink">
          El pago en línea no está disponible ahora.
        </p>
        <Link to="/cart" className={secondaryButton}>
          Volver al carrito
        </Link>
      </section>
    );
  }

  if (result?.kind === 'error') {
    return (
      <section className="flex flex-col gap-4 rounded-sheet border border-line bg-surface p-4">
        <h1 className="text-lg font-semibold text-ink">No se pudo completar el pago</h1>
        <p role="alert" className="text-base text-cmr">
          {result.message}
        </p>
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setSale(null);
          }}
          className={primaryButton}
        >
          Reintentar
        </button>
        <Link to="/cart" className={secondaryButton}>
          Volver al carrito
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-ink">Pagar en línea</h1>

      <div className="rounded-sheet border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-base text-ink">Total de oferta</span>
          <span className="text-base font-bold tabular-nums text-ink">{formatMoney(offerTotalCents)}</span>
        </div>
      </div>

      <fieldset className="rounded-sheet border border-line bg-surface p-4">
        <legend className="px-1 text-sm font-semibold text-ink">Comprobante</legend>

        <label className="mt-2 flex flex-col gap-1">
          <span className="text-sm text-muted">Tipo de comprobante</span>
          <select
            value={docType}
            onChange={(event) => {
              setDocType(event.target.value as DocType);
              setBuyerDocNumber('');
              setBuyerName('');
            }}
            className="min-h-[44px] rounded-button border border-line bg-surface px-3 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <option value="TICKET">Ticket</option>
            <option value="BOLETA">Boleta con DNI</option>
            <option value="FACTURA">Factura con RUC y razón social</option>
          </select>
        </label>

        {docType === 'BOLETA' && (
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-sm text-muted">DNI (8 dígitos)</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={buyerDocNumber}
              onChange={(event) => setBuyerDocNumber(event.target.value.replace(/\D/g, ''))}
              className="min-h-[44px] rounded-button border border-line bg-surface px-3 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />
          </label>
        )}

        {docType === 'FACTURA' && (
          <>
            <label className="mt-3 flex flex-col gap-1">
              <span className="text-sm text-muted">RUC (11 dígitos)</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={11}
                value={buyerDocNumber}
                onChange={(event) => setBuyerDocNumber(event.target.value.replace(/\D/g, ''))}
                className="min-h-[44px] rounded-button border border-line bg-surface px-3 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              />
            </label>
            <label className="mt-3 flex flex-col gap-1">
              <span className="text-sm text-muted">Razón social</span>
              <input
                type="text"
                autoComplete="off"
                maxLength={120}
                value={buyerName}
                onChange={(event) => setBuyerName(event.target.value)}
                className="min-h-[44px] rounded-button border border-line bg-surface px-3 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              />
            </label>
          </>
        )}

        {comprobanteError && (
          <p role="alert" className="mt-2 text-sm text-cmr">
            {comprobanteError}
          </p>
        )}
      </fieldset>

      <p className="rounded-tag border border-warn bg-paper px-3 py-2 text-sm text-warn">
        Pagarás el total de oferta. Si tienes tarjeta CMR, paga en caja con tu QR y obtén el precio CMR.
      </p>

      <p className="text-sm text-muted">
        Escribe tu tarjeta aquí abajo. Esos datos van directo a Mercado Pago y no pasan por nuestro servidor.
      </p>

      {brickError && (
        <p role="alert" className="rounded-tag border border-cmr bg-paper px-3 py-2 text-sm text-cmr">
          {brickError}
        </p>
      )}

      <div id={containerId} />

      {!comprobanteValid && (
        <p className="text-sm text-muted">
          El formulario de tarjeta se habilita cuando el comprobante es válido.
        </p>
      )}

      {submitting && (
        <p role="status" className="text-sm text-muted">
          Procesando con el banco…
        </p>
      )}

      <Link to="/cart" className={secondaryButton}>
        Volver al carrito
      </Link>
    </section>
  );
}
