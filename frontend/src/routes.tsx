import type { RouteObject } from 'react-router-dom';
import { RequireRole } from './components/RequireRole';
import { Home } from './pages/Home';
import { AdminHome } from './pages/admin/AdminHome';
import { Login } from './pages/auth/Login';
import { CashierHome } from './pages/cashier/CashierHome';

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
    path: '/cashier',
    element: (
      <RequireRole roles={['CASHIER']}>
        <CashierHome />
      </RequireRole>
    ),
  },
];