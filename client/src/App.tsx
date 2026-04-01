import { useEffect, useState } from 'react';
import { format } from 'date-fns';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Telegram WebApp SDK
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initDataUnsafe?: {
          user?: { id: number; first_name: string; username?: string };
        };
        ready?: () => void;
      };
    };
  }
}

interface MealRecord {
  id: number;
  date: string;
  mealType: string;
  status: string;
}

interface User {
  id: number;
  name: string;
  timezone: string;
  mealRecords: MealRecord[];
}

interface Settings {
  breakfastTime: string;
  lunchTime: string;
  dinnerTime: string;
  reminderInterval: number;
  breakfastWords: string;
  lunchWords: string;
  dinnerWords: string;
}

function App() {
  const [activeTab, setActiveTab] = useState('jadval');
  const [users, setUsers] = useState<User[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    breakfastTime: '08:00',
    lunchTime: '12:00',
    dinnerTime: '18:00',
    reminderInterval: 60,
    breakfastWords: 'nonushta,#nonushta',
    lunchWords: 'abed,#abed,tushlik,#tushlik',
    dinnerWords: 'kechki_ovqat,#kechki_ovqat,kechki,#kechki'
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Telegram WebApp initlashtirish
    if (window.Telegram?.WebApp?.ready) {
      window.Telegram.WebApp.ready();
    }

    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const telegramId = tgUser?.id ? String(tgUser.id) : null;

    fetchData(telegramId);
  }, []);

  const fetchData = async (telegramId: string | null) => {
    try {
      const [resUsers, resSettings] = await Promise.all([
        fetch(`${API_URL}/users`).then(r => r.json()),
        fetch(`${API_URL}/settings`).then(r => r.json())
      ]);
      setUsers(resUsers || []);
      if (resSettings) setSettings(resSettings);

      // Admin tekshirish
      if (telegramId) {
        const adminRes = await fetch(`${API_URL}/check-admin/${telegramId}`).then(r => r.json());
        setIsAdmin(adminRes.isAdmin === true);
      }
    } catch (e) {
      console.error('Ma\'lumot olishda xato:', e);
    }
    setLoading(false);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      alert('✅ Sozlamalar saqlandi!');
    } catch {
      alert('❌ Xatolik yuz berdi');
    }
    setSaving(false);
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const getStatus = (user: User, type: string) => {
    const record = user.mealRecords.find(r => r.mealType === type && r.date === todayStr);
    if (!record) return 'none';
    return record.status;
  };

  const renderBadge = (status: string) => {
    if (status === 'on_time') return <span style={{color:'#22c55e',fontSize:20}}>●</span>;
    if (status === 'late') return <span style={{color:'#f59e0b',fontSize:20}}>⚠</span>;
    return <span style={{color:'#64748b',fontSize:20}}>✖</span>;
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 16
      }}>
        Yuklanmoqda...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      color: '#e2e8f0',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      padding: 16
    }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.8)',
          backdropFilter: 'blur(12px)',
          borderRadius: 16,
          padding: '16px 20px',
          marginBottom: 24,
          border: '1px solid rgba(148,163,184,0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h1 style={{
              margin: 0, fontSize: 24, fontWeight: 800,
              background: 'linear-gradient(90deg, #34d399, #22d3ee)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Temur.fit
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Ratsion Nazorati</p>
          </div>

          {/* Admin tab ni faqat admin ko'radi */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: 4, background: '#334155', borderRadius: 8, padding: 3 }}>
              <button
                type="button"
                onClick={() => setActiveTab('jadval')}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: activeTab === 'jadval' ? '#1e293b' : 'transparent',
                  color: activeTab === 'jadval' ? '#34d399' : '#94a3b8', transition: 'all 0.2s'
                }}
              >
                Jadval
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: activeTab === 'admin' ? '#1e293b' : 'transparent',
                  color: activeTab === 'admin' ? '#34d399' : '#94a3b8', transition: 'all 0.2s'
                }}
              >
                Admin
              </button>
            </div>
          )}
        </div>

        {/* Table Tab (hammaga ko'rinadi) */}
        {(activeTab === 'jadval' || !isAdmin) && (
          <div style={{
            background: 'rgba(30, 41, 59, 0.8)', backdropFilter: 'blur(12px)',
            borderRadius: 16, border: '1px solid rgba(148,163,184,0.15)', overflow: 'hidden'
          }}>
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid rgba(148,163,184,0.15)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>👥 Guruh Jadvali</h2>
              <span style={{ fontSize: 11, fontWeight: 600, background: '#334155', padding: '4px 10px', borderRadius: 6 }}>
                {todayStr}
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                <thead>
                  <tr style={{ background: 'rgba(15,23,42,0.5)' }}>
                    <th style={thStyle}>No</th>
                    <th style={{...thStyle, textAlign: 'left'}}>Ism</th>
                    <th style={thStyle}>N</th>
                    <th style={thStyle}>A</th>
                    <th style={thStyle}>K</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, idx) => (
                    <tr key={user.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                      <td style={tdStyle}>{idx + 1}</td>
                      <td style={{...tdStyle, textAlign: 'left', fontWeight: 600}}>{user.name}</td>
                      <td style={tdStyle}>{renderBadge(getStatus(user, 'nonushta'))}</td>
                      <td style={tdStyle}>{renderBadge(getStatus(user, 'abed'))}</td>
                      <td style={tdStyle}>{renderBadge(getStatus(user, 'kechki_ovqat'))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                Hali hech kim ro'yxatdan o'tmagan
              </div>
            )}
          </div>
        )}

        {/* Admin Tab — faqat admin ko'radi va Admin tabni tanlagan bo'lsa */}
        {isAdmin && activeTab === 'admin' && (
          <form onSubmit={handleSaveSettings} style={{
            background: 'rgba(30, 41, 59, 0.8)', backdropFilter: 'blur(12px)',
            borderRadius: 16, border: '1px solid rgba(148,163,184,0.15)', padding: 24
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: 18, fontWeight: 700 }}>⚙️ Sozlamalar</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>🌅 Nonushta vaqti</label>
                <input type="time" value={settings.breakfastTime}
                  onChange={e => setSettings({...settings, breakfastTime: e.target.value})}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>☀️ Tushlik vaqti</label>
                <input type="time" value={settings.lunchTime}
                  onChange={e => setSettings({...settings, lunchTime: e.target.value})}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>🌙 Kechki ovqat</label>
                <input type="time" value={settings.dinnerTime}
                  onChange={e => setSettings({...settings, dinnerTime: e.target.value})}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>⏱️ Eslatma (daqiqada)</label>
                <input type="number" value={settings.reminderInterval}
                  onChange={e => setSettings({...settings, reminderInterval: parseInt(e.target.value) || 60})}
                  style={inputStyle} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(148,163,184,0.15)', paddingTop: 20 }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 600, color: '#38bdf8' }}>📝 Taniydigan so'zlar (vergul bilan ajrating)</h3>
              
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>🌅 Nonushta u-n so'zlar</label>
                <textarea rows={2} value={settings.breakfastWords}
                  placeholder="#nonushta, nonushta, breakfast"
                  onChange={e => setSettings({...settings, breakfastWords: e.target.value})}
                  style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>☀️ Tushlik u-n so'zlar</label>
                <textarea rows={2} value={settings.lunchWords}
                  placeholder="#abed, abed, tushlik, lunch"
                  onChange={e => setSettings({...settings, lunchWords: e.target.value})}
                  style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>🌙 Kechki ovqat u-n so'zlar</label>
                <textarea rows={2} value={settings.dinnerWords}
                  placeholder="#kechki_ovqat, kechki, dinner"
                  onChange={e => setSettings({...settings, dinnerWords: e.target.value})}
                  style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>

            <button type="submit" disabled={saving} style={{
              width: '100%', marginTop: 8, padding: '14px 0',
              background: saving ? '#475569' : 'linear-gradient(90deg, #059669, #0891b2)',
              color: '#fff', fontWeight: 700, fontSize: 15,
              border: 'none', borderRadius: 12, cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}>
              {saving ? 'Saqlanmoqda...' : '💾 Saqlash'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '12px 8px', textAlign: 'center',
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  color: '#94a3b8', letterSpacing: 1
};

const tdStyle: React.CSSProperties = {
  padding: '12px 8px', textAlign: 'center', fontSize: 14
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600,
  color: '#94a3b8', marginBottom: 6
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 14,
  background: '#0f172a', border: '1px solid #334155',
  borderRadius: 8, color: '#e2e8f0', outline: 'none',
  boxSizing: 'border-box'
};

export default App;
