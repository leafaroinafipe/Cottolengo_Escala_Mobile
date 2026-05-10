import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, onSnapshot, doc, writeBatch, runTransaction,
  serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import '../Solicitacoes.css';
import './CoordSolicitacoes.css';

const TYPE_LABEL = { swap: 'Troca de turno', folga: 'Folga', ferias: 'Férias' };
const TYPE_ICON  = { swap: '🔄', folga: '🏖️', ferias: '✈️' };

function getInitials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0,2).toUpperCase()
                        : (p[0][0] + p[p.length-1][0]).toUpperCase();
}
function fmtDateFull(str) {
  if (!str) return '—';
  let y, m, d;
  if (str.includes('-')) { [y, m, d] = str.split('-').map(Number); }
  else if (str.includes('/')) { [d, m, y] = str.split('/').map(Number); }
  else return str;
  if (!y) return str;
  return new Date(y, m-1, d)
    .toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' })
    .replace('.','');
}
function fmtTs(ts) {
  const d = ts?.toDate?.();
  if (!d) return null;
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })
    + ' • ' + d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

/* Converte qualquer representação de data do Firestore para string "DD/MM/AAAA" */
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
  return {
    id, ...d,
    tipo:            tipoLegMap[tipoRaw] ?? tipoRaw,
    status:          statusMap[d.status] ?? d.status,
    nomeFuncionaria: d.nomeFuncionaria  ?? d.nurseName,
    nurseIdTroca:    d.nurseIdTroca    ?? d.nurseIdcambio,
    nomeTroca:       d.nomeTroca       ?? d.nursecambio,
    turnoOrigem:     d.turnoOrigem     ?? d.turnoRichiedente,
    turnoTroca:      d.turnoTroca      ?? d.turnoCambio,
    /* dataFolga: tenta campo principal + aliases do app legado */
    dataFolga:  toDateStr(d.dataFolga) ?? toDateStr(d.data) ?? toDateStr(d.date) ?? toDateStr(d.dataRiposo),
    dataOrigem: toDateStr(d.dataOrigem) ?? toDateStr(d.dataRichiedente),
    dataTroca:  toDateStr(d.dataTroca) ?? toDateStr(d.dataCambio),
    dataInicio: toDateStr(d.dataInicio) ?? toDateStr(d.startDate),
    dataFim:    toDateStr(d.dataFim)    ?? toDateStr(d.endDate),
  };
}

/* ── Converte "YYYY-MM-DD" ou "DD/MM/YYYY" para { year, month, day } ── */
function parseDate(str) {
  if (!str) return null;
  if (str.includes('-')) {
    const [y, m, d] = str.split('-').map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return { year: y, month: m, day: d };
  }
  if (str.includes('/')) {
    const [d, m, y] = str.split('/').map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return { year: y, month: m, day: d };
  }
  return null;
}

function toIso(str) {
  const p = parseDate(str);
  if (!p) return '';
  return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
}

/* Mapa para tipos legados do app antigo (códigos de turno usados como tipo) */
const TIPO_LEGADO = { FE: 'ferias', AT: 'ferias', OFF: 'folga' };

function primaryIso(r) {
  const tipo = TIPO_LEGADO[r.tipo] ?? r.tipo;
  if (tipo === 'folga')  return toIso(r.dataFolga);
  if (tipo === 'ferias') return toIso(r.dataInicio);
  if (tipo === 'swap') {
    const a = toIso(r.dataOrigem), b = toIso(r.dataTroca);
    if (!a && !b) return '';
    if (!a) return b;
    if (!b) return a;
    return a <= b ? a : b;
  }
  /* tipo desconhecido — varre todos os campos de data */
  return toIso(r.dataFolga) || toIso(r.dataInicio) || toIso(r.dataOrigem) || toIso(r.dataTroca) || '';
}

/* Retorna true se a data primária da solicitação já passou */
function isPastDue(r) {
  const iso = primaryIso(r);
  if (!iso) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(y, m - 1, d) < today;
}

/* Dias restantes até a data primária (negativo = já venceu) */
function daysUntilDue(r) {
  const iso = primaryIso(r);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(y, m - 1, d) - today) / 86400000);
}

function fmtGroupHeader(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y) return iso;
  return new Date(y, m - 1, d)
    .toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
    .replace(/\./g, '');
}

