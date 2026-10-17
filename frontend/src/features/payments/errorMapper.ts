export type OnlinePaymentErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_DOCUMENT'
  | 'ALREADY_PAID'
  | 'CART_LOCKED'
  | 'EMPTY_CART'
  | 'INSUFFICIENT_STOCK'
  | 'INACTIVE_PRODUCT'
  | 'MAX_PER_PRODUCT'
  | 'AMOUNT_CHANGED'
  | 'PAYMENT_NOT_CONFIGURED'
  | 'PAYMENT_TOKEN_INVALID'
  | 'PAYMENT_DECLINED'
  | 'PAYMENT_UNCERTAIN'
  | 'OUT_OF_STOCK'
  | 'INTERNAL_ERROR';

export type MappedPaymentResult =
  | { kind: 'approved' }
  | { kind: 'amount_changed'; amountCents?: number }
  | { kind: 'declined' }
  | { kind: 'uncertain'; attemptId?: string | number }
  | { kind: 'not_available' }
  | { kind: 'manual_review'; attemptId?: string | number }
  | { kind: 'error'; message: string };

export function mapApiError(code: string, message: string, details?: unknown): MappedPaymentResult {
  if (code === 'AMOUNT_CHANGED') {
    const d = details as { amountCents?: number } | undefined;
    return { kind: 'amount_changed', amountCents: d?.amountCents };
  }

  if (code === 'PAYMENT_DECLINED') {
    return { kind: 'declined' };
  }

  if (code === 'PAYMENT_UNCERTAIN') {
    const attemptId = extractAttemptId(message);
    return { kind: 'uncertain', attemptId };
  }

  if (code === 'PAYMENT_NOT_CONFIGURED' || code === 'PAYMENT_CONFIGURATION_ERROR') {
    return { kind: 'not_available' };
  }

  if (code === 'OUT_OF_STOCK' || code === 'CART_LOCKED' || code === 'INTERNAL_ERROR') {
    const attemptId = extractAttemptId(message);
    if (attemptId != null) {
      return { kind: 'manual_review', attemptId };
    }
    return { kind: 'error', message };
  }

  return { kind: 'error', message };
}

function extractAttemptId(message: string): string | number | undefined {
  const m = message.match(/(código|codigo|attemptId)\s*:?\s*(\d+)/i);
  if (m) return m[2];
  return undefined;
}
