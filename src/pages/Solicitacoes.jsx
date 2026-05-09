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
const TIPO_ICON   = { swap: '🔄', folga: '🏖️', ferias: '✈️' };
const STATUS_BADGE = { pendente: 'badge-pending', aprovada: 'badge-approved', rejeitada: 'badge-rejected' };

/* ── Helpers ── */
function parseDate(str) {
  if (!str) return null;
  if (str.includes('-')) {
    const [y, m, d] = str.split('-').map(Number);
    return isNaN(y) ? null : { year: y, month: m, day: d };
  }
  if (str.includes('/')) {
    const [d, m, y] = str.split('/').map(Number);
    return isNaN(y) ? null : { year: y, month: m, day: d };
  }
  return null;
}
function shortDate(str) {
  const p = parseDate(str);
  if (!p) return str ?? '';
  return `${String(p.day).padStart(2,'0')}/${String(p.month).padStart(2,'0')}`;
}
function fmtDateFull(str) {
  const p = parseDate(str);
  if (!p) return str ?? '—';
  return new Date(p.year, p.month - 1, p.day)
    .toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
    .replace('.', '');
}
function buildPreview(r) {
  if (r.tipo === 'swap') {
    const a = r.dataOrigem ? `${shortDate(r.dataOrigem)}${r.turnoOrigem ? ` (${r.turnoOrigem})` : ''}` : '';
    const b = r.dataTroca  ? `${shortDate(r.dataTroca)}${r.turnoTroca   ? ` (${r.turnoTroca})`  : ''}` : '';
    if (!a && !b) return null;
    return [a, b].filter(Boolean).join(' ↔ ');
  }
  if (r.tipo === 'folga')  return r.dataFolga  ? shortDate(r.dataFolga)  : null;
  if (r.tipo === 'ferias') {
    if (r.dataInicio && r.dataFim) return `${shortDate(r.dataInicio)} → ${shortDate(r.dataFim)}`;
    if (r.dataInicio) return `a partir de ${shortDate(r.dataInicio)}`;
  }
  return null;
}
function timeAgo(ts) {
  const date = ts?.toDate?.() ?? null;
  if (!date) return '—';
  const min = Math.floor((Date.now() - date.getTime()) / 60000);
  if (min < 1)  return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)    return `há ${d}d`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

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
          {requests.map(r => <NurseRequestCard key={r.id} r={r} />)}
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

/* ── Card da enfermeira ── */
function NurseRequestCard({ r }) {
  const statusBadge = STATUS_BADGE[r.status] ?? 'badge-pending';
  const ts = r.createdAt ?? r.criadaEm;

  let dateBlock = null;
  if (r.tipo === 'swap') {
    dateBlock = (
      <div className="sol-dates">
        <div className="sol-date-pair">
          <span className="sol-date-label">Minha data</span>
          <span className="sol-date-value">{fmtDateFull(r.dataOrigem)}</span>
          {r.turnoOrigem && <span className="sol-shift-tag">{r.turnoOrigem}</span>}
        </div>
        <span className="sol-date-arrow" aria-hidden>↔</span>
        <div className="sol-date-pair">
          <span className="sol-date-label">{r.nomeTroca ?? 'colega'}</span>
          <span className="sol-date-value">{fmtDateFull(r.dataTroca)}</span>
          {r.turnoTroca && <span className="sol-shift-tag">{r.turnoTroca}</span>}
        </div>
      </div>
    );
  } else if (r.tipo === 'folga') {
    dateBlock = (
      <div className="sol-dates">
        <div className="sol-date-pair">
          <span className="sol-date-label">Folga em</span>
          <span className="sol-date-value">{fmtDateFull(r.dataFolga)}</span>
        </div>
        {r.motivo && (
          <p className="sol-motivo"><span className="sol-motivo-label">Motivo</span> {r.motivo}</p>
        )}
      </div>
    );
  } else if (r.tipo === 'ferias') {
    dateBlock = (
      <div className="sol-dates">
        <div className="sol-date-pair">
          <span className="sol-date-label">Início</span>
          <span className="sol-date-value">{fmtDateFull(r.dataInicio)}</span>
        </div>
        <span className="sol-date-arrow" aria-hidden>→</span>
        <div className="sol-date-pair">
          <span className="sol-date-label">Fim</span>
          <span className="sol-date-value">{fmtDateFull(r.dataFim)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`nr-card nr-card--${r.tipo ?? 'swap'}`}>
      <div className="nr-card-top">
        <div className="nr-header-left">
          <span className="nr-type-icon" aria-hidden>{TIPO_ICON[r.tipo] ?? '📋'}</span>
          <span className="nr-type-label">{TIPO_LABELS[r.tipo] ?? r.tipo}</span>
        </div>
        <span className={`badge ${statusBadge}`}>{r.status}</span>
      </div>
      <div className="nr-body">
        {dateBlock}
        <div className="nr-meta">
          {ts && <span>📅 {fmtTsFull(ts)}</span>}
          {r.observacao && <span className="nr-obs">💬 {r.observacao}</span>}
        </div>
      </div>
    </div>
  );
}

function fmtTsFull(ts) {
  const d = ts?.toDate?.() ?? null;
  if (!d) return null;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' • ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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

    /* Verifica se a própria enfermeira já tem solicitação pendente para o mesmo dia */
    const datesToCheck = getDatesFromForm();
    for (const d of datesToCheck) {
      const who = blockedDates[d];
      if (who === 'você mesma') {
        setError(`Você já tem uma solicitação pendente para ${fmtDate(d)}. Aguarde a resolução antes de criar outra.`);
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
