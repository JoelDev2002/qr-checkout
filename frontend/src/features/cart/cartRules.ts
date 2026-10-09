import type { CartItem, CartItemIssue, InstallmentOption } from '../../services/cart';

/** Cuota que se muestra por defecto si el servidor la ofrece (DESIGN §3 muestra 6). */
export const DEFAULT_INSTALLMENT_COUNT = 6;

export const INACTIVE_ISSUE_MESSAGE =
  'Este producto ya no está disponible. Quítalo para continuar.';

export const STOCK_ISSUE_MESSAGE =
  'No hay stock suficiente de este producto. Ajusta la cantidad o quítalo.';

/** Aviso para un ítem con problema; null si el ítem se puede cobrar (RN-04). */
export function itemIssueMessage(issue: CartItemIssue): string | null {
  if (issue === 'INACTIVE') {
    return INACTIVE_ISSUE_MESSAGE;
  }

  if (issue === 'INSUFFICIENT_STOCK') {
    return STOCK_ISSUE_MESSAGE;
  }

  return null;
}

/** Con un ítem inactivo o sin stock no se puede generar el QR hasta quitarlo o ajustarlo. */
export function hasBlockingIssue(items: readonly CartItem[]): boolean {
  return items.some((item) => item.issue !== null);
}

/** Cantidad de cuotas marcada al abrir el selector: la de por defecto si existe, si no la menor. */
export function defaultInstallmentCount(installments: readonly InstallmentOption[]): number | null {
  const first = installments[0];

  if (first === undefined) {
    return null;
  }

  const preferred = installments.find((option) => option.count === DEFAULT_INSTALLMENT_COUNT);

  return (preferred ?? first).count;
}
