// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Receipt } from './Receipt';

describe('Receipt', () => {
  it('renders without buyer data', () => {
    render(
      <Receipt
        receiptNumber="T001-000001"
        code="C-12345"
        createdAt="2025-10-09T12:00:00Z"
        items={[
          { name: 'Producto A', quantity: 2, subtotalCents: 5000 },
          { name: 'Producto B', quantity: 1, subtotalCents: 2500 },
        ]}
        totalCents={7500}
        paymentMethod="CASH"
      />,
    );

    expect(screen.getByText(/Tipo y número: T001-000001/)).toBeTruthy();
    expect(screen.getByText(/Código: C-12345/)).toBeTruthy();
    expect(screen.getByText('2 × Producto A')).toBeTruthy();
    expect(screen.getByText('Total cobrado')).toBeTruthy();
    expect(screen.getByText('Efectivo')).toBeTruthy();
    expect(screen.getByText(/Comprobante simulado, sin validez tributaria/)).toBeTruthy();
  });

  it('renders with buyer data', () => {
    render(
      <Receipt
        receiptNumber="T001-000002"
        createdAt="2025-10-09T12:00:00Z"
        items={[{ name: 'Test', quantity: 1, subtotalCents: 1000 }]}
        totalCents={1000}
        paymentMethod="CMR"
        buyer={{
          docType: 'DNI',
          docNumber: '12345678',
          name: 'Juan Pérez',
          email: 'juan@example.com',
        }}
      />,
    );

    expect(screen.getByText('Datos del comprador')).toBeTruthy();
    expect(screen.getByText('Juan Pérez')).toBeTruthy();
    expect(screen.getByText('DNI: 12345678')).toBeTruthy();
    expect(screen.getByText('juan@example.com')).toBeTruthy();
    expect(screen.getByText('Tarjeta CMR')).toBeTruthy();
  });
});

