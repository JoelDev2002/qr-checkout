import { useEffect } from 'react';
import { useNavigate, useRoutes } from 'react-router-dom';
import { routes } from './routes';
import { setUnauthorizedHandler } from './services/api';

export function App() {
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => navigate('/login', { replace: true }));
  }, [navigate]);

  return useRoutes(routes);
}