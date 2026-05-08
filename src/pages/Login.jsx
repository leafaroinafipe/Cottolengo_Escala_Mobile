import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import useInstallPrompt from '../hooks/useInstallPrompt';
import './Login.css';

/* ── WebAuthn helpers ── */
function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
}

async function registerBiometric(uid, email) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Cottolengo Escala', id: window.location.hostname },
      user: {
        id: new TextEncoder().encode(uid),
        name: email,
        displayName: email.split('@')[0],
      },
      pubKeyCredParams: [
        { alg: -7,   type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
        residentKey: 'preferred',
      },
      timeout: 60000,
    },
  });
  localStorage.setItem('bio_cred_id', bufToB64(cred.rawId));
  localStorage.setItem('bio_uid',     uid);
}

async function verifyBiometric() {
  const credId = localStorage.getItem('bio_cred_id');
  if (!credId) return false;
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge:        crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: b64ToBuf(credId), type: 'public-key' }],
      userVerification: 'preferred',
      timeout:          60000,
    },
  });
  return !!assertion;
}

const webAuthnSupported = () =>
  typeof window !== 'undefined' &&
  !!window.PublicKeyCredential &&
  !!navigator.credentials?.create;

/* ── Error map ── */
const AUTH_ERRORS = {
  'auth/user-not-found':         'E-mail não encontrado.',
  'auth/wrong-password':         'Senha incorreta.',
  'auth/invalid-credential':     'Credenciais inválidas.',
  'auth/invalid-email':          'E-mail inválido.',
  'auth/too-many-requests':      'Muitas tentativas. Aguarde.',
  'auth/unauthorized-domain':    'Domínio não autorizado no Firebase.',
  'auth/invalid-api-key':        'Chave de API inválida.',
  'auth/network-request-failed': 'Sem conexão. Verifique sua internet.',
};

/* ── Mascote ── */
function Mascot({ state }) {
  return (
    <div className={`mascot mascot--${state}`} aria-hidden="true">
      <div className="mascot-head">
        <div className="mascot-eye mascot-eye--left">
          <div className="mascot-pupil" />
        </div>
        <div className="mascot-eye mascot-eye--right">
          <div className="mascot-pupil" />
        </div>
      </div>
      <div className="mascot-paw mascot-paw--left" />
      <div className="mascot-paw mascot-paw--right" />
    </div>
  );
}

