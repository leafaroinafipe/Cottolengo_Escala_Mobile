import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from '../../firebase';
import './CoordAdmin.css';

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
      setEditing(null);
      showToast('Dados salvos com sucesso!', 'success');
    } catch {
      setError('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordReset() {
    if (!form.email) return showToast('Cadastre um e-mail primeiro.', 'danger');
    try {
      await sendPasswordResetEmail(auth, form.email);
      showToast(`Reset enviado para ${form.email}`, 'success');
    } catch {
      showToast('Erro ao enviar reset de senha.', 'danger');
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

              <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
                {saving ? <><span className="spinner" /> Salvando...</> : 'Salvar alterações'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-full"
                style={{ marginTop: 8 }}
                onClick={handlePasswordReset}
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
