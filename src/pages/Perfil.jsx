import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { requestNotificationPermission, onForegroundMessage } from '../utils/notifications';
import './Perfil.css';

export default function Perfil() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [notifStatus, setNotifStatus] = useState('unknown'); // unknown | granted | denied | loading
  const [notifToast, setNotifToast]   = useState(null);
  const nurseId = profile?.nurseId ?? user?.uid;

  /* Captura o evento beforeinstallprompt para exibir botão de instalação */
  useEffect(() => {
    // Detecta se já está instalado (modo standalone)
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsInstalled(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Detecta instalação concluída
    const installed = () => { setIsInstalled(true); setInstallPrompt(null); };
    window.addEventListener('appinstalled', installed);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  /* Detecta status de permissão de notificação */
  useEffect(() => {
    if ('Notification' in window) {
      setNotifStatus(Notification.permission); // 'default', 'granted', 'denied'
    } else {
      setNotifStatus('denied');
    }
  }, []);

  /* Listener para mensagens em foreground */
  useEffect(() => {
    if (notifStatus !== 'granted') return;
    let unsub;
    onForegroundMessage(({ title, body }) => {
      setNotifToast({ title, body });
      setTimeout(() => setNotifToast(null), 5000);
    }).then(fn => { unsub = fn; });
    return () => { if (unsub) unsub(); };
  }, [notifStatus]);

  async function handleEnableNotifs() {
    if (!nurseId) return;
    setNotifStatus('loading');
    const token = await requestNotificationPermission(nurseId);
    setNotifStatus(token ? 'granted' : 'denied');
  }

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setInstallPrompt(null);
    }
  }

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

      {/* Botão de instalar app */}
      {!isInstalled && installPrompt && (
        <button className="btn btn-full perfil-install-btn" onClick={handleInstall}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Instalar app no celular
        </button>
      )}
      {isInstalled && (
        <div className="perfil-installed-badge">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          App instalado
        </div>
      )}

      {/* Botão de ativar notificações */}
      {notifStatus === 'granted' ? (
        <div className="perfil-installed-badge">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          Notificações ativadas
        </div>
      ) : notifStatus === 'denied' ? (
        <div className="perfil-notif-denied">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          </svg>
          Notificações bloqueadas pelo navegador
        </div>
      ) : (
        <button
          className="btn btn-full perfil-notif-btn"
          onClick={handleEnableNotifs}
          disabled={notifStatus === 'loading'}
        >
          {notifStatus === 'loading' ? (
            <><span className="spinner" />Ativando...</>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              Ativar notificações
            </>
          )}
        </button>
      )}

      <button className="btn btn-danger btn-full logout-btn" onClick={handleLogout}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sair da conta
      </button>

      {/* Toast de notificação foreground */}
      {notifToast && (
        <div className="toast-bar toast-success" style={{ position:'fixed', bottom:80, left:16, right:16, zIndex:9999 }}>
          <strong>{notifToast.title}</strong>
          <br />{notifToast.body}
        </div>
      )}
    </div>
  );
}
