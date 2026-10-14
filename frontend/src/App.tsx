import { useEffect } from 'react';
import { useNavigate, useRoutes } from 'react-router-dom';
import { Toaster } from 'sileo';
import { routes } from './routes';
import { setUnauthorizedHandler } from './services/api';

export function App() {
  const navigate = useNavigate();
  const element = useRoutes(routes);

  useEffect(() => {
    setUnauthorizedHandler(() => navigate('/login', { replace: true }));
  }, [navigate]);

  return (
    <>
      <Toaster position="top-right" />
      {element}
    </>
  );
}