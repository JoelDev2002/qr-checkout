import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QrTicket } from '../../components/QrTicket';
import { useCart } from '../../features/cart/CartContext';
import { cartErrorMessage } from '../../features/cart/messages';
import { resolveQrPhase, type QrPhase } from '../../features/qr/qrOutcome';
import { getCart } from '../../services/cart';
import { getPurchases } from '../../services/purchases';

const primaryButton =
  'flex min-h-[44px] w-full items-center justify-center rounded-button bg-ink px-4 text-base font-semibold text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';
const secondaryButton =
  'flex min-h-[44px] w-full items-center justify-center rounded-button border border-line bg-surface px-4 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60';

const POLL_INTERVAL_MS = 5000;

/** El QR capturado al entrar: contra él se comparan las consultas de GET /cart. */
type ActiveQr = {
  cartId: number;
  code: string;
  expiresAt: string;
};

/**
 * Pantalla del QR del cliente (T2.4; DESIGN §4 cliente punto 4). Mientras está visible consulta
 * GET /cart cada 5 s para saber si el QR venció (mismo carrito liberado) o si se cobró (un carrito
 * nuevo + la compra ya aparece en el historial). Sin QR activo redirige al carrito.
 */
export function QrPage() {
  const navigate = useNavigate();
  const { cart, loading, error, reload, generateQr, cancelQr } = useCart();

  const [activeQr, setActiveQr] = useState<ActiveQr | null>(null);
  const [phase, setPhase] = useState<QrPhase>('active');
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // Sin QR activo no hay pantalla que mostrar (DESIGN §4.4): se vuelve al carrito.
  useEffect(() => {
    if (initializedRef.current || cart === null) {
      return;
    }

    if (cart.status === 'PENDING' && cart.qrCode !== null && cart.qrExpiresAt !== null) {
      setActiveQr({ cartId: cart.id, code: cart.qrCode, expiresAt: cart.qrExpiresAt });
      initializedRef.current = true;
    } else {
      navigate('/cart', { replace: true });
    }
  }, [cart, navigate]);

  // Reloj de la cuenta regresiva, solo mientras el QR siga activo.
  useEffect(() => {
    if (activeQr === null || phase !== 'active') {
      return;
    }

    const id = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(id);
  }, [activeQr, phase]);

  // Consulta GET /cart cada 5 s y decide si el QR venció o si el carrito se cobró (RN-05, RN-06).
  useEffect(() => {
    if (activeQr === null || phase !== 'active') {
      return;
    }

    const expected = activeQr;
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const current = await getCart();
        const purchaseCodes =
          current.id === expected.cartId ? [] : (await getPurchases()).items.map((sale) => sale.code);

        if (cancelled) {
          return;
        }

        setPhase(
          resolveQrPhase(
            { cartId: expected.cartId, code: expected.code },
            { cartId: current.id, status: current.status, qrCode: current.qrCode, purchaseCodes },
          ),
        );
      } catch {
        // Un error puntual de red no cambia el estado; el siguiente ciclo reintenta.
      }
    }

    const id = window.setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeQr, phase]);

  async function handleCancel(): Promise<void> {
    setBusy(true);
    setMessage(null);

    try {
      await cancelQr();
      navigate('/cart');
    } catch (caught) {
      setMessage(cartErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateAgain(): Promise<void> {
    setBusy(true);
    setMessage(null);

    try {
      const updated = await generateQr();

      if (updated.status === 'PENDING' && updated.qrCode !== null && updated.qrExpiresAt !== null) {
        setActiveQr({ cartId: updated.id, code: updated.qrCode, expiresAt: updated.qrExpiresAt });
        setPhase('active');
        setNow(new Date());
      } else {
        navigate('/cart', { replace: true });
      }
    } catch (caught) {
      setMessage(cartErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (activeQr === null) {
    if (loading || cart === null) {
      return (
        <p role="status" className="text-base text-muted">
          Cargando…
        </p>
      );
    }

    return (
      <section className="rounded-sheet border border-line bg-surface p-4">
        <p role="alert" className="text-base text-cmr">
          {error ?? 'El QR está vacío.'}
        </p>
        <button type="button" onClick={() => void reload()} className={`${primaryButton} mt-3`}>
          Reintentar
        </button>
      </section>
    );
  }

  if (phase === 'paid') {
    return (
      <section className="rounded-sheet border border-line bg-surface p-6 text-center">
        <h1 className="text-2xl font-bold text-saving">¡Pago confirmado!</h1>
        <p className="mt-2 text-base text-muted">Tu compra quedó registrada en tu historial.</p>
        <Link to="/history" className={`${primaryButton} mt-4`}>
          Ver mi historial
        </Link>
        <Link to="/" className={`${secondaryButton} mt-3`}>
          Seguir comprando
        </Link>
      </section>
    );
  }

  if (phase === 'expired') {
    return (
      <section className="rounded-sheet border border-line bg-surface p-6 text-center">
        <h1 className="text-2xl font-bold text-warn">El QR venció</h1>
        <p className="mt-2 text-base text-muted">
          Genera uno nuevo para llevarlo a caja. Tu carrito sigue guardado.
        </p>
        {message !== null && (
          <p role="alert" className="mt-2 text-sm text-cmr">
            {message}
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleGenerateAgain()}
          disabled={busy}
          className={`${primaryButton} mt-4`}
        >
          Generar uno nuevo
        </button>
        <button type="button" onClick={() => navigate('/cart')} className={`${secondaryButton} mt-3`}>
          Volver al carrito
        </button>
      </section>
    );
  }

  if (phase === 'inactive') {
    return (
      <section className="rounded-sheet border border-line bg-surface p-6 text-center">
        <h1 className="text-2xl font-bold text-warn">Este QR ya no está activo</h1>
        <p className="mt-2 text-base text-muted">El cajero lo rechazó o canceló el carrito.</p>
        <button type="button" onClick={() => navigate('/cart')} className={`${primaryButton} mt-4`}>
          Volver al carrito
        </button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {message !== null && (
        <p role="alert" className="rounded-tag border border-cmr bg-paper px-3 py-2 text-sm text-cmr">
          {message}
        </p>
      )}

      <QrTicket
        code={activeQr.code}
        expiresAt={activeQr.expiresAt}
        now={now}
        onCancel={() => void handleCancel()}
        onBack={() => navigate('/cart')}
        busy={busy}
      />
    </div>
  );
}