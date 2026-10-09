import type { RouteObject } from 'react-router-dom';
import { ClientLayout } from './components/ClientLayout';
import { RequireRole } from './components/RequireRole';
import { CartProvider } from './features/cart/CartContext';
import { AdminHome } from './pages/admin/AdminHome';
import { Campaigns } from './pages/admin/Campaigns';
import { Categories } from './pages/admin/Categories';
import { ProductFormPage } from './pages/admin/ProductForm';
import { Products } from './pages/admin/Products';
import { Login } from './pages/auth/Login';
import { CashierHome } from './pages/cashier/CashierHome';
import { ComingSoon } from './pages/client/ComingSoon';
import { ScannerPage } from './pages/client/ScannerPage';
import { CartPage } from './pages/client/CartPage';

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
      // T2.4 reemplaza este marcador por la pantalla QrTicket real.
      { path: 'qr', element: <ComingSoon title="QR" /> },
    ],
  },
  {
    path: '/admin',
    element: (
      <RequireRole roles={['ADMIN']}>
        <AdminHome />
      </RequireRole>
    ),
  },
  {
    path: '/admin/products',
    element: (
      <RequireRole roles={['ADMIN']}>
        <Products />
      </RequireRole>
    ),
  },
  {
    path: '/admin/products/new',
    element: (
      <RequireRole roles={['ADMIN']}>
        <ProductFormPage />
      </RequireRole>
    ),
  },
  {
    path: '/admin/products/:id',
    element: (
      <RequireRole roles={['ADMIN']}>
        <ProductFormPage />
      </RequireRole>
    ),
  },
  {
    path: '/admin/categories',
    element: (
      <RequireRole roles={['ADMIN']}>
        <Categories />
      </RequireRole>
    ),
  },
  {
    path: '/admin/campaigns',
    element: (
      <RequireRole roles={['ADMIN']}>
        <Campaigns />
      </RequireRole>
    ),
  },
  {
    path: '/cashier',
    element: (
      <RequireRole roles={['CASHIER']}>
        <CashierHome />
      </RequireRole>
    ),
  },
];
