import { useEffect, useState } from 'react';
import { apiGet, apiSend } from './api';

interface Tenant {
  id: number;
  name: string;
  botUsername: string | null;
  groupId: string | null;
  active: boolean;
  running: boolean;
  userCount: number;
  createdAt: string;
  tokenPreview: string;
}

export default function SuperPanel() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isSuper, setIsSuper] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [botToken, setBotToken] = useState('');
  const [groupId, setGroupId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const me = await apiGet<{ isSuper: boolean }>('/super/me');
        setIsSuper(me.isSuper);
        if (me.isSuper) await loadTenants();
      } catch { /* ignore */ }
      setAuthChecked(true);
      setLoading(false);
    })();
  }, []);

  const loadTenants = async () => {
    const data = await apiGet<Tenant[]>('/super/tenants');
    setTenants(Array.isArray(data) ? data : []);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!botToken.trim()) { setError('Bot token kiriting'); return; }
    setSubmitting(true);
    try {
      const res = await apiSend<{ id?: number; error?: string }>('/super/tenants', 'POST', {
        botToken: botToken.trim(), groupId: groupId.trim(), name: name.trim()
      });
      if (res.error) { setError(res.error); }
      else {
        setName(''); setBotToken(''); setGroupId(''); setShowForm(false);
        await loadTenants();
      }
    } catch {
      setError('Server xatosi');
    }
    setSubmitting(false);
  };

  const toggleActive = async (t: Tenant) => {
    await apiSend(`/super/tenants/${t.id}`, 'PATCH', { active: !t.active });
    await loadTenants();
  };

  const removeTenant = async (t: Tenant) => {
    if (!confirm(`"${t.name}" botini o'chirasizmi? Barcha ma'lumotlari o'chadi.`)) return;
    await apiSend(`/super/tenants/${t.id}`, 'DELETE');
    await loadTenants();
  };

  if (loading) return <Center>Yuklanmoqda...</Center>;
  if (authChecked && !isSuper) {
    return <Center>⛔️ Sizda super-admin huquqi yo'q.<br />Bu panel faqat super-admin uchun.</Center>;
  }

  return (
    <Shell>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: border }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, background: 'linear-gradient(to right,#10b981,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              👑 Super Admin
            </h1>
            <p style={{ margin: 0, fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Temur.fit SAAS · {tenants.length} bot</p>
          </div>
          <button type="button" onClick={() => setShowForm(v => !v)} style={primaryBtn}>
            {showForm ? '✕ Yopish' : '+ Yangi bot'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleAdd} style={{ padding: 18, borderBottom: border, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Nomi (ixtiyoriy)" value={name} onChange={setName} placeholder="Masalan: Toshkent guruh" />
            <Field label="Bot Token *" value={botToken} onChange={setBotToken} placeholder="123456:ABC-DEF..." />
            <Field label="Guruh ID (ixtiyoriy)" value={groupId} onChange={setGroupId} placeholder="-1001234567890" />
            <p style={{ margin: 0, fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
              💡 Guruh ID ni keyin botni guruhga qo'shib <b>/setgroup</b> orqali ham bog'lash mumkin.
            </p>
            {error && <div style={{ color: '#f43f5e', fontSize: 12, fontWeight: 600 }}>⚠️ {error}</div>}
            <button type="submit" disabled={submitting} style={{ ...primaryBtn, width: '100%', padding: 12, opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Qo\'shilmoqda...' : '🚀 Botni qo\'shish va ishga tushirish'}
            </button>
          </form>
        )}

        <div>
          {tenants.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13, fontStyle: 'italic' }}>
              Hali bot qo'shilmagan. "+ Yangi bot" tugmasini bosing.
            </div>
          )}
          {tenants.map(t => (
            <div key={t.id} style={{ padding: '14px 18px', borderBottom: border, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.running ? '#22c55e' : '#ef4444', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                  {t.botUsername ? `@${t.botUsername}` : t.tokenPreview} · 👥 {t.userCount}
                </div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                  {t.groupId ? `Guruh: ${t.groupId}` : '⚠️ Guruh ulanmagan'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => toggleActive(t)} style={t.active ? onBtn : offBtn}>
                  {t.active ? 'Faol' : 'O\'chiq'}
                </button>
                <button type="button" onClick={() => removeTenant(t)} style={delBtn}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

// ===== UI helpers =====
const border = '1px solid rgba(255,255,255,0.06)';
const card: React.CSSProperties = {
  background: 'rgba(30,41,59,0.6)', backdropFilter: 'blur(12px)', borderRadius: 20,
  border, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
};
const primaryBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none',
  borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer'
};
const onBtn: React.CSSProperties = {
  background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)',
  borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer'
};
const offBtn: React.CSSProperties = { ...onBtn, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' };
const delBtn: React.CSSProperties = {
  background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)',
  borderRadius: 8, padding: '6px 9px', fontSize: 13, cursor: 'pointer'
};

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{label}</label>
      <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '9px 11px', fontSize: 13, fontWeight: 600, background: 'rgba(15,23,42,0.6)', border, borderRadius: 10, color: '#f1f5f9', outline: 'none' }} />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top left,#1e293b,#0f172a)', color: '#f1f5f9', fontFamily: "'Inter',sans-serif", padding: '12px 8px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>{children}</div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14, textAlign: 'center', padding: 20, lineHeight: 1.6 }}>
      {children}
    </div>
  );
}
