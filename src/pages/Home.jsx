import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { SHIFTS } from '../constants/shifts';
import './Home.css';

function padDate(n) { return String(n).padStart(2, '0'); }

export default function Home() {
  const { profile, user } = useAuth();
  const [todayShift,  setTodayShift]  = useState(null);
  const [nextShifts,  setNextShifts]  = useState([]);
  const [pendingReqs, setPendingReqs] = useState(0);
  const [loading,     setLoading]     = useState(true);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${padDate(today.getMonth()+1)}-${padDate(today.getDate())}`;
  const nurseId  = profile?.nurseId ?? user?.uid;

  useEffect(() => {
    if (!nurseId) { setLoading(false); return; }
    const monthNum = today.getMonth() + 1;
    getDoc(doc(db, 'escalas', `${nurseId}_${today.getFullYear()}_${monthNum}`))
      .then(snap => {
        const day = today.getDate();
        if (snap.exists()) {
          const data = snap.data();
          const todayCode = data[`d${day}`];
          setTodayShift(todayCode ? SHIFTS[todayCode] ?? null : null);
          const upcoming = [];
          for (let d = day + 1; d <= 31 && upcoming.length < 5; d++) {
            if (data[`d${d}`] && data[`d${d}`] !== 'OFF') {
              upcoming.push({ dia: d, turno: data[`d${d}`], shift: SHIFTS[data[`d${d}`]] });
            }
          }
          setNextShifts(upcoming);
        } else {
          setTodayShift(null);
          setNextShifts([]);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [nurseId]);

  useEffect(() => {
    if (!nurseId) return;
    const q = query(
      collection(db, 'solicitacoes'),
      where('nurseId', '==', nurseId),
      where('status', '==', 'pendente'),
    );
    const unsub = onSnapshot(q, snap => setPendingReqs(snap.size));
    return unsub;
  }, [nurseId]);

  const hour     = today.getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const MONTHS   = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

  return (
    <div className="home-page fade-in">
      <div className="home-topbar">
        <div>
          <p className="home-greeting">{greeting},</p>
          <p className="home-name">{profile?.name?.split(' ')[0] ?? 'Olá'}</p>
        </div>
        <div className="home-avatar">{profile?.name?.[0]?.toUpperCase() ?? 'U'}</div>
      </div>

      {loading ? (
        <div className="home-loading"><span className="spinner spinner-lg" /></div>
      ) : (
        <>
          <div className="today-card">
            <p className="today-label">Hoje · {padDate(today.getDate())} de {MONTHS[today.getMonth()]}</p>
            {todayShift ? (
              <div className="today-shift">
                <span
                  className="shift-chip"
                  style={{ background: todayShift.color, color: todayShift.text, width: 48, height: 40, fontSize: 14 }}
                >
                  {Object.entries(SHIFTS).find(([,v]) => v === todayShift)?.[0] ?? '?'}
                </span>
                <div>
                  <p className="today-shift-name">{todayShift.name}</p>
                  <p className="today-shift-hours">{todayShift.hours}h de trabalho</p>
                </div>
              </div>
            ) : (
              <p className="today-rest">Dia de descanso</p>
            )}
          </div>

          {nextShifts.length > 0 && (
            <div className="upcoming-section">
              <h3 className="section-title">Próximos turnos</h3>
              <div className="upcoming-list">
                {nextShifts.map(({ dia, turno, shift }) => (
                  <div key={dia} className="upcoming-item">
                    <div className="upcoming-date">
                      <span>{padDate(dia)}</span>
                      <span className="upcoming-month">{MONTHS[today.getMonth()]}</span>
                    </div>
                    <div className="upcoming-info">
                      <span
                        className="shift-chip"
                        style={{ background: shift?.color, color: shift?.text }}
                        title={shift?.name}
                      >
                        {turno}
                      </span>
                      <span className="upcoming-name">{shift?.name ?? turno}</span>
                    </div>
                    <span className="upcoming-hours">{shift?.hours ?? 0}h</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingReqs > 0 && (
            <Link to="/solicitacoes" className="pending-banner">
              <span>⏳ {pendingReqs} solicitaç{pendingReqs > 1 ? 'ões' : 'ão'} pendente{pendingReqs > 1 ? 's' : ''}</span>
              <span>→</span>
            </Link>
          )}
        </>
      )}
    </div>
  );
}
