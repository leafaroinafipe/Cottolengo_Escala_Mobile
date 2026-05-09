import { useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import { useAuth } from '../contexts/AuthContext';
import './AppShell.css';

const NURSE_ROUTES = ['/escala', '/solicitacoes', '/dashboard'];
const COORD_ROUTES = ['/', '/escala', '/solicitacoes', '/equipe'];

export default function AppShell() {
  const { isCoordinator } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const startX   = useRef(null);
  const startY   = useRef(null);

  const routes = isCoordinator ? COORD_ROUTES : NURSE_ROUTES;

  function onTouchStart(e) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e) {
    if (startX.current === null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    const dy = e.changedTouches[0].clientY - startY.current;
    startX.current = null;
    startY.current = null;

    /* Ignora se for scroll vertical ou distância insuficiente */
    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 50) return;

    const idx = routes.findIndex(r =>
      r === '/' ? location.pathname === '/' : location.pathname.startsWith(r)
    );
    if (idx === -1) return;

    if (dx < 0 && idx < routes.length - 1) navigate(routes[idx + 1]);
    else if (dx > 0 && idx > 0)             navigate(routes[idx - 1]);
  }

  return (
    <div className="app-shell">
      <main className="app-main" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
