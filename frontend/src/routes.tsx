import type { RouteObject } from 'react-router-dom';
import { RequireRole } from './components/RequireRole';
import { Home } from './pages/Home';
import { AdminHome } from './pages/admin/AdminHome';
import { Campaigns } from './pages/admin/Campaigns';
import { Categories } from './pages/admin/Categories';
import { Products } from './pages/admin/Products';
import { Login } from './pages/auth/Login';
import { CashierHome } from './pages/cashier/CashierHome';
import { DevScanner } from './pages/dev/DevScanner';

// Temporal de la T1.13: /dev/scanner existe solo en desarrollo; se elimina en la T1.14.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: '/dev/scanner', element: <DevScanner /> }]
  : [];

export const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/login', element: <Login /> },
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
  ...devRoutes,
];
