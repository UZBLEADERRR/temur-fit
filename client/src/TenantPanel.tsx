import { useEffect, useState } from 'react';
import { format, addDays, subDays } from 'date-fns';
import { apiGet, apiSend } from './api';

interface ReminderOverride { id: number; userId: number; mealType: string; muted: boolean; }
interface MealRecord { id: number; date: string; mealType: string; status: string; }
interface User { id: number; name: string; timezone: string; mealRecords: MealRecord[]; reminderOverrides: ReminderOverride[]; }
interface Settings {
  breakfastTime: string; lunchTime: string; dinnerTime: string; reminderInterval: number;
  breakfastWords: string; lunchWords: string; dinnerWords: string; maxReminders: number;
}

export default function TenantPanel({ tid }: { tid: number }) {
  const [activeTab, setActiveTab] = useState('jadval');
  const [users, setUsers] = useState<User[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tenantName, setTenantName] = useState('Temur.fit');
  const [settings, setSettings] = useState<Settings>({
    breakfastTime: '08:00', lunchTime: '12:00', dinnerTime: '18:00', reminderInterval: 60,
    breakfastWords: 'nonushta,#nonushta', lunchWords: 'abed,#abed,tushlik,#tushlik',
    dinnerWords: 'kechki_ovqat,#kechki_ovqat,kechki,#kechki', maxReminders: 3
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [togglingMute, setTogglingMute] = useState<string | null>(null);

  const base = `/tenant/${tid}`;

  useEffect(() => {
    if (window.Telegram?.WebApp?.ready) window.Telegram.WebApp.ready();
    if (window.Telegram?.WebApp?.expand) window.Telegram.WebApp.expand();
    (async () => {
      try {
        const [info, resSettings, me] = await Promise.all([
          apiGet<{ name: string }>(`${base}/info`),
          apiGet<Settings>(`${base}/settings`),
          apiGet<{ isAdmin: boolean }>(`${base}/me`)
        ]);
        if (info?.name) setTenantName(info.name);
        if (resSettings && (resSettings as any).breakfastTime) setSettings(resSettings);
        setIsAdmin(me?.isAdmin === true);
        await fetchUsersByDate(selectedDate);
      } catch (e) {
        console.error('Yuklashda xato:', e);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchUsersByDate(selectedDate); /* eslint-disable-next-line */ }, [selectedDate]);

  const fetchUsersByDate = async (dateStr: string) => {
    try {
      const data = await apiGet<User[]>(`${base}/users-by-date/${dateStr}`);
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiSend<{ error?: string }>(`${base}/settings`, 'POST', settings);
      if (res?.error) alert('❌ ' + res.error);
      else alert('✅ Sozlamalar saqlandi!');
    } catch { alert('❌ Xatolik yuz berdi'); }
    setSaving(false);
  };

  const handleToggleMute = async (userId: number, mealType: string, currentlyMuted: boolean) => {
    const key = `${userId}-${mealType}`;
    setTogglingMute(key);
    try {
      await apiSend(`${base}/reminder-overrides`, 'POST', { userId, mealType, muted: !currentlyMuted });
      await fetchUsersByDate(selectedDate);
    } catch (e) { console.error(e); }
    setTogglingMute(null);
  };

  const isReminderMuted = (user: User, mealType: string) =>
    user.reminderOverrides?.some(o => o.mealType === mealType && o.muted) || false;

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isToday = selectedDate === todayStr;

  const getStatus = (user: User, type: string) => {
    const record = user.mealRecords.find(r => r.mealType === type && r.date === selectedDate);
    return record ? record.status : 'none';
  };

  const renderBadge = (status: string) => {
    if (status === 'on_time') return <span style={{ color: '#22c55e', fontSize: 20 }}>●</span>;
    if (status === 'late') return <span style={{ color: '#f59e0b', fontSize: 20 }}>⚠</span>;
    return <span style={{ color: '#64748b', fontSize: 20 }}>✖</span>;
  };

  const goToPrevDay = () => setSelectedDate(format(subDays(new Date(selectedDate), 1), 'yyyy-MM-dd'));
  const goToNextDay = () => { const n = addDays(new Date(selectedDate), 1); if (n <= new Date()) setSelectedDate(format(n, 'yyyy-MM-dd')); };
  const goToToday = () => setSelectedDate(todayStr);

  if (loading) {
    return <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 16 }}>Yuklanmoqda...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top left,#1e293b,#0f172a)', color: '#f1f5f9', fontFamily: "'Inter',sans-serif", padding: '12px 8px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ background: 'rgba(30,41,59,0.7)', backdropFilter: 'blur(16px)', borderRadius: 20, padding: '12px 16px', marginBottom: 20, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, background: 'linear-gradient(to right,#10b981,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: -0.5 }}>{tenantName}</h1>
            <p style={{ margin: 0, fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>{isAdmin ? 'Admin Pro' : 'Reyting'}</p>
          </div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 2, background: 'rgba(15,23,42,0.5)', borderRadius: 10, padding: 2 }}>
              {(['jadval', 'eslatma', 'admin'] as const).map(tab => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: activeTab === tab ? '#10b981' : 'transparent', color: activeTab === tab ? '#fff' : '#94a3b8' }}>
                  {tab === 'jadval' ? 'Jadval' : tab === 'eslatma' ? 'Eslatma' : 'Settings'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* JADVAL */}
        {(activeTab === 'jadval' || !isAdmin) && (
          <div style={cardStyle}>
            <div style={{ padding: '12px 16px', borderBottom: borderStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" onClick={goToPrevDay} style={navBtnStyle}>◀</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="date" value={selectedDate} max={todayStr} onChange={e => setSelectedDate(e.target.value)}
                  style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#f1f5f9', padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', outline: 'none', colorScheme: 'dark' }} />
                {!isToday && <button type="button" onClick={goToToday} style={{ background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none', borderRadius: 8, color: '#fff', padding: '6px 10px', fontSize: 10, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.5 }}>BUGUN</button>}
              </div>
              <button type="button" onClick={goToNextDay} disabled={isToday} style={{ ...navBtnStyle, opacity: isToday ? 0.3 : 1, cursor: isToday ? 'not-allowed' : 'pointer' }}>▶</button>
            </div>

            <div style={{ padding: '12px 20px', borderBottom: borderStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>👥 Reyting</h2>
              <span style={{ fontSize: 10, fontWeight: 800, background: isToday ? '#10b98122' : '#f59e0b22', color: isToday ? '#10b981' : '#f59e0b', padding: '4px 8px', borderRadius: 6, border: `1px solid ${isToday ? '#10b98144' : '#f59e0b44'}` }}>{isToday ? '📅 Bugun' : `📅 ${selectedDate}`}</span>
            </div>

            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(15,23,42,0.3)' }}>
                    <th style={thStyle}>#</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Ism</th>
                    <th style={thStyle}>N</th>
                    <th style={thStyle}>A</th>
                    <th style={thStyle}>K</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, idx) => (
                    <tr key={user.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ ...tdStyle, color: '#64748b', fontSize: 11 }}>{idx + 1}</td>
                      <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600, color: '#e2e8f0' }}>{user.name}</td>
                      <td style={tdStyle}>{renderBadge(getStatus(user, 'nonushta'))}</td>
                      <td style={tdStyle}>{renderBadge(getStatus(user, 'abed'))}</td>
                      <td style={tdStyle}>{renderBadge(getStatus(user, 'kechki_ovqat'))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users.length === 0 && <div style={emptyStyle}>Hali ma'lumot yo'q...</div>}
          </div>
        )}

        {/* ESLATMA */}
        {isAdmin && activeTab === 'eslatma' && (
          <div style={cardStyle}>
            <div style={{ padding: '16px 20px', borderBottom: borderStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>🔔 Eslatma Boshqaruvi</h2>
              <span style={{ fontSize: 10, fontWeight: 700, background: '#f43f5e22', color: '#f43f5e', padding: '4px 8px', borderRadius: 6, border: '1px solid #f43f5e44' }}>Har bir odam uchun</span>
            </div>
            <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Legend color="#22c55e" text="Yoqilgan" />
              <Legend color="#ef4444" text="O'chirilgan" />
            </div>
            <div>
              {users.map(user => (
                <div key={user.id} style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0' }}>{user.name}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {(['nonushta', 'abed', 'kechki_ovqat'] as const).map(mealType => {
                      const muted = isReminderMuted(user, mealType);
                      const isToggling = togglingMute === `${user.id}-${mealType}`;
                      const label = mealType === 'nonushta' ? '🌅' : mealType === 'abed' ? '☀️' : '🌙';
                      return (
                        <button key={mealType} type="button" disabled={isToggling} onClick={() => handleToggleMute(user.id, mealType, muted)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 10, border: `1px solid ${muted ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`, background: muted ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: muted ? '#ef4444' : '#22c55e', fontSize: 11, fontWeight: 700, cursor: isToggling ? 'wait' : 'pointer', opacity: isToggling ? 0.5 : 1 }}>
                          <span>{label}</span><span style={{ fontSize: 13 }}>{muted ? '✖' : '✔'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {users.length === 0 && <div style={emptyStyle}>Hali foydalanuvchilar yo'q...</div>}
          </div>
        )}

        {/* SETTINGS */}
        {isAdmin && activeTab === 'admin' && (
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SettingsCard title="🌅 Nonushta" color="#fbbf24"><Field label="Ideal vaqt" value={settings.breakfastTime} onChange={v => setSettings({ ...settings, breakfastTime: v })} type="time" /></SettingsCard>
              <SettingsCard title="☀️ Tushlik" color="#f59e0b"><Field label="Ideal vaqt" value={settings.lunchTime} onChange={v => setSettings({ ...settings, lunchTime: v })} type="time" /></SettingsCard>
              <SettingsCard title="🌙 Kechki" color="#818cf8"><Field label="Ideal vaqt" value={settings.dinnerTime} onChange={v => setSettings({ ...settings, dinnerTime: v })} type="time" /></SettingsCard>
              <SettingsCard title="🔔 Bildirishnomalar" color="#f43f5e">
                <div style={grid2}>
                  <Field label="Oraliq (daq)" value={settings.reminderInterval} onChange={v => setSettings({ ...settings, reminderInterval: parseInt(v) || 60 })} type="number" />
                  <Field label="Max Eslatma" value={settings.maxReminders} onChange={v => setSettings({ ...settings, maxReminders: parseInt(v) || 3 })} type="number" />
                </div>
              </SettingsCard>
              <SettingsCard title="📝 Kalit so'zlar" color="#38bdf8">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <TextAreaField label="🌅 Nonushta uchun" value={settings.breakfastWords} onChange={v => setSettings({ ...settings, breakfastWords: v })} />
                  <TextAreaField label="☀️ Tushlik uchun" value={settings.lunchWords} onChange={v => setSettings({ ...settings, lunchWords: v })} />
                  <TextAreaField label="🌙 Kechki uchun" value={settings.dinnerWords} onChange={v => setSettings({ ...settings, dinnerWords: v })} />
                </div>
              </SettingsCard>
            </div>
            <button type="submit" disabled={saving} style={{ width: '100%', padding: 16, background: saving ? '#334155' : 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', fontWeight: 800, fontSize: 15, border: 'none', borderRadius: 16, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 10px 15px -3px rgba(16,185,129,0.4)', marginBottom: 40 }}>
              {saving ? 'SAQLANMOQDA...' : 'SAQLASH'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ===== shared bits =====
const borderStyle = '1px solid rgba(255,255,255,0.05)';
const cardStyle: React.CSSProperties = { background: 'rgba(30,41,59,0.6)', backdropFilter: 'blur(12px)', borderRadius: 20, border: borderStyle, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' };
const emptyStyle: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13, fontStyle: 'italic' };

const Legend = ({ color, text }: { color: string; text: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
    <span style={{ fontSize: 10, color: '#94a3b8' }}>{text}</span>
  </div>
);

const SettingsCard = ({ title, children, color }: { title: string; children: React.ReactNode; color: string }) => (
  <div style={{ background: 'rgba(30,41,59,0.4)', borderRadius: 16, padding: 16, border: '1px solid rgba(255,255,255,0.03)' }}>
    <h3 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</h3>
    {children}
  </div>
);

const Field = ({ label, value, onChange, type }: { label: string; value: string | number; onChange: (v: string) => void; type: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '8px 10px', fontSize: 13, fontWeight: 600, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, color: '#f1f5f9', outline: 'none' }} />
  </div>
);

const TextAreaField = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{label}</label>
    <textarea rows={2} value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: 10, fontSize: 13, fontWeight: 500, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, color: '#f1f5f9', outline: 'none', resize: 'none', lineHeight: 1.4 }} />
  </div>
);

const navBtnStyle: React.CSSProperties = { background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#94a3b8', padding: '8px 12px', fontSize: 14, fontWeight: 800, cursor: 'pointer' };
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
const thStyle: React.CSSProperties = { padding: '14px 12px', textAlign: 'center', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: 1 };
const tdStyle: React.CSSProperties = { padding: '14px 12px', textAlign: 'center', fontSize: 13 };
