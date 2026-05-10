import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { SHIFTS } from '../constants/shifts';
import './MinhaEscala.css';
import './NurseDashboard.css';

const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MONTH_FULL  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const MORNING   = new Set(['M1','M2','MF','G']);
const AFTERNOON = new Set(['P','PF']);
const NIGHT     = new Set(['N']);

function calcStats(sched) {
  let horas = 0, noites = 0, trabalhos = 0, descansos = 0;
  let manhas = 0, tardes = 0;
  const counts = {};
  Object.values(sched).forEach(code => {
    const s = SHIFTS[code];
    if (!s) return;
    if (!code || code === 'OFF' || code === 'FE' || code === 'AT') { descansos++; return; }
    horas += s.hours;
    trabalhos++;
    counts[code] = (counts[code] ?? 0) + 1;
    if (NIGHT.has(code))     noites++;
    if (MORNING.has(code))   manhas++;
    if (AFTERNOON.has(code)) tardes++;
  });
  return { horas, noites, trabalhos, descansos, manhas, tardes, counts };
}

export default function NurseDashboard() {
  const { profile, user } = useAuth();
  const now    = new Date();
  const nurseId = profile?.nurseId ?? user?.uid;

  const [viewMode,    setViewMode]    = useState('month');
  const [year,        setYear]        = useState(now.getFullYear());
  const [month,       setMonth]       = useState(now.getMonth());
  const [sched,       setSched]       = useState({});
  const [loading,     setLoading]     = useState(true);
  const [isPublished, setIsPublished] = useState(false);
  const [annualData,  setAnnualData]  = useState(null);
  const [annualLoading, setAnnualLoading] = useState(false);

  /* Carrega escala do mês */
  useEffect(() => {
    if (!nurseId || viewMode !== 'month') return;
    let cancelled = false;
    setLoading(true);
    setSched({});
    setIsPublished(false);
    const monthNum = month + 1;
    getDoc(doc(db, 'publicacoes', `${year}_${monthNum}`))
      .then(pub => {
        if (cancelled) return null;
        const published = pub.exists() && pub.data().publicado === true;
        setIsPublished(published);
        if (!published) { setLoading(false); return null; }
        return getDoc(doc(db, 'escalas', `${nurseId}_${year}_${monthNum}`));
      })
      .then(snap => {
        if (!snap || cancelled) return;
        const map = {};
        if (snap.exists()) {
          const d = snap.data();
          for (let i = 1; i <= 31; i++) { if (d[`d${i}`]) map[i] = d[`d${i}`]; }
        }
        setSched(map);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [nurseId, year, month, viewMode]);

  /* Carrega todos os 12 meses para visão anual */
  useEffect(() => {
    if (!nurseId || viewMode !== 'year') return;
    let cancelled = false;
    setAnnualLoading(true);
    setAnnualData(null);
    Promise.all(
      Array.from({ length: 12 }, (_, m) =>
        getDoc(doc(db, 'escalas', `${nurseId}_${year}_${m + 1}`))
      )
    ).then(snaps => {
      if (cancelled) return;
      const data = snaps.map((snap, m) => {
        const map = {};
        if (snap.exists()) {
          const d = snap.data();
          for (let i = 1; i <= 31; i++) { if (d[`d${i}`]) map[i] = d[`d${i}`]; }
        }
        return { month: m, ...calcStats(map) };
      });
      setAnnualData(data);
      setAnnualLoading(false);
    }).catch(() => { if (!cancelled) setAnnualLoading(false); });
    return () => { cancelled = true; };
  }, [nurseId, year, viewMode]);

  function prevPeriod() {
    if (viewMode === 'month') {
      if (month === 0) { setMonth(11); setYear(y => y - 1); }
      else setMonth(m => m - 1);
    } else {
      setYear(y => y - 1);
    }
  }
  function nextPeriod() {
    if (viewMode === 'month') {
      if (month === 11) { setMonth(0); setYear(y => y + 1); }
      else setMonth(m => m + 1);
    } else {
      setYear(y => y + 1);
    }
  }

  const stats = useMemo(() => calcStats(sched), [sched]);

  /* Anual: totais */
  const annualTotals = useMemo(() => {
    if (!annualData) return null;
    const horas      = annualData.reduce((a, d) => a + d.horas, 0);
    const noites     = annualData.reduce((a, d) => a + d.noites, 0);
    const trabalhos  = annualData.reduce((a, d) => a + d.trabalhos, 0);
    const maxHoras   = Math.max(...annualData.map(d => d.horas), 1);
    return { horas, noites, trabalhos, maxHoras };
  }, [annualData]);

  const periodLabel = viewMode === 'month'
    ? `${MONTH_FULL[month]} ${year}`
    : String(year);

  return (
    <div className="ndb-page fade-in">

      {/* ── Toggle Mensal / Anual ── */}
      <div className="ndb-top">
        <h2 className="ndb-title">Meu Dashboard</h2>
        <div className="ndb-toggle">
          <button
            className={`ndb-toggle-btn${viewMode === 'month' ? ' active' : ''}`}
            onClick={() => setViewMode('month')}
          >Mensal</button>
          <button
            className={`ndb-toggle-btn${viewMode === 'year' ? ' active' : ''}`}
            onClick={() => setViewMode('year')}
          >Anual</button>
        </div>
      </div>

      {/* ── Navegação de período ── */}
      <div className="cal-month-nav" style={{ marginBottom: 20 }}>
        <button className="cal-nav-btn" onClick={prevPeriod} aria-label="Anterior">‹</button>
        <span className="cal-month-label">{periodLabel}</span>
        <button className="cal-nav-btn" onClick={nextPeriod} aria-label="Próximo">›</button>
      </div>

      {/* ════════ VISÃO MENSAL ════════ */}
      {viewMode === 'month' && (
        loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding: 60 }}>
            <span className="spinner spinner-lg" />
          </div>
        ) : !isPublished ? (
          <div className="escala-pendente">
            <span className="escala-pendente-icon">📊</span>
            <p className="escala-pendente-title">Escala em preparação</p>
            <p className="escala-pendente-sub">A coordenadora ainda não publicou a escala de {MONTH_FULL[month]}.</p>
          </div>
        ) : (
          <>
            {/* KPI 2×2 */}
            <div className="ndb-kpi-grid">
              <div className="ndb-kpi ndb-kpi--accent">
                <p className="ndb-kpi-label">Horas</p>
                <p className="ndb-kpi-value">{stats.horas.toFixed(0)}<span className="ndb-kpi-unit">h</span></p>
              </div>
              <div className="ndb-kpi ndb-kpi--night">
                <p className="ndb-kpi-label">Noites</p>
                <p className="ndb-kpi-value">{stats.noites}</p>
              </div>
              <div className="ndb-kpi ndb-kpi--work">
                <p className="ndb-kpi-label">Dias trabalhados</p>
                <p className="ndb-kpi-value">{stats.trabalhos}</p>
              </div>
              <div className="ndb-kpi ndb-kpi--off">
                <p className="ndb-kpi-label">Descansos</p>
                <p className="ndb-kpi-value">{stats.descansos}</p>
              </div>
            </div>

            {/* Período do dia */}
            <div className="ndb-period-row">
              <div className="ndb-period-item">
                <span className="ndb-period-icon">🌅</span>
                <span className="ndb-period-count">{stats.manhas}</span>
                <span className="ndb-period-label">Manhãs</span>
              </div>
              <div className="ndb-period-divider" />
              <div className="ndb-period-item">
                <span className="ndb-period-icon">🌇</span>
                <span className="ndb-period-count">{stats.tardes}</span>
                <span className="ndb-period-label">Tardes</span>
              </div>
              <div className="ndb-period-divider" />
              <div className="ndb-period-item">
                <span className="ndb-period-icon">🌙</span>
                <span className="ndb-period-count">{stats.noites}</span>
                <span className="ndb-period-label">Noites</span>
              </div>
            </div>

            {/* Distribuição de turnos */}
            {Object.keys(stats.counts).length > 0 && (
              <div className="ndb-card">
                <p className="ndb-section-label">Distribuição de turnos</p>
                {Object.entries(stats.counts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([code, count]) => {
                    const s = SHIFTS[code];
                    if (!s) return null;
                    const maxCount = Math.max(...Object.values(stats.counts));
                    const pct = Math.round((count / maxCount) * 100);
                    return (
                      <div key={code} className="ndb-bar-row">
                        <span className="cal-shift ndb-bar-chip" style={{ background: s.color, color: s.text }}>{code}</span>
                        <div className="ndb-bar-track">
                          <div className="ndb-bar-fill" style={{ width: `${pct}%`, background: s.color }} />
                        </div>
                        <span className="ndb-bar-count">{count}×</span>
                        <span className="ndb-bar-hours">{(s.hours * count).toFixed(0)}h</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )
      )}

      {/* ════════ VISÃO ANUAL ════════ */}
      {viewMode === 'year' && (
        annualLoading ? (
          <div style={{ display:'flex', justifyContent:'center', padding: 60 }}>
            <span className="spinner spinner-lg" />
          </div>
        ) : !annualData ? null : (
          <>
            {/* KPI anual */}
            <div className="ndb-kpi-grid ndb-kpi-grid--3">
              <div className="ndb-kpi ndb-kpi--accent">
                <p className="ndb-kpi-label">Horas no ano</p>
                <p className="ndb-kpi-value">{annualTotals.horas.toFixed(0)}<span className="ndb-kpi-unit">h</span></p>
              </div>
              <div className="ndb-kpi ndb-kpi--night">
                <p className="ndb-kpi-label">Noites totais</p>
                <p className="ndb-kpi-value">{annualTotals.noites}</p>
              </div>
              <div className="ndb-kpi ndb-kpi--work">
                <p className="ndb-kpi-label">Dias trabalhados</p>
                <p className="ndb-kpi-value">{annualTotals.trabalhos}</p>
              </div>
            </div>

            {/* Barras mensais */}
            <div className="ndb-card">
              <p className="ndb-section-label">Horas por mês</p>
              {annualData.map(({ month: m, horas }) => {
                const pct = annualTotals.maxHoras > 0
                  ? Math.round((horas / annualTotals.maxHoras) * 100) : 0;
                const isCur = m === now.getMonth() && year === now.getFullYear();
                return (
                  <div key={m} className="ndb-month-row">
                    <span className={`ndb-month-name${isCur ? ' ndb-month-name--cur' : ''}`}>{MONTH_NAMES[m]}</span>
                    <div className="ndb-bar-track">
                      <div
                        className="ndb-bar-fill"
                        style={{
                          width: `${pct}%`,
                          background: isCur ? 'var(--accent)' : 'var(--accent-soft)',
                          border: isCur ? 'none' : '1px solid var(--accent-border)',
                        }}
                      />
                    </div>
                    <span className="ndb-bar-hours">{horas.toFixed(0)}h</span>
                  </div>
                );
              })}
              <div className="ndb-annual-avg">
                Média: {(annualTotals.horas / 12).toFixed(1)}h/mês
              </div>
            </div>

            {/* Turnos por mês (manhãs, tardes, noites) */}
            <div className="ndb-card">
              <p className="ndb-section-label">Turnos por mês</p>
              <div className="ndb-legend-row" style={{ display:'flex', gap:12, marginBottom:10, flexWrap:'wrap' }}>
                <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--text-secondary)' }}>
                  <span style={{ width:10, height:10, borderRadius:3, background:'#fbbf24' }} /> Manhãs
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--text-secondary)' }}>
                  <span style={{ width:10, height:10, borderRadius:3, background:'#f97316' }} /> Tardes
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--text-secondary)' }}>
                  <span style={{ width:10, height:10, borderRadius:3, background:'#7c3aed' }} /> Noites
                </span>
              </div>
              {annualData.map(({ month: m, manhas, tardes, noites }) => {
                const total = manhas + tardes + noites;
                const maxBar = Math.max(...annualData.map(d => d.manhas + d.tardes + d.noites), 1);
                const pctTotal = Math.round((total / maxBar) * 100);
                const pctM = total > 0 ? Math.round((manhas / total) * pctTotal) : 0;
                const pctT = total > 0 ? Math.round((tardes / total) * pctTotal) : 0;
                const pctN = total > 0 ? Math.round((noites / total) * pctTotal) : 0;
                const isCur = m === now.getMonth() && year === now.getFullYear();
                return (
                  <div key={m} className="ndb-month-row">
                    <span className={`ndb-month-name${isCur ? ' ndb-month-name--cur' : ''}`}>{MONTH_NAMES[m]}</span>
                    <div className="ndb-bar-track" style={{ display:'flex', overflow:'hidden' }}>
                      {pctM > 0 && <div className="ndb-bar-fill" style={{ width:`${pctM}%`, background:'#fbbf24', borderRadius: pctT+pctN > 0 ? '4px 0 0 4px' : '4px' }} />}
                      {pctT > 0 && <div className="ndb-bar-fill" style={{ width:`${pctT}%`, background:'#f97316', borderRadius: pctM+pctN === 0 ? '4px' : 0 }} />}
                      {pctN > 0 && <div className="ndb-bar-fill" style={{ width:`${pctN}%`, background:'#7c3aed', borderRadius: pctM+pctT > 0 ? '0 4px 4px 0' : '4px' }} />}
                    </div>
                    <span className="ndb-bar-hours" style={{ minWidth:36, textAlign:'right' }}>{total}</span>
                  </div>
                );
              })}
              <div className="ndb-annual-avg" style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap' }}>
                <span>🌅 {annualData.reduce((a, d) => a + d.manhas, 0)} manhãs</span>
                <span>🌇 {annualData.reduce((a, d) => a + d.tardes, 0)} tardes</span>
                <span>🌙 {annualData.reduce((a, d) => a + d.noites, 0)} noites</span>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
