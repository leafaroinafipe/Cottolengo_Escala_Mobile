import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
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
    if (!nurseId) return;
    const monthStr = `${today.getFullYear()}-${padDate(today.getMonth()+1)}`;
    const q = query(
      collection(db, 'escala'),
      where('nurseId', '==', nurseId),
      where('mes', '==', monthStr),
    );
    const unsub = onSnapshot(q, snap => {
      const entries = snap.docs.map(d => d.data());
      const day = today.getDate();
      const todayEntry = entries.find(e => e.dia === day);
      setTodayShift(todayEntry ? SHIFTS[todayEntry.turno] ?? null : null);

      const upcoming = entries
        .filter(e => e.dia > day)
        .sort((a, b) => a.dia - b.dia)
        .slice(0, 5)
        .map(e => ({ dia: e.dia, turno: e.turno, shift: SHIFTS[e.turno] }));
      setNextShifts(upcoming);
      setLoading(false);
    });
    return unsub;
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
            <a href="/solicitacoes" className="pending-banner">
              <span>⏳ {pendingReqs} solicitaç{pendingReqs > 1 ? 'ões' : 'ão'} pendente{pendingReqs > 1 ? 's' : ''}</span>
              <span>→</span>
            </a>
          )}
        </>
      )}
    </div>
  );
}