/* ── Folga/férias via batch; swap em transação separada (precisa checagem). ── */
function addScheduleWrites(batch, r) {
  if (r.tipo === 'folga') {
    const p = parseDate(r.dataFolga);
    if (!p) return;
    batch.set(
      doc(db, 'escalas', `${r.nurseId}_${p.year}_${p.month}`),
      { [`d${p.day}`]: 'OFF' },
      { merge: true },
    );
  } else if (r.tipo === 'ferias') {
    const start = parseDate(r.dataInicio);
    const end   = parseDate(r.dataFim);
    if (!start || !end) return;
    const monthMap = {};
    const cur = new Date(start.year, start.month - 1, start.day);
    const endDate = new Date(end.year, end.month - 1, end.day);
    while (cur <= endDate) {
      const y = cur.getFullYear(), m = cur.getMonth() + 1, d = cur.getDate();
      const key = `${r.nurseId}_${y}_${m}`;
      if (!monthMap[key]) monthMap[key] = {};
      monthMap[key][`d${d}`] = 'FE';
      cur.setDate(cur.getDate() + 1);
    }
    Object.entries(monthMap).forEach(([docId, fields]) => {
      batch.set(doc(db, 'escalas', docId), fields, { merge: true });
    });
  }
}

/* ── Aprovação de swap atômica com checagem de estado atual ── */
async function approveSwap(request, decidedBy) {
  const a = parseDate(request.dataOrigem);
  const b = parseDate(request.dataTroca);
  if (!a || !b || !request.nurseId || !request.nurseIdTroca
      || !request.turnoTroca || !request.turnoOrigem) {
    throw new Error('SWAP_INVALID');
  }
  const aRef = doc(db, 'escalas', `${request.nurseId}_${a.year}_${a.month}`);
  const bRef = doc(db, 'escalas', `${request.nurseIdTroca}_${b.year}_${b.month}`);
  const sRef = doc(db, 'solicitacoes', request.id);

  await runTransaction(db, async (txn) => {
    const [aSnap, bSnap] = await Promise.all([txn.get(aRef), txn.get(bRef)]);
    const currentA = aSnap.exists() ? aSnap.data()[`d${a.day}`] ?? 'OFF' : 'OFF';
    const currentB = bSnap.exists() ? bSnap.data()[`d${b.day}`] ?? 'OFF' : 'OFF';
    if (currentA !== request.turnoOrigem || currentB !== request.turnoTroca) {
      const e = new Error('SWAP_CONFLICT');
      e.detail = { currentA, currentB, expectedA: request.turnoOrigem, expectedB: request.turnoTroca };
      throw e;
    }
    txn.set(aRef, { [`d${a.day}`]: request.turnoTroca }, { merge: true });
    txn.set(bRef, { [`d${b.day}`]: request.turnoOrigem }, { merge: true });
    txn.update(sRef, {
      status: 'aprovada',
      approvedAt: serverTimestamp(),
      decidedBy,
    });
  });
}

