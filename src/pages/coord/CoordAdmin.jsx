import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from '../../firebase';
import './CoordAdmin.css';

/* URL do app Local (painel admin) onde a conta Firebase Auth da funcionária
 * é efetivamente criada. Configurável via .env (VITE_LOCAL_APP_URL). Quando
 * indefinida, o atalho "Abrir app Local" fica oculto. */
const LOCAL_APP_URL = import.meta.env.VITE_LOCAL_APP_URL ?? '';

export default function CoordAdmin() {
  const [nurses,  setNurses]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form,    setForm]    = useState({});
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [toast,   setToast]   = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'funcionarios'), snap => {
      setNurses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  function openEdit(nurse) {
    setEditing(nurse);
    setForm({
      name:       nurse.name       ?? '',
      initials:   nurse.initials   ?? '',
      email:      nurse.email      ?? '',
      nightQuota: nurse.nightQuota ?? 5,
    });
    setError('');
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await updateDoc(doc(db, 'funcionarios', editing.id), {
        name:        form.name,
        initials:    form.initials.toUpperCase(),
        email:       form.email,
        nightQuota:  Number(form.nightQuota),
        atualizadaEm: serverTimestamp(),
      });
      /* Reflete localmente para que checagens pós-save (ex: reset) usem
       * o valor salvo sem esperar o snapshot voltar do Firestore. */
      setEditing(prev => prev ? { ...prev, ...form, initials: form.initials.toUpperCase() } : prev);
      showToast('Dados salvos com sucesso!', 'success');
    } catch (err) {
      console.error('[CoordAdmin] updateDoc falhou:', err);
      setError(`Erro ao salvar: ${err?.code ?? err?.message ?? 'desconhecido'}`);
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordReset() {
    const email = form.email?.trim();
    if (!email) {
      return showToast('Cadastre um e-mail primeiro.', 'danger');
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return showToast('Formato de e-mail inválido.', 'danger');
    }
    /* Pré-condição arquitetural: a conta Firebase Auth da funcionária só
     * é criada pelo app Local (Equipe.jsx#handleCreateLogin). Sem hasLogin
     * marcado, o sendPasswordResetEmail "vai" mas o Firebase descarta em
     * silêncio (ainda mais com Email Enumeration Protection ligada). */
    if (!editing?.hasLogin) {
      return showToast(
        'Esta funcionária ainda não tem conta de login. Crie no app Local antes de enviar reset.',
        'danger'
      );
    }
    /* Evita enviar reset para um e-mail digitado mas não persistido. */
    if (email !== editing.email) {
      return showToast(
        'Salve o novo e-mail antes de enviar o reset.',
        'danger'
      );
    }
    try {
      await sendPasswordResetEmail(auth, email);
      showToast(`Reset enviado para ${email}. Verifique também o spam.`, 'success');
    } catch (err) {
      console.error('[CoordAdmin] sendPasswordResetEmail falhou:', err);
      const msgs = {
        'auth/user-not-found':         'E-mail não tem conta Auth. Crie o login no app Local.',
        'auth/invalid-email':          'E-mail inválido.',
        'auth/too-many-requests':      'Muitas tentativas. Aguarde alguns minutos.',
        'auth/network-request-failed': 'Sem conexão. Tente novamente.',
        'auth/missing-email':          'E-mail vazio.',
        'auth/operation-not-allowed':  'Provedor Email/Password desabilitado no Firebase.',
      };
      showToast(msgs[err.code] ?? `Erro: ${err.code ?? err.message}`, 'danger');
    }
  }

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="admin-page fade-in">
      <div className="admin-header">
        <h2>Equipe</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
          {nurses.length} funcionárias cadastradas
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : (
        <div className="nurses-list">
          {nurses.map(n => (
            <div key={n.id} className="nurse-item card">
              <span className="nurse-initials">{n.initials}</span>
              <div className="nurse-item-info">
                <p className="nurse-item-name">{n.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{n.email || 'Sem e-mail'}</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(n)}>Editar</button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal slide-up">
            <div className="modal-handle" />
            <h3 style={{ marginBottom: 16 }}>Editar funcionária</h3>
            <form onSubmit={handleSave} className="modal-form">
              <div className="form-field">
                <label>Nome completo</label>
                <input required value={form.name} onChange={e => f('name', e.target.value)} />
              </div>
              <div className="form-field">
                <label>Iniciais</label>
                <input required maxLength={3} value={form.initials} onChange={e => f('initials', e.target.value.toUpperCase())} />
              </div>
              <div className="form-field">
                <label>E-mail (para login)</label>
                <input type="email" value={form.email} onChange={e => f('email', e.target.value)} />
              </div>
              <div className="form-field">
                <label>Cota noturna / mês</label>
                <input type="number" min={0} max={20} value={form.nightQuota} onChange={e => f('nightQuota', e.target.value)} />
              </div>

              {error && <div className="alert alert-error">{error}</div>}

              {/* Aviso quando a funcionária ainda não tem conta Firebase Auth.
                  Sem hasLogin=true o reset de senha falha em silêncio. A criação
                  da conta acontece no app Local (Equipe.jsx#handleCreateLogin). */}
              {!editing.hasLogin && (
                <div className="alert alert-warn" role="status" style={{ fontSize: 13, lineHeight: 1.4 }}>
                  <strong>Sem conta de login.</strong> Crie a conta no app Local
                  antes de tentar enviar reset. {LOCAL_APP_URL && (
                    <>O atalho abaixo abre o painel admin em uma nova aba.</>
                  )}
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
                {saving ? <><span className="spinner" /> Salvando...</> : 'Salvar alterações'}
              </button>

              {/* Atalho para o app Local quando há lacuna de login. Se a env var
                  não estiver definida, o botão é omitido (degradação silenciosa). */}
              {!editing.hasLogin && LOCAL_APP_URL && (
                <a
                  href={LOCAL_APP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-full"
                  style={{ marginTop: 8 }}
                >
                  Abrir app Local para criar login
                </a>
              )}

              <button
                type="button"
                className="btn btn-ghost btn-full"
                style={{ marginTop: 8 }}
                onClick={handlePasswordReset}
                disabled={!editing.hasLogin}
                title={!editing.hasLogin ? 'Crie a conta no app Local primeiro' : undefined}
              >
                Enviar reset de senha
              </button>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast-bar ${toast.type === 'success' ? 'toast-success' : 'toast-danger'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