export default function Login() {
  const { login, user } = useAuth();
  const navigate        = useNavigate();
  const { canInstall, isIos, triggerInstall, dismiss } = useInstallPrompt();

  /* ── Login state ── */
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  /* ── Reset state ── */
  const [resetMode,    setResetMode]    = useState(false);
  const [resetEmail,   setResetEmail]   = useState('');
  const [resetSent,    setResetSent]    = useState(false);
  const [resetError,   setResetError]   = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  /* ── Mascot state: idle | watching | covering | peeking ── */
  const [mascotState, setMascotState] = useState('idle');

  /* ── Biometric ── */
  const [bioAvailable,  setBioAvailable]  = useState(false);
  const [bioLoading,    setBioLoading]    = useState(false);
  const [bioOffer,      setBioOffer]      = useState(false); // modal "ativar digital?"
  const pendingUserRef = useRef(null);

  /* Verifica se biometria está registrada para o usuário atual */
  useEffect(() => {
    const credId   = localStorage.getItem('bio_cred_id');
    const bioUid   = localStorage.getItem('bio_uid');
    if (credId && bioUid && webAuthnSupported() && user?.uid === bioUid) {
      setBioAvailable(true);
    }
  }, [user]);

  /* ── Login com email/senha ── */
  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const cred = await login(email, password);
      /* Oferecer cadastro de biometria após primeiro login sem bio */
      const uid = cred?.user?.uid ?? cred?.uid;
      if (webAuthnSupported() && uid && !localStorage.getItem('bio_cred_id')) {
        pendingUserRef.current = { uid, email };
        setBioOffer(true);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(AUTH_ERRORS[err.code] || `Erro: ${err.code}`);
    } finally {
      setLoading(false);
    }
  }

  /* ── Login com biometria ── */
  async function handleBioLogin() {
    setBioLoading(true);
    setError('');
    try {
      const ok = await verifyBiometric();
      if (ok) navigate('/');
      else setError('Verificação biométrica falhou. Use seu e-mail e senha.');
    } catch {
      setError('Biometria cancelada ou não disponível. Use e-mail e senha.');
    } finally {
      setBioLoading(false);
    }
  }

  /* ── Cadastrar biometria depois do login ── */
  async function handleBioRegister() {
    const { uid, email: em } = pendingUserRef.current ?? {};
    if (!uid) { navigate('/'); return; }
    try {
      await registerBiometric(uid, em);
    } catch {
      /* silencioso — biometria é opcional */
    }
    navigate('/');
  }

  /* ── Reset ── */
  async function handleReset(e) {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSent(true);
    } catch (err) {
      setResetError(AUTH_ERRORS[err.code] || `Erro: ${err.code}`);
    } finally {
      setResetLoading(false);
    }
  }

  function goBackToLogin() {
    setResetMode(false);
    setResetSent(false);
    setResetEmail('');
    setResetError('');
  }

  /* ── Mascot input handlers ── */
  const onEmailFocus    = () => setMascotState('watching');
  const onEmailBlur     = () => setMascotState('idle');
  const onPasswordFocus = () => setMascotState(showPass ? 'peeking' : 'covering');
  const onPasswordBlur  = () => setMascotState('idle');

  useEffect(() => {
    if (mascotState === 'covering' || mascotState === 'peeking') {
      setMascotState(showPass ? 'peeking' : 'covering');
    }
  }, [showPass]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="login-page">
      <div className="login-glow" aria-hidden="true" />

      {/* ── Banner de instalação ── */}
      {canInstall && (
        <div className="install-banner">
          <div className="install-banner-icon">📲</div>
          <div className="install-banner-text">
            <strong>Instalar app</strong>
            {isIos
              ? <span>Toque em <b>Compartilhar</b> → <b>Adicionar à tela de início</b></span>
              : <span>Acesse mais rápido como aplicativo</span>
            }
          </div>
          {!isIos && (
            <button className="install-banner-btn" onClick={triggerInstall}>Instalar</button>
          )}
          <button className="install-banner-close" onClick={dismiss} aria-label="Fechar">×</button>
        </div>
      )}

      <div className="login-content slide-up">
        {/* ── Mascote ── */}
        <Mascot state={mascotState} />

        <div className="login-header">
          <div className="login-icon">C</div>
          <h1 className="login-title">Cottolengo</h1>
          <p className="login-subtitle">Escala de Trabalho</p>
        </div>

        {/* ── Modal biometria disponível ── */}
        {bioAvailable && !resetMode && (
          <div className="bio-gate">
            <button
              className="bio-btn"
              onClick={handleBioLogin}
              disabled={bioLoading}
            >
              {bioLoading ? (
                <span className="spinner" />
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 10a2 2 0 0 0-2 2v2a2 2 0 0 0 4 0v-2a2 2 0 0 0-2-2z"/>
                  <path d="M12 4C8.13 4 5 7.13 5 11v1"/>
                  <path d="M5.5 14.5a7 7 0 0 0 13 0"/>
                  <path d="M12 4v2"/>
                  <path d="M8 6.5A7.97 7.97 0 0 0 4.2 11"/>
                  <path d="M16 6.5a7.97 7.97 0 0 1 3.8 4.5"/>
                  <path d="M9 11v3"/>
                  <path d="M12 11v4"/>
                  <path d="M15 11v3"/>
                </svg>
              )}
            </button>
            <p className="bio-label">Entrar com digital</p>
            <button
              className="bio-skip"
              onClick={() => setBioAvailable(false)}
            >
              Usar e-mail e senha
            </button>
          </div>
        )}

        {/* ── Formulário de login (oculto se bio disponível) ── */}
        {!bioAvailable && !resetMode && (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-field">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={onEmailFocus}
                onBlur={onEmailBlur}
                placeholder="seu@email.com"
                required
                autoComplete="email"
                inputMode="email"
              />
            </div>

            <div className="form-field">
              <div className="label-row">
                <label htmlFor="password">Senha</label>
                <button
                  type="button"
                  className="forgot-link"
                  onClick={() => { setResetMode(true); setResetEmail(email); setError(''); }}
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="password-wrapper">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={onPasswordFocus}
                  onBlur={onPasswordBlur}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPass(v => !v)}
                  aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {error && (
              <div className="alert alert-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? <><span className="spinner" />Entrando...</> : 'Entrar'}
            </button>
          </form>
        )}

        {/* ── Formulário de reset ── */}
        {resetMode && (
          <div className="login-form">
            {resetSent ? (
              <div className="reset-success">
                <div className="reset-success-icon">✉️</div>
                <p className="reset-success-title">E-mail enviado!</p>
                <p className="reset-success-desc">
                  Verifique a caixa de entrada de <strong>{resetEmail}</strong> e siga as instruções.
                </p>
                <button className="btn btn-primary btn-full" onClick={goBackToLogin}>
                  Voltar ao login
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 4 }}>
                  <p style={{ fontWeight: 600, fontSize: 15 }}>Redefinir senha</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                    Enviaremos um link de redefinição para seu e-mail.
                  </p>
                </div>
                <form onSubmit={handleReset} style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <div className="form-field">
                    <label htmlFor="reset-email">E-mail</label>
                    <input
                      id="reset-email"
                      type="email"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      placeholder="seu@email.com"
                      required
                      autoComplete="email"
                      inputMode="email"
                    />
                  </div>
                  {resetError && (
                    <div className="alert alert-error" role="alert">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      {resetError}
                    </div>
                  )}
                  <button type="submit" className="btn btn-primary btn-full" disabled={resetLoading}>
                    {resetLoading ? <><span className="spinner" />Enviando...</> : 'Enviar link'}
                  </button>
                </form>
                <button type="button" className="btn btn-ghost btn-full" onClick={goBackToLogin}>
                  ← Voltar
                </button>
              </>
            )}
          </div>
        )}

        <p className="login-footer">Cottolengo · {new Date().getFullYear()}</p>
      </div>

      {/* ── Modal: ativar biometria após login ── */}
      {bioOffer && (
        <div className="modal-backdrop">
          <div className="modal slide-up bio-offer-modal">
            <div className="bio-offer-icon">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 10a2 2 0 0 0-2 2v2a2 2 0 0 0 4 0v-2a2 2 0 0 0-2-2z"/>
                <path d="M12 4C8.13 4 5 7.13 5 11v1"/>
                <path d="M5.5 14.5a7 7 0 0 0 13 0"/>
                <path d="M9 11v3"/><path d="M12 11v4"/><path d="M15 11v3"/>
              </svg>
            </div>
            <h3 className="bio-offer-title">Ativar login com digital?</h3>
            <p className="bio-offer-desc">
              Nas próximas entradas, você poderá usar sua impressão digital ou Face ID para acessar o app sem digitar senha.
            </p>
            <button className="btn btn-primary btn-full" onClick={handleBioRegister}>
              Ativar
            </button>
            <button className="btn btn-ghost btn-full" onClick={() => { setBioOffer(false); navigate('/'); }}>
              Agora não
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
