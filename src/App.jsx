import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import AppShell from './components/AppShell';
import Login from './pages/Login';
import Home from './pages/Home';
import MinhaEscala from './pages/MinhaEscala';
import Solicitacoes from './pages/Solicitacoes';
import Perfil from './pages/Perfil';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
            <Route index              element={<Home />} />
            <Route path="escala"      element={<MinhaEscala />} />
            <Route path="solicitacoes" element={<Solicitacoes />} />
            <Route path="perfil"      element={<Perfil />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
