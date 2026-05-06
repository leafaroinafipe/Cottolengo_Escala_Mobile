import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import './Login.css';

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

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  /* ── login state ── */
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  /* ── reset state ── */
  const [resetMode,    setResetMode]    = useState(false);
  const [resetEmail,   setResetEmail]   = useState('');
  const [resetSent,    setResetSent]    = useState(false);
  const [resetError,   setResetError]   = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(AUTH_ERRORS[err.code] || `Erro: ${err.code}`);
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <div className="login-page">
      <div className="login-glow" aria-hidden="true" />

      <div className="login-content slide-up">
        <div className="login-header">
          <div className="login-icon">C</div>
          <h1 className="login-title">Cottolengo</h1>
          <p className="login-subtitle">Escala de Trabalho</p>
        </div>

        {/* ── Formulário de login ── */}
        {!resetMode && (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-field">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
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

        {/* ── Formulário de reset de senha ── */}
        {resetMode && (
          <div className="login-form">
            {resetSent ? (
              <div className="reset-success">
                <div className="reset-success-icon">✉️</div>
                <p className="reset-success-title">E-mail enviado!</p>
                <p className="reset-success-desc">
                  Verifique a caixa de entrada de <strong>{resetEmail}</strong> e siga as instruções para redefinir sua senha.
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

                <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                    {resetLoading ? <><span className="spinner" />Enviando...</> : 'Enviar link de redefinição'}
                  </button>
                </form>

                <button type="button" className="btn btn-ghost btn-full" onClick={goBackToLogin}>
                  ← Voltar ao login
                </button>
              </>
            )}
          </div>
        )}

        <p className="login-footer">Cottolengo · {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
