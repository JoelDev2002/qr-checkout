import type { RouteObject } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { CashierLayout } from './components/CashierLayout';
import { ClientLayout } from './components/ClientLayout';
import { RequireRole } from './components/RequireRole';
import { CartProvider } from './features/cart/CartContext';
import { Campaigns } from './pages/admin/Campaigns';
import { Categories } from './pages/admin/Categories';
import { Dashboard } from './pages/admin/Dashboard';
import { ProductFormPage } from './pages/admin/ProductForm';
import { Products } from './pages/admin/Products';
import { Login } from './pages/auth/Login';
import { CashierHome } from './pages/cashier/CashierHome';
import { TodaySales } from './pages/cashier/TodaySales';

import HistoryPage from './pages/client/HistoryPage';
import HistoryDetailPage from './pages/client/HistoryDetailPage';
import { ScannerPage } from './pages/client/ScannerPage';
import { CartPage } from './pages/client/CartPage';
import { QrPage } from './pages/client/QrPage';

export const routes: RouteObject[] = [
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: (
      <RequireRole roles={['CUSTOMER']}>
        <CartProvider>
          <ClientLayout />
        </CartProvider>
      </RequireRole>
    ),
    children: [
      { index: true, element: <ScannerPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'qr', element: <QrPage /> },
      // T2.8 reemplaza este marcador por la pantalla de historial real.
      { path: 'history', element: <HistoryPage /> },
      { path: 'history/:saleId', element: <HistoryDetailPage /> },
],
  },
  {
    path: '/admin',
    element: (
      <RequireRole roles={['ADMIN']}>
        <AdminLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'products', element: <Products /> },
      { path: 'products/new', element: <ProductFormPage /> },
      { path: 'products/:id', element: <ProductFormPage /> },
      { path: 'categories', element: <Categories /> },
      { path: 'campaigns', element: <Campaigns /> },
    ],
  },
  {
    path: '/cashier',
    element: (
      <RequireRole roles={['CASHIER']}>
        <CashierLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <CashierHome /> },
      { path: 'today', element: <TodaySales /> },
    ],
  },
];
