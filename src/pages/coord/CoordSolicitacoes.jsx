import { useEffect, useMemo, useState } from 'react';
import {
  collection, onSnapshot, doc, writeBatch, runTransaction,
  serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import '../Solicitacoes.css';
import './CoordSolicitacoes.css';

const TYPE_LABEL = { swap: 'Troca de turno', folga: 'Folga', ferias: 'Férias' };

function normalizeRequest(id, d) {
  const statusMap = { pending: 'pendente', approved: 'aprovada', rejected: 'rejeitada' };
  return {
    id, ...d,
    tipo:            d.tipo            ?? d.type,
    status:          statusMap[d.status] ?? d.status,
    nomeFuncionaria: d.nomeFuncionaria  ?? d.nurseName,
    nurseIdTroca:    d.nurseIdTroca    ?? d.nurseIdcambio,
    nomeTroca:       d.nomeTroca       ?? d.nursecambio,
    turnoOrigem:     d.turnoOrigem     ?? d.turnoRichiedente,
    turnoTroca:      d.turnoTroca      ?? d.turnoCambio,
    dataOrigem:      d.dataOrigem      ?? d.dataRichiedente?.toDate?.()?.toLocaleDateString('pt-BR'),
    dataTroca:       d.dataTroca       ?? d.dataCambio?.toDate?.()?.toLocaleDateString('pt-BR'),
    dataInicio:      d.dataInicio      ?? d.startDate?.toDate?.()?.toLocaleDateString('pt-BR'),
    dataFim:         d.dataFim         ?? d.endDate?.toDate?.()?.toLocaleDateString('pt-BR'),
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
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'solicitacoes'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => normalizeRequest(d.id, d.data())));
      setLoading(false);
    });
  }, []);

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

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <span className="spinner spinner-lg" />
        </div>
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

function RequestCard({ request: r, onUpdate }) {
  const [busy, setBusy] = useState(false);

  async function handle(status) {
    setBusy(true);
    await onUpdate(r.id, status);
    setBusy(false);
  }

  const dateStr = (r.createdAt ?? r.criadaEm)?.toDate?.()?.toLocaleDateString('pt-BR') ?? '—';

  return (
    <div className="sol-card card slide-up">
      <div className="sol-card-top">
        <div>
          <p className="sol-tipo">{r.nomeFuncionaria ?? r.nurseId}</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {TYPE_LABEL[r.tipo] ?? r.tipo} · {dateStr}
          </p>
        </div>
        <span className={`badge ${r.status === 'aprovada' ? 'badge-approved' : r.status === 'rejeitada' ? 'badge-rejected' : 'badge-pending'}`}>
          {r.status}
        </span>
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
      {r.observacao && <p className="sol-detail" style={{ opacity: 0.7 }}>{r.observacao}</p>}

      {r.status === 'pendente' && (
        <div className="sol-actions">
          <button className="btn btn-success btn-sm" onClick={() => handle('aprovada')} disabled={busy}>
            {busy ? <span className="spinner" /> : '✓'} Aprovar
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => handle('rejeitada')} disabled={busy}>
            ✕ Rejeitar
          </button>
        </div>
      )}
    </div>
  );
}