export default function CoordSolicitacoes() {
  const [requests, setRequests] = useState([]);
  const [filter,   setFilter]   = useState('pendente');
  const [view,     setView]     = useState('lista');
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState(null);

  const autoRejectedRef = useRef(new Set());
  const notifiedRef     = useRef(new Set());

  useEffect(() => {
    const q = query(collection(db, 'solicitacoes'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => normalizeRequest(d.id, d.data())));
      setLoading(false);
    });
  }, []);

  /* Pede permissão de notificação uma vez */
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  /* Auto-rejeita vencidas; notifica prestes a vencer (≤ 2 dias) */
  useEffect(() => {
    if (loading) return;
    const decidedBy = auth.currentUser?.uid ?? null;
    const pending = requests.filter(r => r.status === 'pendente');

    const expired = pending.filter(r => isPastDue(r) && !autoRejectedRef.current.has(r.id));
    if (expired.length > 0) {
      const batch = writeBatch(db);
      expired.forEach(r => {
        autoRejectedRef.current.add(r.id);
        batch.update(doc(db, 'solicitacoes', r.id), {
          status: 'rejeitada',
          rejectedAt: serverTimestamp(),
          decidedBy,
          autoRejected: true,
        });
      });
      batch.commit().catch(console.error);
      setToast({ msg: `${expired.length} solicitação(ões) vencida(s) rejeitada(s) automaticamente.`, type: 'rejeitada' });
      setTimeout(() => setToast(null), 4000);
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      pending.forEach(r => {
        if (notifiedRef.current.has(r.id)) return;
        const days = daysUntilDue(r);
        if (days === null || days < 0 || days > 2) return;
        notifiedRef.current.add(r.id);
        const quando = days === 0 ? 'hoje' : days === 1 ? 'amanhã' : 'em 2 dias';
        new Notification('Solicitação prestes a vencer', {
          body: `${TYPE_LABEL[r.tipo] ?? 'Solicitação'} de ${r.nomeFuncionaria ?? 'enfermeira'} vence ${quando}.`,
          tag: `sol-due-${r.id}`,
        });
      });
    }
  }, [requests, loading]);

  async function updateStatus(id, status) {
    const decidedBy = auth.currentUser?.uid ?? null;
    const request = requests.find(r => r.id === id);

    if (status === 'aprovada' && request?.tipo === 'swap') {
      try {
        await approveSwap(request, decidedBy);
        showToast('Aprovada! Escala atualizada.', 'aprovada');
      } catch (err) {
        if (err.message === 'SWAP_CONFLICT') {
          const { currentA, currentB, expectedA, expectedB } = err.detail;
          showToast(
            `Conflito: escala mudou (atual ${currentA}/${currentB}, esperado ${expectedA}/${expectedB}).`,
            'rejeitada',
          );
        } else {
          console.error('[approveSwap] failed:', err);
          showToast('Erro ao aprovar troca. Tente novamente.', 'rejeitada');
        }
      }
      return;
    }

    const batch = writeBatch(db);
    batch.update(
      doc(db, 'solicitacoes', id),
      status === 'aprovada'
        ? { status, approvedAt: serverTimestamp(), decidedBy }
        : { status, rejectedAt: serverTimestamp(), decidedBy },
    );
    if (status === 'aprovada' && request) addScheduleWrites(batch, request);

    try {
      await batch.commit();
      showToast(
        status === 'aprovada' ? 'Aprovada! Escala atualizada.' : 'Solicitação rejeitada.',
        status,
      );
    } catch (err) {
      console.error('[updateStatus] batch failed:', err);
      showToast('Erro ao processar solicitação. Tente novamente.', 'rejeitada');
    }
  }

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const filtered = useMemo(
    () => requests.filter(r => r.status === filter),
    [requests, filter],
  );

  const counts = useMemo(() => {
    const c = { pendente: 0, aprovada: 0, rejeitada: 0 };
    for (const r of requests) if (c[r.status] !== undefined) c[r.status]++;
    return c;
  }, [requests]);

  return (
    <div className="sol-page fade-in">
      <div className="sol-header">
        <div>
          <h2>Solicitações</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Central de aprovação</p>
        </div>
      </div>

      <div className="filter-tabs">
        {['pendente', 'aprovada', 'rejeitada'].map(s => (
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

      <div className="csr-view-toggle">
        <button className={`cvt-btn${view === 'lista' ? ' cvt-btn--active' : ''}`} onClick={() => setView('lista')}>Lista</button>
        <button className={`cvt-btn${view === 'resumo' ? ' cvt-btn--active' : ''}`} onClick={() => setView('resumo')}>Resumo</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : view === 'resumo' ? (
        <ResumoView requests={filtered} />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: 28 }}>📋</p>
          <p>Nenhuma solicitação {filter}.</p>
        </div>
      ) : (
        <div className="sol-list">
          {filtered.map(r => <RequestCard key={r.id} request={r} onUpdate={updateStatus} />)}
        </div>
      )}

      {toast && (
        <div className={`toast-bar ${toast.type === 'aprovada' ? 'toast-success' : 'toast-danger'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

const STATUS_ORDER = ['pendente', 'aprovada', 'rejeitada'];

function ResumoView({ requests }) {
  const groups = useMemo(() => {
    const g = { ferias: [], folga: [], swap: [] };
    for (const r of requests) {
      if (g[r.tipo] !== undefined) g[r.tipo].push(r);
    }
    const sort = arr => [...arr].sort((a, b) => {
      const si = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      if (si !== 0) return si;
      return (primaryIso(a) || '9').localeCompare(primaryIso(b) || '9');
    });
    return { ferias: sort(g.ferias), folga: sort(g.folga), swap: sort(g.swap) };
  }, [requests]);

  const types = [
    { tipo: 'ferias', label: 'Férias',        icon: '✈️' },
    { tipo: 'folga',  label: 'Folga',          icon: '🏖️' },
    { tipo: 'swap',   label: 'Troca de turno', icon: '🔄' },
  ].filter(({ tipo }) => groups[tipo].length > 0);

  if (types.length === 0) {
    return (
      <div className="empty-state">
        <p style={{ fontSize: 28 }}>📋</p>
        <p>Nenhuma solicitação registrada.</p>
      </div>
    );
  }

  return (
    <div className="rsm-container">
      {types.map(({ tipo, label, icon }) => (
        <TypeGroup key={tipo} tipo={tipo} label={label} icon={icon} items={groups[tipo]} />
      ))}
    </div>
  );
}

function TypeGroup({ tipo, label, icon, items }) {
  const [expanded, setExpanded] = useState(true);
  const pendentes  = items.filter(r => r.status === 'pendente').length;
  const aprovadas  = items.filter(r => r.status === 'aprovada').length;
  const rejeitadas = items.filter(r => r.status === 'rejeitada').length;

  return (
    <div className={`rsm-group-card rsm-group-card--${tipo}`}>
      <button className="rsm-group-header" onClick={() => setExpanded(p => !p)}>
        <span className="rsm-group-icon">{icon}</span>
        <span className="rsm-group-label">{label}</span>
        <div className="rsm-group-counts">
          {pendentes  > 0 && <span className="rsm-count-badge rsm-count-pending">{pendentes} pendente{pendentes !== 1 ? 's' : ''}</span>}
          {aprovadas  > 0 && <span className="rsm-count-badge rsm-count-approved">{aprovadas} aprovada{aprovadas !== 1 ? 's' : ''}</span>}
          {rejeitadas > 0 && <span className="rsm-count-badge rsm-count-rejected">{rejeitadas} rejeitada{rejeitadas !== 1 ? 's' : ''}</span>}
        </div>
        <svg
          className={`rsm-group-chevron${expanded ? ' rsm-group-chevron--up' : ''}`}
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {expanded && (
        <div className="rsm-group-body">
          {items.map(r => <ResumoItem key={r.id} request={r} />)}
        </div>
      )}
    </div>
  );
}

function ResumoItem({ request: r }) {
  const statusBadge = r.status === 'aprovada'  ? 'badge-approved'
                    : r.status === 'rejeitada' ? 'badge-rejected'
                    : 'badge-pending';

  if (r.tipo === 'swap') {
    return (
      <div className="rsm-item rsm-item--swap">
        <div className="rsm-item-info">
          <div className="rsm-item-swap-row">
            <div className="rsm-item-swap-party">
              <span className="rsm-item-swap-name">{r.nomeFuncionaria?.split(' ')[0] ?? 'Solicitante'}</span>
              <span className="rsm-item-swap-date">{fmtDateFull(r.dataOrigem)}</span>
              {r.turnoOrigem && <span className="rsm-item-swap-shift">{r.turnoOrigem}</span>}
            </div>
            <span className="rsm-item-swap-arrow">⇄</span>
            <div className="rsm-item-swap-party">
              <span className="rsm-item-swap-name">{r.nomeTroca?.split(' ')[0] ?? 'Colega'}</span>
              <span className="rsm-item-swap-date">{fmtDateFull(r.dataTroca)}</span>
              {r.turnoTroca && <span className="rsm-item-swap-shift">{r.turnoTroca}</span>}
            </div>
          </div>
        </div>
        <span className={`badge ${statusBadge} rsm-item-status`}>{r.status}</span>
      </div>
    );
  }

  return (
    <div className="rsm-item">
      <div className="rsm-item-avatar">{getInitials(r.nomeFuncionaria ?? r.nurseId)}</div>
      <div className="rsm-item-info">
        <span className="rsm-item-name">{r.nomeFuncionaria ?? r.nurseId ?? '—'}</span>
        {r.tipo === 'folga'  && <span className="rsm-item-date">📅 {fmtDateFull(r.dataFolga)}</span>}
        {r.tipo === 'ferias' && <span className="rsm-item-date">📅 {fmtDateFull(r.dataInicio)} → {fmtDateFull(r.dataFim)}</span>}
      </div>
      <span className={`badge ${statusBadge} rsm-item-status`}>{r.status}</span>
    </div>
  );
}

function RequestCard({ request: r, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [busy,     setBusy]     = useState(false);

  async function handle(status) {
    setBusy(true);
    await onUpdate(r.id, status);
    setBusy(false);
  }

  const statusBadge = r.status === 'aprovada' ? 'badge-approved'
                    : r.status === 'rejeitada' ? 'badge-rejected'
                    : 'badge-pending';
  const created = r.createdAt ?? r.criadaEm;
  const decided = r.status === 'aprovada' ? r.approvedAt : r.status === 'rejeitada' ? r.rejectedAt : null;

  const hasRequiredData =
    r.tipo === 'folga'  ? !!r.dataFolga
  : r.tipo === 'ferias' ? !!(r.dataInicio && r.dataFim)
  : r.tipo === 'swap'   ? !!(r.dataOrigem && r.dataTroca && r.nurseIdTroca)
  : true;

  return (
    <div className={`csr-card csr-card--${r.tipo ?? 'swap'} csr-card--${r.status}${expanded ? ' csr-card--open' : ''}`}>

      {/* ── Header clicável ── */}
      <button className="csr-header" onClick={() => setExpanded(p => !p)} aria-expanded={expanded}>
        <div className="csr-header-left">
          <span className="csr-type-icon" aria-hidden>{TYPE_ICON[r.tipo] ?? '📋'}</span>
          <div className="csr-header-meta">
            <span className="csr-type-label">{TYPE_LABEL[r.tipo] ?? r.tipo}</span>
            <span className="csr-nurse-name">{r.nomeFuncionaria ?? r.nurseId ?? ''}</span>
          </div>
        </div>
        <div className="csr-header-right">
          <span className={`badge ${statusBadge}`}>{r.status}</span>
          <svg
            className={`csr-chevron${expanded ? ' csr-chevron--up' : ''}`}
            width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </button>

      {/* ── Body expandido ── */}
      {expanded && (
        <div className="csr-body">

          {/* Swap — grid 3 colunas */}
          {r.tipo === 'swap' && (
            <div className="csr-swap">
              <div className="csr-swap-side">
                <span className="csr-swap-who">{r.nomeFuncionaria?.split(' ')[0] ?? 'Solicitante'}</span>
                <span className="csr-swap-date">📅 {fmtDateFull(r.dataOrigem)}</span>
                {r.turnoOrigem && <span className="csr-swap-shift">{r.turnoOrigem}</span>}
              </div>
              <span className="csr-swap-arrow">⇄</span>
              <div className="csr-swap-side">
                <span className="csr-swap-who">{r.nomeTroca?.split(' ')[0] ?? 'Colega'}</span>
                <span className="csr-swap-date">📅 {fmtDateFull(r.dataTroca)}</span>
                {r.turnoTroca && <span className="csr-swap-shift">{r.turnoTroca}</span>}
              </div>
            </div>
          )}

          {/* Folga */}
          {r.tipo === 'folga' && (
            <div className="csr-dates">
              <div className="csr-date-chip">📅 {fmtDateFull(r.dataFolga)}</div>
              {r.motivo && <div className="csr-motivo">💬 {r.motivo}</div>}
            </div>
          )}

          {/* Férias */}
          {r.tipo === 'ferias' && (
            <div className="csr-dates">
              <div className="csr-date-chip">📅 {fmtDateFull(r.dataInicio)}</div>
              <span className="csr-date-arrow">→</span>
              <div className="csr-date-chip">📅 {fmtDateFull(r.dataFim)}</div>
            </div>
          )}

          {/* Meta */}
          <div className="csr-meta">
            {fmtTs(created) && <span>🕒 {fmtTs(created)}</span>}
            {r.observacao   && <span>💬 {r.observacao}</span>}
            {decided        && (
              <span className={r.status === 'aprovada' ? 'csr-meta--ok' : 'csr-meta--no'}>
                {r.status === 'aprovada' ? '✓ Aprovada' : '✕ Rejeitada'}{fmtTs(decided) ? ` · ${fmtTs(decided)}` : ''}
              </span>
            )}
          </div>

          {/* Aviso de dados incompletos */}
          {!hasRequiredData && (
            <div className="csr-warning">⚠ Dados incompletos — aprovação bloqueada.</div>
          )}

          {/* Ações — só pendentes */}
          {r.status === 'pendente' && (
            <div className="csr-actions">
              <button className="csr-btn csr-btn--reject" onClick={() => handle('rejeitada')} disabled={busy}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Rejeitar
              </button>
              <button className="csr-btn csr-btn--approve" onClick={() => handle('aprovada')} disabled={busy || !hasRequiredData}>
                {busy ? <span className="spinner" /> : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Aprovar
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
