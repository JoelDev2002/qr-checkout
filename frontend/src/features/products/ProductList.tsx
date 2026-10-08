import { Link } from 'react-router-dom';
import { formatBarcode, formatProductPrices, isLowStock } from '../../lib/productDisplay';
import type { AdminProduct } from '../../types/product';
import { ActiveToggle } from './ActiveToggle';

const editLinkClasses =
  'flex min-h-[44px] min-w-[44px] items-center rounded-button border border-line bg-surface px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

type ProductListProps = {
  products: AdminProduct[];
  busyId: number | null;
  pendingId: number | null;
  onAskToggle: (product: AdminProduct) => void;
  onConfirmToggle: () => void;
  onCancelToggle: () => void;
  onAskAdjust: (product: AdminProduct) => void;
};

type ProductRowProps = {
  product: AdminProduct;
  busy: boolean;
  awaiting: boolean;
  onAskToggle: (product: AdminProduct) => void;
  onConfirmToggle: () => void;
  onCancelToggle: () => void;
  onAskAdjust: (product: AdminProduct) => void;
};

function ProductTableRow({
  product,
  busy,
  awaiting,
  onAskToggle,
  onConfirmToggle,
  onCancelToggle,
  onAskAdjust,
}: ProductRowProps) {
  const cells = formatProductPrices(product);

  return (
    <tr className="border-t border-line">
      <td className="p-2">
        <span className="block font-semibold text-ink">{product.name}</span>
        <span className="block text-sm text-muted">
          {product.brand} · {formatBarcode(product.barcode)}
        </span>
      </td>
      <td className="p-2">{product.categoryName}</td>
      <td className="p-2 text-right tabular-nums">{cells.original}</td>
      <td className="p-2 text-right tabular-nums">
        <span className="block">{cells.offer}</span>
        {cells.campaignName !== null && (
          <span className="block text-sm text-muted">{cells.campaignName}</span>
        )}
      </td>
      <td className="p-2 text-right tabular-nums">
        {product.hasCmrDiscount ? (
          <span className="font-bold text-cmr">{cells.cmr}</span>
        ) : (
          <span className="text-muted">{cells.cmr}</span>
        )}
      </td>
      <td className="p-2 text-right tabular-nums">
        <span className="block">{product.stock}</span>
        {isLowStock(product.stock) && (
          <span className="block text-sm font-semibold text-warn">Poco stock</span>
        )}
      </td>
      <td className="p-2">
        <ActiveToggle
          product={product}
          busy={busy}
          awaiting={awaiting}
          onAsk={() => onAskToggle(product)}
          onConfirm={onConfirmToggle}
          onCancel={onCancelToggle}
        />
      </td>
      <td className="p-2">
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/admin/products/${product.id}`}
            aria-label={`Editar ${product.name}`}
            className={editLinkClasses}
          >
            Editar
          </Link>
          <button
            type="button"
            onClick={() => onAskAdjust(product)}
            className={editLinkClasses}
          >
            Ajustar stock
          </button>
        </div>
      </td>
    </tr>
  );
}

function ProductCard({
  product,
  busy,
  awaiting,
  onAskToggle,
  onConfirmToggle,
  onCancelToggle,
  onAskAdjust,
}: ProductRowProps) {
  const cells = formatProductPrices(product);

  return (
    <li className="rounded-tag border border-line bg-surface p-4">
      <p className="text-base font-semibold text-ink">{product.name}</p>
      <p className="text-sm text-muted">
        {product.brand} · {formatBarcode(product.barcode)}
      </p>
      <p className="text-sm text-muted">{product.categoryName}</p>

      <div className="mt-3 flex flex-col gap-1 text-base">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted">Precio original</span>
          <span className="tabular-nums">{cells.original}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted">Oferta</span>
          <span className="tabular-nums">{cells.offer}</span>
        </div>
        {cells.campaignName !== null && (
          <p className="text-right text-sm text-muted">{cells.campaignName}</p>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted">CMR</span>
          {product.hasCmrDiscount ? (
            <span className="font-bold tabular-nums text-cmr">{cells.cmr}</span>
          ) : (
            <span className="tabular-nums text-muted">{cells.cmr}</span>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted">Stock</span>
          <span className="tabular-nums">
            {product.stock}
            {isLowStock(product.stock) && (
              <span className="ml-2 font-semibold text-warn">Poco stock</span>
            )}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <ActiveToggle
          product={product}
          busy={busy}
          awaiting={awaiting}
          onAsk={() => onAskToggle(product)}
          onConfirm={onConfirmToggle}
          onCancel={onCancelToggle}
        />
        <Link
          to={`/admin/products/${product.id}`}
          aria-label={`Editar ${product.name}`}
          className={editLinkClasses}
        >
          Editar
        </Link>
        <button
          type="button"
          onClick={() => onAskAdjust(product)}
          className={editLinkClasses}
        >
          Ajustar stock
        </button>
      </div>
    </li>
  );
}

/** En escritorio es una tabla; desde 640 px para abajo cada producto es una tarjeta apilada. */
export function ProductList({
  products,
  busyId,
  pendingId,
  onAskToggle,
  onConfirmToggle,
  onCancelToggle,
  onAskAdjust,
}: ProductListProps) {
  return (
    <div className="mt-4">
      <div className="hidden overflow-x-auto rounded-tag border border-line sm:block">
        <table className="w-full min-w-[64rem] border-collapse bg-surface text-base">
          <caption className="sr-only">Lista de productos</caption>
          <thead>
            <tr className="bg-paper text-sm font-semibold text-ink">
              <th scope="col" className="p-2 text-left">
                Producto
              </th>
              <th scope="col" className="p-2 text-left">
                Categoría
              </th>
              <th scope="col" className="p-2 text-right">
                Precio original
              </th>
              <th scope="col" className="p-2 text-right">
                Oferta
              </th>
              <th scope="col" className="p-2 text-right">
                CMR
              </th>
              <th scope="col" className="p-2 text-right">
                Stock
              </th>
              <th scope="col" className="p-2 text-left">
                Estado
              </th>
              <th scope="col" className="p-2 text-left">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <ProductTableRow
                key={product.id}
                product={product}
                busy={busyId === product.id}
                awaiting={pendingId === product.id}
                onAskToggle={onAskToggle}
                onConfirmToggle={onConfirmToggle}
                onCancelToggle={onCancelToggle}
                onAskAdjust={onAskAdjust}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 sm:hidden">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            busy={busyId === product.id}
            awaiting={pendingId === product.id}
            onAskToggle={onAskToggle}
            onConfirmToggle={onConfirmToggle}
            onCancelToggle={onCancelToggle}
            onAskAdjust={onAskAdjust}
          />
        ))}
      </ul>
    </div>
  );
}
