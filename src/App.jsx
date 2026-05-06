import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import AppShell from './components/AppShell';

/* Login não é lazy (primeira tela visível) */
import Login from './pages/Login';

/* Code splitting por rota */
const Home              = lazy(() => import('./pages/Home'));
const MinhaEscala       = lazy(() => import('./pages/MinhaEscala'));
const Solicitacoes      = lazy(() => import('./pages/Solicitacoes'));
const Perfil            = lazy(() => import('./pages/Perfil'));
const NurseDashboard    = lazy(() => import('./pages/NurseDashboard'));
const CoordHome         = lazy(() => import('./pages/coord/CoordHome'));
const CoordEscala       = lazy(() => import('./pages/coord/CoordEscala'));
const CoordSolicitacoes = lazy(() => import('./pages/coord/CoordSolicitacoes'));
const CoordAdmin        = lazy(() => import('./pages/coord/CoordAdmin'));

function RoleRoute({ coord, nurse }) {
  const { isCoordinator } = useAuth();
  return isCoordinator ? coord : nurse;
}

function PageFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
      <span className="spinner spinner-lg" />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <AppShell />
                </PrivateRoute>
              }
            >
              <Route index element={<RoleRoute coord={<CoordHome />} nurse={<Home />} />} />
              <Route path="escala" element={<RoleRoute coord={<CoordEscala />} nurse={<MinhaEscala />} />} />
              <Route path="solicitacoes" element={<RoleRoute coord={<CoordSolicitacoes />} nurse={<Solicitacoes />} />} />
              <Route path="perfil"    element={<Perfil />} />
              <Route path="equipe"    element={<CoordAdmin />} />
              <Route path="dashboard" element={<NurseDashboard />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
