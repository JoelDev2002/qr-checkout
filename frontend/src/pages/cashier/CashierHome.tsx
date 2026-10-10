import { useId, useState, type FormEvent } from 'react';
import { Receipt } from '../../components/Receipt';
import { Scanner } from '../../components/Scanner';
import {
  buildConfirmBody,
  checkoutErrorMessage,
  documentIssue,
  isValidCartCode,
  normalizeCartCode,
  receiptPaymentMethod,
  shouldRestartScan,
} from '../../features/checkout/checkout';
import { QR_SCAN_FORMATS } from '../../features/scanner/camera';
import { formatMoney } from '../../lib/money';
import {
  confirmCheckout,
  getCheckoutPreview,
  rejectCheckout,
  type CheckoutDocType,
  type CheckoutItem,
  type CheckoutPaymentMethod,
  type CheckoutPreview,
  type CheckoutSale,
} from '../../services/checkout';

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
const buttonBase = `min-h-[44px] rounded-button px-4 text-base font-semibold disabled:opacity-60 ${focusRing}`;
const primaryButton = `${buttonBase} bg-ink text-surface`;
const secondaryButton = `${buttonBase} border border-line bg-surface text-ink`;

const DOC_OPTIONS: ReadonlyArray<{ value: CheckoutDocType; label: string }> = [
  { value: 'TICKET', label: 'Ticket' },
  { value: 'BOLETA', label: 'Boleta' },
  { value: 'FACTURA', label: 'Factura' },
];

type TopChoice = 'CMR' | 'OTHER';
type OtherChoice = Exclude<CheckoutPaymentMethod, 'CMR_CARD'>;

function selectedButton(selected: boolean): string {
  return `${buttonBase} border ${
    selected ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink'
  }`;
}

function itemIssueMessage(item: CheckoutItem): string | null {
  if (item.issue === 'INACTIVE') {
    return 'Ya no está a la venta.';
  }

  if (item.issue === 'INSUFFICIENT_STOCK') {
    return 'No hay stock suficiente.';
  }

  return null;
}

