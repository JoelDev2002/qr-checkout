import { formatMoney } from '../lib/money';
import { formatDateTimeLima } from '../lib/date';
import { paymentMethodLabel } from '../lib/payment';

export type ReceiptItem = {
  name: string;
  quantity: number;
  subtotalCents: number;
};

export type ReceiptBuyer = {
  docType?: string | null;
  docNumber?: string | null;
  name?: string | null;
  email?: string | null;
};

export type ReceiptProps = {
  title?: string;
  receiptNumber: string;
  code?: string | null;
  createdAt: Date | string;
  items: ReceiptItem[];
  totalCents: number;
  paymentMethod: string;
  buyer?: ReceiptBuyer | null;
};

export function Receipt({
  title = 'Comprobante',
  receiptNumber,
  code,
  createdAt,
  items,
  totalCents,
  paymentMethod,
  buyer,
}: ReceiptProps) {
  const showBuyer =
    buyer &&
    ((buyer.name && buyer.name.trim().length > 0) ||
      (buyer.docNumber && buyer.docNumber.trim().length > 0) ||
      (buyer.email && buyer.email.trim().length > 0));

  const docType = buyer?.docType?.trim();
  const docNumber = buyer?.docNumber?.trim();
  const buyerName = buyer?.name?.trim();
  const buyerEmail = buyer?.email?.trim();

  const hasBuyerDoc = docType && docNumber;

  return (
    <div className="receipt mx-auto w-[320px] bg-white p-4 text-left text-sm text-ink shadow-none print:mt-0 print:bg-white print:p-2 print:shadow-none">
      <header className="border-b border-line pb-3 text-center">
        <h1 className="text-base font-semibold tracking-wide text-ink">QRCheckout · {title}</h1>
        <p className="mt-1 font-semibold tabular-nums">Tipo y número: {receiptNumber}</p>
        <p className="text-xs text-muted">{formatDateTimeLima(createdAt)}</p>
        {code && <p className="text-xs text-muted tabular-nums">Código: {code}</p>}
      </header>
      <section className="mt-3 border-b border-line pb-3">
        {items.length === 0 ? (
          <p className="text-center text-xs text-muted">Sin ítems</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={`${item.name}-${index}`} className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium leading-snug">
                    {item.quantity} × {item.name}
                  </p>
                </div>
                <p className="flex-shrink-0 font-semibold tabular-nums">
                  {formatMoney(item.subtotalCents)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-3 border-b border-line pb-3">
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold">Total cobrado</span>
          <span className="text-base font-bold tabular-nums">{formatMoney(totalCents)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm text-muted">
          <span>Medio de pago</span>
          <span className="tabular-nums">{paymentMethodLabel(paymentMethod)}</span>
        </div>
      </section>
      {showBuyer && (
        <section className="mt-3 border-b border-line pb-3 text-sm">
          <p className="font-semibold">Datos del comprador</p>
          {buyerName && <p className="mt-1 leading-snug">{buyerName}</p>}
          {hasBuyerDoc && (
            <p className="mt-0.5 text-muted">
              {docType}: {docNumber}
            </p>
          )}
          {buyerEmail && <p className="mt-0.5 break-words text-muted">{buyerEmail}</p>}
        </section>
      )}
      <footer className="mt-3 text-center text-xs text-muted">
        Comprobante simulado, sin validez tributaria
      </footer>
      <style>{`@media print { body * { visibility: hidden; } .receipt, .receipt * { visibility: visible; } .receipt { position: absolute; left: 0; top: 0; width: 320px !important; margin: 0 !important; box-shadow: none !important; border: none !important; background: white !important; } }`}</style>
    </div>
  );
}
