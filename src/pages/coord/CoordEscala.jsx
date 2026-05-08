import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { SHIFTS, NURSES_DEFAULT } from '../../constants/shifts';
import '../MinhaEscala.css';
import './CoordEscala.css';

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DOW_NAMES   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const DOW_FULL    = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];

function getInitials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase()
                        : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export default function CoordEscala() {
  const now = new Date();
  const [year,       setYear]       = useState(now.getFullYear());
  const [month,      setMonth]      = useState(now.getMonth());
  const [nurses,     setNurses]     = useState(NURSES_DEFAULT);
  const [selectedId, setSelectedId] = useState('all');
  const [sched,      setSched]      = useState({});        // single nurse
  const [allScheds,  setAllScheds]  = useState({});        // all nurses { nurseId: { d: code } }
  const [loading,    setLoading]    = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);

  const days     = daysInMonth(year, month);
  const monthNum = month + 1;
  const firstDow = new Date(year, month, 1).getDay();
  const todayDay = now.getMonth() === month && now.getFullYear() === year ? now.getDate() : -1;

  /* Carrega lista de funcionárias em tempo real */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'funcionarios'), snap => {
      if (!snap.empty) setNurses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  /* Carrega escala de uma funcionária */
  useEffect(() => {
    if (selectedId === 'all' || !selectedId) return;
    let cancelled = false;
    setLoading(true);
    setSched({});
    setSelectedDay(null);
    getDoc(doc(db, 'escalas', `${selectedId}_${year}_${monthNum}`))
      .then(snap => {
        if (cancelled) return;
        const map = {};
        if (snap.exists()) {
          const data = snap.data();
          for (let d = 1; d <= 31; d++) { if (data[`d${d}`]) map[d] = data[`d${d}`]; }
        }
        setSched(map);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, year, monthNum]);

  /* Carrega escalas de todas as funcionárias em paralelo */
  useEffect(() => {
    if (selectedId !== 'all' || nurses.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setAllScheds({});
    setSelectedDay(null);
    Promise.all(
      nurses.map(n => getDoc(doc(db, 'escalas', `${n.id}_${year}_${monthNum}`)))
    ).then(snaps => {
      if (cancelled) return;
      const all = {};
      snaps.forEach((snap, i) => {
        const map = {};
        if (snap.exists()) {
          const data = snap.data();
          for (let d = 1; d <= 31; d++) { if (data[`d${d}`]) map[d] = data[`d${d}`]; }
        }
        all[nurses[i].id] = map;
      });
      setAllScheds(all);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, nurses, year, monthNum]);

  function prevMonth() {
    setSelectedDay(null);
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    setSelectedDay(null);
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  /* Células do calendário */
  const cells = useMemo(() => {
    const arr = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= days; d++) arr.push(d);
    return arr;
  }, [firstDow, days]);

  /* Stats da funcionária selecionada (modo single) */
  const singleStats = useMemo(() => {
    let horas = 0, noites = 0, trabalhados = 0;
    Object.values(sched).forEach(code => {
      const s = SHIFTS[code];
      if (s && s.hours > 0) { horas += s.hours; trabalhados++; }
      if (code === 'N') noites++;
    });
    return { horas, noites, trabalhados };
  }, [sched]);

  /* Detalhes de um dia no modo "todos" */
  const dayDetail = useMemo(() => {
    if (selectedId !== 'all' || !selectedDay) return null;
    return nurses
      .map(n => ({ nurse: n, code: allScheds[n.id]?.[selectedDay] }))
      .filter(({ code }) => code && code !== 'OFF' && SHIFTS[code]?.hours > 0)
      .sort((a, b) => (SHIFTS[a.code]?.period ?? '') < (SHIFTS[b.code]?.period ?? '') ? -1 : 1);
  }, [selectedId, selectedDay, nurses, allScheds]);

  const selectedNurse = nurses.find(n => n.id === selectedId);

  return (
    <div className="minha-escala fade-in">

      {/* ── Header ── */}
      <div className="coord-escala-header">
        <h2 className="coord-escala-title">Escala da Equipe</h2>
        <div className="cal-month-nav" style={{ flex: 1, maxWidth: 220 }}>
          <button className="cal-nav-btn" onClick={prevMonth} aria-label="Mês anterior">‹</button>
          <span className="cal-month-label">{MONTH_NAMES[month].slice(0,3)} {year}</span>
          <button className="cal-nav-btn" onClick={nextMonth} aria-label="Próximo mês">›</button>
        </div>
      </div>

      {/* ── Seletor de funcionária ── */}
      <div className="nurse-select-wrap">
        <select
          className="nurse-select"
          value={selectedId}
          onChange={e => { setSelectedId(e.target.value); setSelectedDay(null); }}
        >
          <option value="all">Todas as funcionárias</option>
          {nurses.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <svg className="nurse-select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {/* ── Resumo (modo single) ── */}
      {selectedId !== 'all' && (
        <div className="escala-summary">
          <div className="summary-item">
            <span className="summary-value">{singleStats.horas}h</span>
            <span className="summary-label">Total</span>
          </div>
          <div className="summary-item">
            <span className="summary-value">{singleStats.noites}</span>
            <span className="summary-label">Noites</span>
          </div>
          <div className="summary-item">
            <span className="summary-value">{singleStats.trabalhados}</span>
            <span className="summary-label">Dias trab.</span>
          </div>
        </div>
      )}

      {/* ── Calendário ── */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding: 40 }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : (
        <div className="cal-card">
          <div className="cal-dow-row">
            {DOW_NAMES.map((d, i) => (
              <span key={d} className={`cal-dow${i===0?' cal-dow--sun':i===6?' cal-dow--sat':''}`}>{d}</span>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((day, idx) => {
              if (!day) return <div key={`e-${idx}`} className="cal-cell cal-cell--empty" />;
              const dow    = (firstDow + day - 1) % 7;
              const isSun  = dow === 0;
              const isSat  = dow === 6;
              const isToday = day === todayDay;
              const isSelected = selectedDay === day && selectedId === 'all';

              if (selectedId === 'all') {
                /* Modo Todos — mostrar chips de turno por funcionária */
                const working = nurses
                  .map(n => ({ n, code: allScheds[n.id]?.[day] }))
                  .filter(({ code }) => code && code !== 'OFF' && SHIFTS[code]?.hours > 0);
                const total = working.length;
                const coverColor = total === 0 ? 'var(--text-disabled)'
                                 : total <= 1  ? '#ef4444'
                                 : total <= 2  ? '#f59e0b'
                                 : '#22c55e';

                return (
                  <div
                    key={day}
                    className={[
                      'cal-cell cal-cell--all',
                      isToday    ? 'cal-cell--today'    : '',
                      isSun      ? 'cal-cell--sunday'   : '',
                      isSat      ? 'cal-cell--saturday' : '',
                      isSelected ? 'cal-cell--selected' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                  >
                    <span className="cal-day-num">{day}</span>
                    <span className="cal-all-count" style={{ color: coverColor }}>{total}</span>
                    <div className="cal-all-dots">
                      {working.slice(0, 3).map(({ n, code }) => (
                        <span
                          key={n.id}
                          className="cal-all-dot"
                          style={{ background: SHIFTS[code]?.color ?? 'var(--accent)' }}
                          title={`${n.name} — ${code}`}
                        />
                      ))}
                      {working.length > 3 && (
                        <span className="cal-all-dot-more">+{working.length - 3}</span>
                      )}
                    </div>
                  </div>
                );
              }

              /* Modo single — igual ao MinhaEscala */
              const code  = sched[day];
              const shift = code ? SHIFTS[code] : null;
              const hasShift = shift && code !== 'OFF';
              return (
                <div
                  key={day}
                  className={[
                    'cal-cell',
                    isToday  ? 'cal-cell--today'    : '',
                    isSun    ? 'cal-cell--sunday'   : '',
                    isSat    ? 'cal-cell--saturday' : '',
                    hasShift ? 'cal-cell--shift'    : '',
                    !code || code === 'OFF' ? 'cal-cell--off' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <span className="cal-day-num">{day}</span>
                  {hasShift && (
                    <span className="cal-shift" style={{ background: shift.color, color: shift.text }}>
                      {code}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Painel de detalhe do dia (modo Todos) ── */}
      {selectedId === 'all' && selectedDay && dayDetail && (
        <div className="day-detail-panel slide-up">
          <div className="day-detail-header">
            <div>
              <p className="day-detail-dow">{DOW_FULL[(firstDow + selectedDay - 1) % 7]}</p>
              <p className="day-detail-date">
                {String(selectedDay).padStart(2,'0')}/{String(monthNum).padStart(2,'0')}/{year}
              </p>
            </div>
            <button className="day-detail-close" onClick={() => setSelectedDay(null)} aria-label="Fechar">×</button>
          </div>

          {dayDetail.length === 0 ? (
            <p className="day-detail-empty">Nenhuma funcionária escalada neste dia.</p>
          ) : (
            <>
              <div className="day-detail-list">
                {dayDetail.map(({ nurse: n, code }) => {
                  const s = SHIFTS[code];
                  return (
                    <div key={n.id} className="day-detail-row">
                      <div className="day-detail-avatar">{getInitials(n.name)}</div>
                      <span className="day-detail-name">{n.name}</span>
                      <span className="cal-shift" style={{ background: s.color, color: s.text }}>{code}</span>
                      <span className="day-detail-hours">{s.hours}h</span>
                    </div>
                  );
                })}
              </div>
              <div className="day-detail-summary">
                <span>{dayDetail.length} funcionária{dayDetail.length !== 1 ? 's' : ''}</span>
                <span>{dayDetail.reduce((acc, { code }) => acc + (SHIFTS[code]?.hours ?? 0), 0).toFixed(1)}h cobertura total</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Legenda ── */}
      <div className="shifts-legend-mobile">
        {Object.entries(SHIFTS).filter(([k]) => k !== 'OFF').map(([code, s]) => (
          <div key={code} className="legend-row">
            <span className="cal-shift" style={{ background: s.color, color: s.text }}>{code}</span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.name}</span>
            {s.hours > 0 && <span className="legend-hours">{s.hours}h</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
