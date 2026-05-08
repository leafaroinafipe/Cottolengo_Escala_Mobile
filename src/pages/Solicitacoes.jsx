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
    if (!nurseId) { setLoading(false); return; }
    const q = query(
      collection(db, 'solicitacoes'),
      where('nurseId', '==', nurseId),
      orderBy('createdAt', 'desc'),
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
                    {(r.createdAt ?? r.criadaEm)?.toDate?.()?.toLocaleDateString('pt-BR') ?? '—'}
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

/* ── Helpers de data (sem timezone shift) ── */
function nextDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
function datesBetween(start, end) {
  const out = [];
  let cur = start;
  while (cur <= end) { out.push(cur); cur = nextDay(cur); }
  return out;
}
function fmtDate(str) {
  if (!str) return str;
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function NovaModal({ nurseId, nurseName, nurses, tipo, setTipo, onClose }) {
  const [form,         setForm]         = useState({});
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [blockedDates, setBlockedDates] = useState({}); // { 'YYYY-MM-DD': 'Nome da colega' }
  const [loadingBlock, setLoadingBlock] = useState(true);

  /* Carrega todas as solicitações pendentes para detectar conflitos */
  useEffect(() => {
    getDocs(query(collection(db, 'solicitacoes'), where('status', '==', 'pendente')))
      .then(snap => {
        const blocked = {};
        snap.docs.forEach(d => {
          const r = d.data();
          const label = r.nurseId === nurseId
            ? 'você mesma'
            : (r.nomeFuncionaria ?? 'uma colega');

          const mark = (dateStr) => {
            if (dateStr && !blocked[dateStr]) blocked[dateStr] = label;
          };

          if (r.tipo === 'folga') {
            mark(r.dataFolga);
          } else if (r.tipo === 'swap') {
            mark(r.dataOrigem);
            mark(r.dataTroca);
          } else if (r.tipo === 'ferias' && r.dataInicio && r.dataFim) {
            datesBetween(r.dataInicio, r.dataFim).forEach(mark);
          }
        });
        setBlockedDates(blocked);
      })
      .catch(() => {}) // falha silenciosa — não bloqueia o formulário
      .finally(() => setLoadingBlock(false));
  }, [nurseId]);

  function conflictFor(dateStr) {
    return dateStr ? blockedDates[dateStr] ?? null : null;
  }

  function getDatesFromForm() {
    if (tipo === 'folga')  return form.dataFolga ? [form.dataFolga] : [];
    if (tipo === 'swap')   return [form.dataOrigem, form.dataTroca].filter(Boolean);
    if (tipo === 'ferias' && form.dataInicio && form.dataFim)
      return datesBetween(form.dataInicio, form.dataFim);
    return [];
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');

    /* Verifica conflito antes de enviar */
    const datesToCheck = getDatesFromForm();
    for (const d of datesToCheck) {
      const who = blockedDates[d];
      if (who) {
        setError(
          who === 'você mesma'
            ? `Você já tem uma solicitação pendente para ${fmtDate(d)}. Aguarde a resolução antes de criar outra.`
            : `O dia ${fmtDate(d)} já está reservado por ${who}. Aguarde a aprovação ou rejeição do pedido dela.`
        );
        return;
      }
    }

    setSaving(true);
    try {
      const base = {
        nurseId,
        nomeFuncionaria: nurseName,
        tipo,
        status: 'pendente',
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'solicitacoes'), { ...base, ...form });
      onClose();
    } catch (err) {
      setError('Erro ao enviar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const f = (k, v) => { setForm(prev => ({ ...prev, [k]: v })); setError(''); };

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
                {conflictFor(form.dataOrigem) && (
                  <p className="field-warning">
                    ⚠ Este dia já tem solicitação de {conflictFor(form.dataOrigem)}
                  </p>
                )}
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
                {conflictFor(form.dataTroca) && (
                  <p className="field-warning">
                    ⚠ Este dia já tem solicitação de {conflictFor(form.dataTroca)}
                  </p>
                )}
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
                {conflictFor(form.dataFolga) && (
                  <p className="field-warning">
                    ⚠ Este dia já tem solicitação de {conflictFor(form.dataFolga)}
                  </p>
                )}
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
                {conflictFor(form.dataInicio) && (
                  <p className="field-warning">
                    ⚠ Este dia já tem solicitação de {conflictFor(form.dataInicio)}
                  </p>
                )}
              </div>
              <div className="form-field">
                <label>Data de fim</label>
                <input type="date" required onChange={e => f('dataFim', e.target.value)} />
                {conflictFor(form.dataFim) && (
                  <p className="field-warning">
                    ⚠ Este dia já tem solicitação de {conflictFor(form.dataFim)}
                  </p>
                )}
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
