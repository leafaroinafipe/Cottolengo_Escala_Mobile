import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { SHIFTS } from '../../constants/shifts';
import '../Home.css';
import './CoordHome.css';

function padDate(n) { return String(n).padStart(2, '0'); }
const MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

export default function CoordHome() {
  const { profile } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [todayShifts, setTodayShifts] = useState([]);
  const [nurses, setNurses] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const hour = today.getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  useEffect(() => {
    const q = query(collection(db, 'solicitacoes'), where('status', '==', 'pendente'));
    return onSnapshot(q, snap => setPendingCount(snap.size));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unsub = onSnapshot(collection(db, 'funcionarios'), async snap => {
      if (cancelled) return;
      const nurseList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNurses(nurseList);
      const monthNum = today.getMonth() + 1;
      const day = today.getDate();
      const snaps = await Promise.all(
        nurseList.map(n => getDoc(doc(db, 'escalas', `${n.id}_${today.getFullYear()}_${monthNum}`)))
      );
      if (cancelled) return;
      const shifts = snaps.map((snap, i) => {
        const code = snap.exists() ? snap.data()[`d${day}`] : null;
        return { nurse: nurseList[i], code: code || 'OFF' };
      });
      setTodayShifts(shifts);
      setLoading(false);
    });
    return () => { cancelled = true; unsub(); };
  }, []);

  const workingToday = todayShifts.filter(s => s.code !== 'OFF').length;

  return (
    <div className="home-page fade-in">
      <div className="home-topbar">
        <div>
          <p className="home-greeting">{greeting},</p>
          <p className="home-name">{profile?.name?.split(' ')[0] ?? 'Coordenadora'}</p>
        </div>
        <div className="home-avatar">{profile?.name?.[0]?.toUpperCase() ?? 'C'}</div>
      </div>

      <div className="coord-stats">
        <Link to="/solicitacoes" className={`stat-card card${pendingCount > 0 ? ' stat-card--pending' : ''}`}>
          <span className="stat-value">{pendingCount}</span>
          <span className="stat-label">Pendentes</span>
        </Link>
        <div className="stat-card card">
          <span className="stat-value">{workingToday}</span>
          <span className="stat-label">Hoje</span>
        </div>
        <div className="stat-card card">
          <span className="stat-value">{nurses.length}</span>
          <span className="stat-label">Equipe</span>
        </div>
      </div>

      <h3 className="section-title">
        Equipe hoje · {padDate(today.getDate())} de {MONTHS[today.getMonth()]}
      </h3>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <span className="spinner" />
        </div>
      ) : (
        <div className="upcoming-list">
          {todayShifts.map(({ nurse, code }) => {
            const shift = SHIFTS[code];
            return (
              <div key={nurse.id} className="upcoming-item">
                <span className="nurse-initials">{nurse.initials}</span>
                <span className="upcoming-name" style={{ flex: 1 }}>{nurse.name}</span>
                {code && code !== 'OFF' ? (
                  <span className="shift-chip" style={{ background: shift?.color, color: shift?.text }}>
                    {code}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Folga</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
