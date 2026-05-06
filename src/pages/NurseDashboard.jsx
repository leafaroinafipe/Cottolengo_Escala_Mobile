import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { SHIFTS } from '../constants/shifts';
import './MinhaEscala.css';
import './NurseDashboard.css';

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export default function NurseDashboard() {
  const { profile, user } = useAuth();
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [sched,   setSched]   = useState({});
  const [loading, setLoading] = useState(true);

  const nurseId = profile?.nurseId ?? user?.uid;

  useEffect(() => {
    if (!nurseId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setSched({});
    const monthNum = month + 1;
    getDoc(doc(db, 'escalas', `${nurseId}_${year}_${monthNum}`))
      .then(snap => {
        if (cancelled) return;
        const map = {};
        if (snap.exists()) {
          const data = snap.data();
          for (let d = 1; d <= 31; d++) {
            if (data[`d${d}`]) map[d] = data[`d${d}`];
          }
        }
        setSched(map);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [nurseId, year, month]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  let totalHoras = 0, totalNoites = 0, diasTrabalhados = 0;
  const shiftCounts = {};
  Object.values(sched).forEach(code => {
    const s = SHIFTS[code];
    if (!s) return;
    if (code !== 'OFF' && s.hours > 0) diasTrabalhados++;
    totalHoras += s.hours;
    if (code === 'N') totalNoites++;
    shiftCounts[code] = (shiftCounts[code] ?? 0) + 1;
  });

  return (
    <div className="minha-escala fade-in">
      <div className="escala-header">
        <h2>Meu Dashboard</h2>
        <div className="month-nav">
          <button className="btn btn-ghost btn-sm" onClick={prevMonth}>‹</button>
          <span className="month-label">{MONTH_NAMES[month].slice(0, 3)} {year}</span>
          <button className="btn btn-ghost btn-sm" onClick={nextMonth}>›</button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : (
        <>
          <div className="escala-summary" style={{ marginBottom: 20 }}>
            <div className="summary-item">
              <span className="summary-value">{totalHoras}h</span>
              <span className="summary-label">Horas</span>
            </div>
            <div className="summary-item">
              <span className="summary-value">{diasTrabalhados}</span>
              <span className="summary-label">Dias trab.</span>
            </div>
            <div className="summary-item">
              <span className="summary-value">{totalNoites}</span>
              <span className="summary-label">Noites</span>
            </div>
          </div>

          {Object.keys(shiftCounts).length > 0 ? (
            <div className="shift-breakdown card">
              <h4 style={{ marginBottom: 14, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Distribuição de turnos
              </h4>
              {Object.entries(shiftCounts).map(([code, count]) => {
                const s = SHIFTS[code];
                if (!s) return null;
                return (
                  <div key={code} className="breakdown-row">
                    <span className="shift-chip" style={{ background: s.color, color: s.text }}>{code}</span>
                    <span className="breakdown-name">{s.name}</span>
                    <span className="breakdown-count">{count}×</span>
                    <span className="breakdown-hours">{(s.hours * count).toFixed(1)}h</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <p style={{ fontSize: 32 }}>📊</p>
              <p>Sem dados para {MONTH_NAMES[month]}.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
