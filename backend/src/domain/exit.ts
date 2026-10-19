export type ExitVerificationStatus = 'DELIVERED' | 'ALREADY_DELIVERED';

/** RN-21: la primera verificación entrega la compra; una segunda no la vuelve a entregar. */
export function exitVerificationStatus(deliveredAt: Date | null): ExitVerificationStatus {
  return deliveredAt === null ? 'DELIVERED' : 'ALREADY_DELIVERED';
}
