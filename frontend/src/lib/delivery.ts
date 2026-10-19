export type DeliveryStatus = 'Entregado' | 'Por entregar';

/** RN-21: una compra pagada en línea queda "Por entregar" hasta que el cajero la verifica al salir. */
export function deliveryStatus(deliveredAt: string | null): DeliveryStatus {
  return deliveredAt === null ? 'Por entregar' : 'Entregado';
}
