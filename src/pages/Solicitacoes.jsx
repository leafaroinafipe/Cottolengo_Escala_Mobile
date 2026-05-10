import { useEffect, useMemo, useState } from 'react';
import {
  collection, addDoc, serverTimestamp, onSnapshot,
  query, where, orderBy, getDocs, doc, deleteDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { SHIFTS } from '../constants/shifts';
import './Solicitacoes.css';
import './coord/CoordSolicitacoes.css';   /* reutiliza estilos de card accordion */

/* Converte qualquer representação de data do Firestore para string */
function toDateStr(val) {
  if (!val) return null;
  if (typeof val?.toDate === 'function') return val.toDate().toLocaleDateString('pt-BR');
  if (typeof val === 'number') return new Date(val).toLocaleDateString('pt-BR');
  if (typeof val === 'string' && val.trim()) return val.trim();
  return null;
}

function normalizeRequest(id, d) {
  const statusMap = { pending: 'pendente', approved: 'aprovada', rejected: 'rejeitada' };
  const tipoLegMap = { FE: 'ferias', AT: 'ferias', OFF: 'folga', troca: 'swap' };
  const tipoRaw = d.tipo ?? d.type;
  const r = {
    id, ...d,
    tipo:            tipoLegMap[tipoRaw] ?? tipoRaw,
    status:          statusMap[d.status] ?? d.status,
    nomeFuncionaria: d.nomeFuncionaria  ?? d.nurseName,
    nurseIdTroca:    d.nurseIdTroca    ?? d.nurseIdcambio,
    nomeTroca:       d.nomeTroca       ?? d.nursecambio,
    turnoOrigem:     d.turnoOrigem     ?? d.turnoRichiedente,
    turnoTroca:      d.turnoTroca      ?? d.turnoCambio,
    dataFolga:  toDateStr(d.dataFolga) ?? toDateStr(d.data) ?? toDateStr(d.date) ?? toDateStr(d.dataRiposo),
    dataOrigem: toDateStr(d.dataOrigem) ?? toDateStr(d.dataRichiedente),
    dataTroca:  toDateStr(d.dataTroca) ?? toDateStr(d.dataCambio),
    dataInicio: toDateStr(d.dataInicio) ?? toDateStr(d.startDate),
    dataFim:    toDateStr(d.dataFim)    ?? toDateStr(d.endDate),
  };
  /* Fallback: folga legada com startDate mas sem dataFolga */
  if (r.tipo === 'folga' && !r.dataFolga && r.dataInicio) {
    r.dataFolga = r.dataInicio;
  }
  return r;
}

const TIPO_LABELS = { swap: 'Troca de turno', folga: 'Folga', ferias: 'Férias' };
const TIPO_ICON   = { swap: '🔄', folga: '🏖️', ferias: '✈️' };

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
function fmtTs(ts) {
  const d = ts?.toDate?.();
  if (!d) return null;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' • ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* ═══════════════════════════════════════════
   Componente principal
   ═══════════════════════════════════════════ */
export default function Solicitacoes() {
  const { user, profile } = useAuth();
  const [requests,  setRequests]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [tipo,      setTipo]      = useState('swap');
  const [nurses,    setNurses]    = useState([]);
  const [filter,    setFilter]    = useState('pendente');

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
      setRequests(snap.docs.map(d => normalizeRequest(d.id, d.data())));
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

  /* Filtra por status */
  const filtered = useMemo(() =>
    requests.filter(r => r.status === filter),
  [requests, filter]);

  /* Contagem por status */
  const counts = useMemo(() => {
    const c = { pendente: 0, aprovada: 0, rejeitada: 0 };
    for (const r of requests) if (c[r.status] !== undefined) c[r.status]++;
    return c;
  }, [requests]);

  const [editReq,  setEditReq]  = useState(null);   /* req em edição */
  const [toast,    setToast]    = useState(null);

  async function handleDelete(r) {
    if (!window.confirm('Tem certeza que deseja excluir esta solicitação?')) return;
    try {
      await deleteDoc(doc(db, 'solicitacoes', r.id));
      setToast({ msg: 'Solicitação excluída', type: 'success' });
      setTimeout(() => setToast(null), 2500);
    } catch {
      setToast({ msg: 'Erro ao excluir', type: 'danger' });
      setTimeout(() => setToast(null), 2500);
    }
  }

  return (
    <div className="sol-page fade-in">
      <div className="sol-header">
        <h2>Solicitações</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Nova</button>
      </div>

      {/* ── Tabs de filtro por status ── */}
      <div className="filter-tabs">
        {['pendente','aprovada','rejeitada'].map(s => (
          <button
            key={s}
            className={`filter-tab${filter === s ? ' active' : ''}`}
            onClick={() => setFilter(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            <span className="filter-count">{counts[s]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: 32 }}>📋</p>
          <p>Nenhuma solicitação {filter}.</p>
          {filter === 'pendente' && (
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>Fazer pedido</button>
          )}
        </div>
      ) : (
        <div className="sol-list">
          {filtered.map(r => (
            <NurseRequestCard
              key={r.id}
              r={r}
              onEdit={() => setEditReq(r)}
              onDelete={() => handleDelete(r)}
            />
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

      {editReq && (
        <EditModal
          req={editReq}
          nurses={nurses}
          onClose={() => setEditReq(null)}
          onSaved={() => {
            setEditReq(null);
            setToast({ msg: 'Solicitação atualizada', type: 'success' });
            setTimeout(() => setToast(null), 2500);
          }}
        />
      )}

      {toast && (
        <div className={`toast-bar toast-${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Card retrátil (accordion) — mesma UI da coord,
   porém SEM botões de aprovar/rejeitar/editar
   ═══════════════════════════════════════════ */
function NurseRequestCard({ r, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  const statusBadge = r.status === 'aprovada' ? 'badge-approved'
                    : r.status === 'rejeitada' ? 'badge-rejected'
                    : 'badge-pending';

  const created = r.createdAt ?? r.criadaEm;
  const decided = r.status === 'aprovada' ? r.approvedAt
                : r.status === 'rejeitada' ? r.rejectedAt
                : null;

  const preview = buildPreview(r);
  const isPendente = r.status === 'pendente';

  /* Bloco de datas expandido */
  let dateBlock = null;
  if (r.tipo === 'swap') {
    dateBlock = (
      <div className="csr-swap">
        <div className="csr-swap-side">
          <span className="csr-swap-who">Eu</span>
          <span className="csr-swap-date">{fmtDateFull(r.dataOrigem)}</span>
          {r.turnoOrigem && <span className="csr-swap-shift">{r.turnoOrigem}</span>}
        </div>
        <span className="csr-swap-arrow" aria-hidden>↔</span>
        <div className="csr-swap-side">
          <span className="csr-swap-who">{r.nomeTroca ?? 'colega'}</span>
          <span className="csr-swap-date">{fmtDateFull(r.dataTroca)}</span>
          {r.turnoTroca && <span className="csr-swap-shift">{r.turnoTroca}</span>}
        </div>
      </div>
    );
  } else if (r.tipo === 'folga') {
    dateBlock = (
      <div className="csr-dates">
        <span className="csr-date-chip">🏖️ {fmtDateFull(r.dataFolga)}</span>
        {r.motivo && <span className="csr-motivo">Motivo: {r.motivo}</span>}
      </div>
    );
  } else if (r.tipo === 'ferias') {
    dateBlock = (
      <div className="csr-dates">
        <span className="csr-date-chip">{fmtDateFull(r.dataInicio)}</span>
        <span className="csr-date-arrow" aria-hidden>→</span>
        <span className="csr-date-chip">{fmtDateFull(r.dataFim)}</span>
      </div>
    );
  }

  return (
    <div className={`csr-card csr-card--${r.tipo ?? 'swap'}${r.status !== 'pendente' ? ` csr-card--${r.status}` : ''}${expanded ? ' csr-card--open' : ''}`}>

      {/* ── Header clicável ── */}
      <button className="csr-header" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>
        <div className="csr-header-left">
          <span className="csr-type-icon" aria-hidden>{TIPO_ICON[r.tipo] ?? '📋'}</span>
          <div className="csr-header-meta">
            <span className="csr-type-label">{TIPO_LABELS[r.tipo] ?? r.tipo}</span>
            {preview && <span className="csr-nurse-name">{preview}</span>}
          </div>
        </div>
        <div className="csr-header-right">
          <span className={`badge ${statusBadge}`}>{r.status}</span>
          <svg
            className={`csr-chevron${expanded ? ' csr-chevron--up' : ''}`}
            width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </button>

      {/* ── Body colapsável ── */}
      {expanded && (
        <div className="csr-body">
          {dateBlock}

          {/* Timestamps */}
          <div className="csr-meta">
            <span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              {' '}{fmtTs(created) ?? `Criada ${timeAgo(created)}`}
            </span>
            {decided && (
              <span className={r.status === 'aprovada' ? 'csr-meta--ok' : 'csr-meta--no'}>
                {r.status === 'aprovada' ? '✓ Aprovada' : '✕ Rejeitada'} · {fmtTs(decided) ?? timeAgo(decided)}
              </span>
            )}
            {r.observacao && (
              <span title={r.observacao}>💬 {r.observacao}</span>
            )}
            {r.observacaoCoord && (
              <span title={r.observacaoCoord}>📝 {r.observacaoCoord}</span>
            )}
          </div>

          {/* ── Botões editar / excluir (só pendentes) ── */}
          {isPendente && (
            <div className="csr-actions">
              <button className="csr-btn csr-btn--edit" onClick={onEdit}>
                ✏️ Editar
              </button>
              <button className="csr-btn csr-btn--reject" onClick={onDelete}>
                🗑️ Excluir
              </button>
            </div>
          )}
        </div>
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

/* ═══════════════════════════════════════════
   Modal de edição de solicitação pendente
   ═══════════════════════════════════════════ */
function EditModal({ req, nurses, onClose, onSaved }) {
  const tipo = req.tipo;
  const [form,   setForm]   = useState(() => {
    const f = {};
    if (tipo === 'swap') {
      f.dataOrigem  = req.dataOrigem  ?? '';
      f.turnoOrigem = req.turnoOrigem ?? '';
      f.nurseIdTroca = req.nurseIdTroca ?? '';
      f.nomeTroca   = req.nomeTroca   ?? '';
      f.dataTroca   = req.dataTroca   ?? '';
      f.turnoTroca  = req.turnoTroca  ?? '';
    } else if (tipo === 'folga') {
      f.dataFolga = req.dataFolga ?? '';
      f.motivo    = req.motivo    ?? '';
    } else if (tipo === 'ferias') {
      f.dataInicio = req.dataInicio ?? '';
      f.dataFim    = req.dataFim    ?? '';
    }
    f.observacao = req.observacao ?? '';
    return f;
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => { setForm(prev => ({ ...prev, [k]: v })); setError(''); };

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, 'solicitacoes', req.id), form);
      onSaved();
    } catch {
      setError('Erro ao atualizar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up">
        <div className="modal-handle" />
        <h3 style={{ marginBottom: 16 }}>
          Editar — {TIPO_LABELS[tipo] ?? tipo}
        </h3>

        <form onSubmit={handleSave} className="modal-form">
          {tipo === 'swap' && (
            <>
              <div className="form-field">
                <label>Sua data</label>
                <input type="date" required value={form.dataOrigem} onChange={e => set('dataOrigem', e.target.value)} />
              </div>
              <div className="form-field">
                <label>Seu turno</label>
                <select required value={form.turnoOrigem} onChange={e => set('turnoOrigem', e.target.value)}>
                  <option value="">Selecionar...</option>
                  {Object.entries(SHIFTS).filter(([k]) => k !== 'OFF').map(([k, s]) => (
                    <option key={k} value={k}>{k} — {s.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Trocar com</label>
                <select required value={form.nurseIdTroca} onChange={e => {
                  const n = nurses.find(x => x.id === e.target.value);
                  set('nurseIdTroca', e.target.value);
                  set('nomeTroca', n?.name ?? '');
                }}>
                  <option value="">Selecionar colega...</option>
                  {nurses.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Data da colega</label>
                <input type="date" required value={form.dataTroca} onChange={e => set('dataTroca', e.target.value)} />
              </div>
              <div className="form-field">
                <label>Turno da colega</label>
                <select required value={form.turnoTroca} onChange={e => set('turnoTroca', e.target.value)}>
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
                <input type="date" required value={form.dataFolga} onChange={e => set('dataFolga', e.target.value)} />
              </div>
              <div className="form-field">
                <label>Motivo (opcional)</label>
                <input type="text" value={form.motivo} placeholder="Ex: consulta médica" onChange={e => set('motivo', e.target.value)} />
              </div>
            </>
          )}

          {tipo === 'ferias' && (
            <>
              <div className="form-field">
                <label>Data de início</label>
                <input type="date" required value={form.dataInicio} onChange={e => set('dataInicio', e.target.value)} />
              </div>
              <div className="form-field">
                <label>Data de fim</label>
                <input type="date" required value={form.dataFim} onChange={e => set('dataFim', e.target.value)} />
              </div>
            </>
          )}

          <div className="form-field">
            <label>Observação (opcional)</label>
            <textarea rows={2} value={form.observacao} onChange={e => set('observacao', e.target.value)} />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-full" style={{ flex: 1, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary btn-full" style={{ flex: 1 }} disabled={saving}>
              {saving ? <><span className="spinner" />Salvando...</> : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