/** Pantalla "Cobrar" del cajero (T2.6; DESIGN §4, cajero punto 2). */
export function CashierHome() {
  const inputId = useId();
  const dniId = useId();
  const rucId = useId();
  const nameId = useId();

  const [phase, setPhase] = useState<'scan' | 'ready' | 'done'>('scan');
  const [draft, setDraft] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [sale, setSale] = useState<CheckoutSale | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [attemptCode, setAttemptCode] = useState<string | null>(null);

  const [topChoice, setTopChoice] = useState<TopChoice | null>(null);
  const [otherChoice, setOtherChoice] = useState<OtherChoice | null>(null);

  const [docType, setDocType] = useState<CheckoutDocType>('TICKET');
  const [docNumber, setDocNumber] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [docTouched, setDocTouched] = useState(false);

  const [askReject, setAskReject] = useState(false);

  const paymentMethod: CheckoutPaymentMethod | null =
    topChoice === 'CMR' ? 'CMR_CARD' : topChoice === 'OTHER' ? otherChoice : null;

  const docMessage = documentIssue(docType, docNumber, buyerName);
  const totalUnits =
    preview === null ? 0 : preview.items.reduce((sum, item) => sum + item.quantity, 0);
  const canConfirm =
    preview !== null &&
    preview.canCharge &&
    paymentMethod !== null &&
    docMessage === null &&
    !submitting;

  function resetCheckoutState(): void {
    setTopChoice(null);
    setOtherChoice(null);
    setDocType('TICKET');
    setDocNumber('');
    setBuyerName('');
    setDocTouched(false);
    setAskReject(false);
  }

  function backToScan(): void {
    setPhase('scan');
    setCode(null);
    setPreview(null);
    setSale(null);
    setDraft('');
    setAttemptCode(null);
    resetCheckoutState();
  }

  async function loadByCode(raw: string): Promise<void> {
    const normalized = normalizeCartCode(raw);
    setMessage(null);
    setAttemptCode(null);

    if (normalized === '') {
      return;
    }

    if (!isValidCartCode(normalized)) {
      setMessage('El código del carrito debe tener el formato C-XXXXX.');
      return;
    }

    setLoading(true);
    try {
      const data = await getCheckoutPreview(normalized);
      setCode(normalized);
      setPreview(data);
      resetCheckoutState();
      setPhase('ready');
    } catch (error) {
      setAttemptCode(normalized);
      setMessage(checkoutErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadByCode(draft);
  }

  async function handleConfirm(): Promise<void> {
    if (code === null || paymentMethod === null || !canConfirm) {
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const result = await confirmCheckout(
        code,
        buildConfirmBody({ paymentMethod, docType, docNumber, buyerName }),
      );
      setSale(result);
      setPhase('done');
    } catch (error) {
      setMessage(checkoutErrorMessage(error));
      if (shouldRestartScan(error)) {
        backToScan();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject(): Promise<void> {
    if (code === null) {
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      await rejectCheckout(code);
      backToScan();
      setMessage('Carrito rechazado. El cliente puede volver a editarlo.');
    } catch (error) {
      setMessage(checkoutErrorMessage(error));
      setAskReject(false);
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext(): void {
    backToScan();
    setMessage(null);
  }

  if (phase === 'done' && sale !== null) {
    return (
      <section className="flex flex-col items-center gap-4">
        <div className="w-full rounded-sheet border border-line bg-surface p-6 text-center">
          <h1 className="text-2xl font-bold text-saving">Cobro confirmado</h1>
          <p className="mt-2 text-sm text-muted">Total cobrado</p>
          <p className="text-4xl font-bold tabular-nums text-saving">{formatMoney(sale.totalCents)}</p>
          <p className="mt-2 text-sm text-muted">{sale.customerName}</p>
        </div>

        <Receipt
          receiptNumber={sale.receiptNumber}
          code={sale.code}
          createdAt={sale.createdAt}
          items={sale.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            subtotalCents: item.subtotalCents,
          }))}
          totalCents={sale.totalCents}
          paymentMethod={receiptPaymentMethod(sale.paymentMethod)}
          buyer={{
            docType: sale.buyerDocType,
            docNumber: sale.buyerDocNumber,
            name: sale.buyerName,
          }}
        />

        <div className="flex w-full max-w-[320px] flex-col gap-2">
          <button type="button" onClick={() => window.print()} className={`${primaryButton} w-full`}>
            Imprimir comprobante
          </button>
          <button type="button" onClick={handleNext} className={`${secondaryButton} w-full`}>
            Siguiente cliente
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {message !== null && (
        <div role="alert" className="rounded-tag border border-cmr bg-surface px-3 py-2">
          <p className="text-sm text-cmr">{message}</p>
          {attemptCode !== null && (
            <button
              type="button"
              onClick={() => void loadByCode(attemptCode)}
              disabled={loading}
              className={`${secondaryButton} mt-2 w-full`}
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      {phase === 'scan' && (
        <div className="flex flex-col gap-4">
          <form
            onSubmit={(event) => void handleManualSubmit(event)}
            className="rounded-sheet border border-line bg-surface p-4"
          >
            <label htmlFor={inputId} className="text-sm font-semibold text-ink">
              Código del carrito
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id={inputId}
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="C-XXXXX"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className={`min-h-[44px] w-full rounded-button border border-line bg-surface px-3 text-base tabular-nums text-ink ${focusRing}`}
              />
              <button type="submit" disabled={draft.trim() === '' || loading} className={primaryButton}>
                Ir
              </button>
            </div>
          </form>

          <Scanner onScan={(text) => void loadByCode(text)} formats={QR_SCAN_FORMATS} />

          {loading && (
            <p role="status" className="text-sm text-muted">
              Buscando el carrito…
            </p>
          )}
        </div>
      )}

      {phase === 'ready' && preview !== null && (
        <div className="flex flex-col gap-4">
          <article className="rounded-sheet border border-line bg-surface p-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-ink">Carrito {preview.code}</h1>
                <p className="text-sm text-muted">
                  {preview.customerName} · {totalUnits} {totalUnits === 1 ? 'producto' : 'productos'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleNext}
                className={`min-h-[44px] rounded-button px-2 text-sm font-semibold text-muted underline ${focusRing}`}
              >
                Escanear otro
              </button>
            </header>

            <ul className="mt-2 divide-y divide-line">
              {preview.items.map((item) => {
                const issue = itemIssueMessage(item);

                return (
                  <li key={item.productId} className="py-3">
                    <p className="text-base font-semibold text-ink">
                      {item.quantity} × {item.name}
                    </p>
                    <p className="text-sm text-muted">{item.brand}</p>
                    <dl className="mt-1 flex flex-col gap-0.5 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-muted">Oferta</dt>
                        <dd className="tabular-nums text-ink">{formatMoney(item.offerPriceCents)}</dd>
                      </div>
                      {item.hasCmrDiscount && (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-muted">CMR</dt>
                          <dd className="tabular-nums font-semibold text-cmr">
                            {formatMoney(item.cmrPriceCents)}
                          </dd>
                        </div>
                      )}
                    </dl>
                    {issue !== null && <p className="mt-1 text-sm font-semibold text-warn">{issue}</p>}
                  </li>
                );
              })}
            </ul>
          </article>

          {!preview.canCharge && (
            <p role="alert" className="rounded-tag border border-warn bg-surface px-3 py-2 text-sm text-warn">
              No se puede cobrar este carrito. Corrige o quita los productos marcados, o rechaza el carrito.
            </p>
          )}

          <div role="radiogroup" aria-label="Medio de pago" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              role="radio"
              aria-checked={topChoice === 'CMR'}
              disabled={!preview.canCharge}
              onClick={() => setTopChoice('CMR')}
              className={`flex min-h-[44px] flex-col items-start gap-1 rounded-sheet border p-4 text-left disabled:opacity-60 ${focusRing} ${
                topChoice === 'CMR' ? 'border-ink bg-surface ring-2 ring-ink' : 'border-line bg-surface'
              }`}
            >
              <span className="text-sm font-semibold text-ink">Con tarjeta CMR</span>
              <span className="text-2xl font-bold tabular-nums text-cmr">
                {formatMoney(preview.summary.cmrTotalCents)}
              </span>
            </button>

            <div
              className={`rounded-sheet border p-4 ${
                topChoice === 'OTHER' ? 'border-ink bg-surface ring-2 ring-ink' : 'border-line bg-surface'
              }`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={topChoice === 'OTHER'}
                disabled={!preview.canCharge}
                onClick={() => setTopChoice('OTHER')}
                className={`flex w-full flex-col items-start gap-1 rounded-button text-left disabled:opacity-60 ${focusRing}`}
              >
                <span className="text-sm font-semibold text-ink">Otro medio</span>
                <span className="text-2xl font-bold tabular-nums text-ink">
                  {formatMoney(preview.summary.normalTotalCents)}
                </span>
              </button>

              {topChoice === 'OTHER' && (
                <div role="radiogroup" aria-label="Tipo de otro medio" className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={otherChoice === 'OTHER_CARD'}
                    onClick={() => setOtherChoice('OTHER_CARD')}
                    className={selectedButton(otherChoice === 'OTHER_CARD')}
                  >
                    Tarjeta
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={otherChoice === 'CASH'}
                    onClick={() => setOtherChoice('CASH')}
                    className={selectedButton(otherChoice === 'CASH')}
                  >
                    Efectivo
                  </button>
                </div>
              )}
            </div>
          </div>

          <fieldset className="rounded-sheet border border-line bg-surface p-4">
            <legend className="px-1 text-sm font-semibold text-ink">Comprobante</legend>

            <div role="radiogroup" aria-label="Tipo de comprobante" className="flex flex-wrap gap-2">
              {DOC_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={docType === option.value}
                  onClick={() => {
                    setDocType(option.value);
                    setDocTouched(false);
                  }}
                  className={selectedButton(docType === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {docType === 'BOLETA' && (
              <div className="mt-3">
                <label htmlFor={dniId} className="text-sm font-semibold text-ink">
                  DNI del comprador
                </label>
                <input
                  id={dniId}
                  type="text"
                  inputMode="numeric"
                  value={docNumber}
                  onChange={(event) => {
                    setDocNumber(event.target.value);
                    setDocTouched(true);
                  }}
                  autoComplete="off"
                  className={`mt-1 min-h-[44px] w-full rounded-button border border-line bg-surface px-3 text-base tabular-nums text-ink ${focusRing}`}
                />
              </div>
            )}

            {docType === 'FACTURA' && (
              <>
                <div className="mt-3">
                  <label htmlFor={rucId} className="text-sm font-semibold text-ink">
                    RUC del comprador
                  </label>
                  <input
                    id={rucId}
                    type="text"
                    inputMode="numeric"
                    value={docNumber}
                    onChange={(event) => {
                      setDocNumber(event.target.value);
                      setDocTouched(true);
                    }}
                    autoComplete="off"
                    className={`mt-1 min-h-[44px] w-full rounded-button border border-line bg-surface px-3 text-base tabular-nums text-ink ${focusRing}`}
                  />
                </div>
                <div className="mt-3">
                  <label htmlFor={nameId} className="text-sm font-semibold text-ink">
                    Razón social
                  </label>
                  <input
                    id={nameId}
                    type="text"
                    value={buyerName}
                    onChange={(event) => {
                      setBuyerName(event.target.value);
                      setDocTouched(true);
                    }}
                    autoComplete="off"
                    className={`mt-1 min-h-[44px] w-full rounded-button border border-line bg-surface px-3 text-base text-ink ${focusRing}`}
                  />
                </div>
              </>
            )}

            {docTouched && docMessage !== null && (
              <p role="alert" className="mt-2 text-sm font-semibold text-cmr">
                {docMessage}
              </p>
            )}
          </fieldset>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={!canConfirm}
              className={`${primaryButton} w-full`}
            >
              {submitting ? 'Cobrando…' : 'Confirmar cobro'}
            </button>

            {askReject ? (
              <div className="rounded-tag border border-line bg-surface p-3">
                <p className="text-base text-ink">
                  ¿Rechazar el carrito? El cliente podrá editarlo de nuevo.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleReject()}
                    disabled={submitting}
                    className={`${primaryButton} flex-1`}
                  >
                    Sí, rechazar
                  </button>
                  <button
                    type="button"
                    onClick={() => setAskReject(false)}
                    disabled={submitting}
                    className={`${secondaryButton} flex-1`}
                  >
                    No
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAskReject(true)}
                className={`${secondaryButton} w-full`}
              >
                Rechazar carrito
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
