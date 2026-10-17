import MercadoPagoDev from './pages/dev/MercadoPago';
import type { RouteObject } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { CashierLayout } from './components/CashierLayout';
import { ClientLayout } from './components/ClientLayout';
import { RequireRole } from './components/RequireRole';
import { CartProvider } from './features/cart/CartContext';
import { CampaignFormPage } from './pages/admin/CampaignForm';
import { Campaigns } from './pages/admin/Campaigns';
import { Cashiers } from './pages/admin/Cashiers';
import { Categories } from './pages/admin/Categories';
import { CategoryFormPage } from './pages/admin/CategoryForm';
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
import { PayOnlinePage } from './pages/client/PayOnlinePage';
import { QrPage } from './pages/client/QrPage';
import { NotFound } from './pages/NotFound';

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
      { path: 'pay', element: <PayOnlinePage /> },
      { path: 'qr', element: <QrPage /> },
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
      { path: 'categories/new', element: <CategoryFormPage /> },
      { path: 'categories/:id', element: <CategoryFormPage /> },
      { path: 'campaigns', element: <Campaigns /> },
      { path: 'campaigns/new', element: <CampaignFormPage /> },
      { path: 'campaigns/:id', element: <CampaignFormPage /> },
      { path: 'users', element: <Cashiers /> },
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
  // Página de prueba de humo del Brick, solo en desarrollo (T3.5a).
  ...(import.meta.env.DEV ? [{ path: '/dev/mercadopago', element: <MercadoPagoDev /> }] : []),
  // Cualquier ruta desconocida: cada rol ve su 404 con enlace a su inicio (T2.10).
  { path: '*', element: <NotFound /> },
];
