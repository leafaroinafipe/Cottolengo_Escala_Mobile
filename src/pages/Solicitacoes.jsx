import { useEffect, useState } from 'react';
import {
  collection, addDoc, serverTimestamp, onSnapshot,
  query, where, orderBy, getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { SHIFTS } from '../constants/shifts';
import './Solicitacoes.css';

const TIPO_LABELS = { swap: 'Troca de turno', folga: 'Folga', ferias: 'Férias' };
const STATUS_BADGE = { pendente: 'badge-pending', aprovada: 'badge-approved', rejeitada: 'badge-rejected' };

export default function Solicitacoes() {
  const { user, profile } = useAuth();
  const [requests,  setRequests]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [tipo,      setTipo]      = useState('swap');
  const [nurses,    setNurses]    = useState([]);

  const nurseId = profile?.nurseId ?? user?.uid;

  /* Carrega solicitações da enfermeira logada em tempo real */
  useEffect(() => {
    if (!nurseId) return;
    const q = query(
      collection(db, 'solicitacoes'),
      where('nurseId', '==', nurseId),
      orderBy('criadaEm', 'desc'),
    );
    const unsub = onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [nurseId]);

  /* Carrega colegas para seleção de troca */
  useEffect(() => {
    getDocs(collection(db, 'funcionarios')).then(snap => {
      setNurses(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(n => n.id !== nurseId));
    });
  }, [nurseId]);

  return (
    <div className="sol-page fade-in">
      <div className="sol-header">
        <h2>Solicitações</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Nova</button>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : requests.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: 32 }}>📋</p>
          <p>Nenhuma solicitação ainda.</p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>Fazer pedido</button>
        </div>
      ) : (
        <div className="sol-list">
          {requests.map(r => (
            <div key={r.id} className="sol-card card slide-up">
              <div className="sol-card-top">
                <div>
                  <p className="sol-tipo">{TIPO_LABELS[r.tipo] ?? r.tipo}</p>
                  <p className="text-secondary" style={{ fontSize: 12 }}>
                    {r.criadaEm?.toDate?.()?.toLocaleDateString('pt-BR') ?? '—'}
                  </p>
                </div>
                <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
              </div>
              {r.tipo === 'swap' && (
                <p className="sol-detail">
                  {r.dataOrigem} ({r.turnoOrigem}) → {r.nomeTroca} em {r.dataTroca} ({r.turnoTroca})
                </p>
              )}
              {r.tipo === 'folga' && (
                <p className="sol-detail">Data: {r.dataFolga}{r.motivo ? ` · ${r.motivo}` : ''}</p>
              )}
              {r.tipo === 'ferias' && (
                <p className="sol-detail">{r.dataInicio} até {r.dataFim}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <NovaModal
          nurseId={nurseId}
          nurseName={profile?.name ?? 'Funcionária'}
          nurses={nurses}
          tipo={tipo}
          setTipo={setTipo}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function NovaModal({ nurseId, nurseName, nurses, tipo, setTipo, onClose }) {
  const [form,   setForm]   = useState({});
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const base = {
        nurseId,
        nomeFuncionaria: nurseName,
        tipo,
        status: 'pendente',
        criadaEm: serverTimestamp(),
      };
      await addDoc(collection(db, 'solicitacoes'), { ...base, ...form });
      onClose();
    } catch (err) {
      setError('Erro ao enviar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up">
        <div className="modal-handle" />
        <h3 style={{ marginBottom: 16 }}>Nova solicitação</h3>

        <div className="tipo-selector">
          {Object.entries(TIPO_LABELS).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`tipo-btn${tipo === k ? ' active' : ''}`}
              onClick={() => { setTipo(k); setForm({}); }}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSave} className="modal-form">
          {tipo === 'swap' && (
            <>
              <div className="form-field">
                <label>Sua data</label>
                <input type="date" required onChange={e => f('dataOrigem', e.target.value)} />
              </div>
              <div className="form-field">
                <label>Seu turno</label>
                <select required onChange={e => f('turnoOrigem', e.target.value)}>
                  <option value="">Selecionar...</option>
                  {Object.entries(SHIFTS).filter(([k]) => k !== 'OFF').map(([k, s]) => (
                    <option key={k} value={k}>{k} — {s.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Trocar com</label>
                <select required onChange={e => {
                  const n = nurses.find(x => x.id === e.target.value);
                  f('nurseIdTroca', e.target.value);
                  f('nomeTroca', n?.name ?? '');
                }}>
                  <option value="">Selecionar colega...</option>
                  {nurses.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Data da colega</label>
                <input type="date" required onChange={e => f('dataTroca', e.target.value)} />
              </div>
              <div className="form-field">
                <label>Turno da colega</label>
                <select required onChange={e => f('turnoTroca', e.target.value)}>
                  <option value="">Selecionar...</option>
                  {Object.entries(SHIFTS).filter(([k]) => k !== 'OFF').map(([k, s]) => (
                    <option key={k} value={k}>{k} — {s.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {tipo === 'folga' && (
            <>
              <div className="form-field">
                <label>Data da folga</label>
                <input type="date" required onChange={e => f('dataFolga', e.target.value)} />
              </div>
              <div className="form-field">
                <label>Motivo (opcional)</label>
                <input type="text" placeholder="Ex: consulta médica" onChange={e => f('motivo', e.target.value)} />
              </div>
            </>
          )}

          {tipo === 'ferias' && (
            <>
              <div className="form-field">
                <label>Data de início</label>
                <input type="date" required onChange={e => f('dataInicio', e.target.value)} />
              </div>
              <div className="form-field">
                <label>Data de fim</label>
                <input type="date" required onChange={e => f('dataFim', e.target.value)} />
              </div>
            </>
          )}

          <div className="form-field">
            <label>Observação (opcional)</label>
            <textarea rows={2} onChange={e => f('observacao', e.target.value)} />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
            {saving ? <><span className="spinner" />Enviando...</> : 'Enviar pedido'}
          </button>
        </form>
      </div>
    </div>
  );
}
