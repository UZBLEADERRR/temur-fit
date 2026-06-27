import SuperPanel from './SuperPanel';
import TenantPanel from './TenantPanel';
import { getQueryParam } from './api';

function App() {
  const isSuper = getQueryParam('super') === '1';
  const tidRaw = getQueryParam('tid');
  const tid = tidRaw ? Number(tidRaw) : null;

  if (isSuper) return <SuperPanel />;
  if (tid && !Number.isNaN(tid)) return <TenantPanel tid={tid} />;

  // Hech qanday kontekst yo'q — botdan ochishni so'raymiz
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14, textAlign: 'center', padding: 24, lineHeight: 1.7, fontFamily: "'Inter',sans-serif" }}>
      <div>
        <div style={{ fontSize: 40, marginBottom: 12 }}>💪</div>
        <b style={{ color: '#e2e8f0', fontSize: 18 }}>Temur.fit SAAS</b>
        <p>Bu panelni Telegram botingiz ichidagi tugma orqali oching.</p>
      </div>
    </div>
  );
}

export default App;
