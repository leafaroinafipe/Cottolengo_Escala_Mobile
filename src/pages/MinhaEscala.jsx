import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { SHIFTS } from '../constants/shifts';
import './MinhaEscala.css';

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DOW_NAMES   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

export default function MinhaEscala() {
  const { profile, user } = useAuth();
  const now     = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [sched, setSched] = useState({});
  const [loading, setLoading] = useState(true);

  const nurseId = profile?.nurseId ?? user?.uid;
  const days    = daysInMonth(year, month);

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

  /* Calcular totais do mês */
  let totalHoras = 0;
  let totalNoturn = 0;
  Object.values(sched).forEach(code => {
    const s = SHIFTS[code];
    if (s) { totalHoras += s.hours; if (code === 'N') totalNoturn++; }
  });

  /* Grid do calendário */
  const firstDow = new Date(year, month, 1).getDay();
  const cells    = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  const todayDay  = now.getMonth() === month && now.getFullYear() === year ? now.getDate() : -1;

  return (
    <div className="minha-escala fade-in">
      <div className="escala-header">
        <h2>Minha Escala</h2>
        <div className="month-nav">
          <button className="btn btn-ghost btn-sm" onClick={prevMonth}>‹</button>
          <span className="month-label">{MONTH_NAMES[month].slice(0,3)} {year}</span>
          <button className="btn btn-ghost btn-sm" onClick={nextMonth}>›</button>
        </div>
      </div>

      <div className="escala-summary">
        <div className="summary-item">
          <span className="summary-value">{totalHoras}h</span>
          <span className="summary-label">Total</span>
        </div>
        <div className="summary-item">
          <span className="summary-value">{totalNoturn}</span>
          <span className="summary-label">Noites</span>
        </div>
        <div className="summary-item">
          <span className="summary-value">{Object.keys(sched).length}</span>
          <span className="summary-label">Dias trab.</span>
        </div>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding: 40 }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : (
        <div className="cal-grid-wrapper">
          <div className="cal-dow-row">
            {DOW_NAMES.map(d => <span key={d} className="cal-dow">{d}</span>)}
          </div>
          <div className="cal-grid">
            {cells.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} className="cal-cell cal-cell--empty" />;
              const code  = sched[day];
              const shift = code ? SHIFTS[code] : null;
              const isToday = day === todayDay;
              return (
                <div
                  key={day}
                  className={`cal-cell${isToday ? ' cal-cell--today' : ''}${!code || code === 'OFF' ? ' cal-cell--off' : ''}`}
                >
                  <span className="cal-day-num">{day}</span>
                  {shift && code !== 'OFF' && (
                    <span
                      className="cal-shift"
                      style={{ background: shift.color, color: shift.text }}
                    >
                      {code}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="shifts-legend-mobile">
        {Object.entries(SHIFTS).filter(([k]) => k !== 'OFF').map(([code, s]) => (
          <div key={code} className="legend-row">
            <span className="shift-chip" style={{ background: s.color, color: s.text }}>{code}</span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.name}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>{s.hours}h</span>
          </div>
        ))}
      </div>
    </div>
  );
}
