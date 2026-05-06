import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Perfil.css';

export default function Perfil() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const initials = profile?.name
    ? profile.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'U';

  return (
    <div className="perfil-page fade-in">
      <div className="perfil-header">
        <div className="perfil-avatar">{initials}</div>
        <h2 className="perfil-name">{profile?.name ?? 'Funcionária'}</h2>
        <p className="perfil-email">{user?.email}</p>
        {profile?.role && (
          <span className="badge badge-info" style={{ marginTop: 8 }}>
            {profile.role === 'coordinator' ? 'Coordenadora' : 'Enfermeira'}
          </span>
        )}
      </div>

      <div className="perfil-section card">
        <h4 style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Conta
        </h4>
        <div className="perfil-row">
          <span>E-mail</span>
          <span className="perfil-value">{user?.email}</span>
        </div>
        {profile?.nurseId && (
          <div className="perfil-row">
            <span>ID de funcionária</span>
            <span className="perfil-value">{profile.nurseId}</span>
          </div>
        )}
      </div>

      <button className="btn btn-danger btn-full logout-btn" onClick={handleLogout}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sair da conta
      </button>
    </div>
  );
}
