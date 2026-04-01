import { useEffect, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { CheckCircle2, User, XCircle, Clock, Settings, Users } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function App() {
  const [activeTab, setActiveTab] = useState('jadval');
  const [users, setUsers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [isAdmin, setIsAdmin] = useState(false); // In real app, verify via Telegram initData

  useEffect(() => {
    // Fake admin check for demo purposes, replace with Telegram WebApp InitData validation
    const tgParams = new URLSearchParams(window.location.hash.slice(1));
    if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id.toString() === "ADMIN_ID_HERE") {
       setIsAdmin(true);
    } // fallback for test:
    setIsAdmin(true); // TODO: Remove true and use real auth
    
    fetchData();
  }, []);

  const fetchData = async () => {
    const resUsers = await axios.get(`${API_URL}/users`);
    const resSettings = await axios.get(`${API_URL}/settings`);
    setUsers(resUsers.data);
    setSettings(resSettings.data);
  };

  const handleSaveSettings = async (e: any) => {
    e.preventDefault();
    await axios.post(`${API_URL}/settings`, settings);
    alert('Sozlamalar saqlandi!');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-4">
      <div className="max-w-2xl mx-auto">
        
        {/* Header */}
        <header className="flex items-center justify-between mb-8 p-4 bg-slate-800 rounded-2xl shadow-lg border border-slate-700">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Temur.fit
            </h1>
            <p className="text-sm text-slate-400">Ratsion Nazorati</p>
          </div>
          <div className="flex bg-slate-700 rounded-lg p-1">
            <button 
              onClick={() => setActiveTab('jadval')} 
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'jadval' ? 'bg-slate-800 shadow text-emerald-400' : 'text-slate-400'}`}
            >
              Jadval
            </button>
            {isAdmin && (
              <button 
                onClick={() => setActiveTab('admin')} 
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'admin' ? 'bg-slate-800 shadow text-emerald-400' : 'text-slate-400'}`}
              >
                 Admin
              </button>
            )}
          </div>
        </header>

        {/* Tab Content */}
        {activeTab === 'jadval' ? (
          <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                 <Users size={18} className="text-emerald-400"/> Guruh Jadvali
              </h2>
              <span className="text-xs font-medium px-2 py-1 bg-slate-700 rounded-md">Bugun: {format(new Date(), 'yyyy-MM-dd')}</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="p-4 font-medium border-b border-slate-700">No</th>
                    <th className="p-4 font-medium border-b border-slate-700">Ism</th>
                    <th className="p-4 font-medium border-b border-slate-700 text-center">Nonushta</th>
                    <th className="p-4 font-medium border-b border-slate-700 text-center">Abed</th>
                    <th className="p-4 font-medium border-b border-slate-700 text-center">Kechki ovqat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {users.map((user, idx) => {
                    const todayStr = format(new Date(), 'yyyy-MM-dd');
                    const getRecord = (type: string) => user.mealRecords.find((r:any) => r.mealType === type && r.date === todayStr);
                    
                    const renderStatus = (record: any) => {
                       if(!record) return <span className="text-slate-600 block text-center">-</span>;
                       if(record.status === 'late') return <XCircle size={18} className="text-rose-500 mx-auto" />;
                       return <CheckCircle2 size={18} className="text-emerald-400 mx-auto" />;
                    };

                    return (
                      <tr key={user.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="p-4 text-sm text-slate-400">{idx + 1}</td>
                        <td className="p-4 text-sm font-medium flex items-center gap-2">
                          <User size={16} className="text-slate-500" />
                          {user.name}
                        </td>
                        <td className="p-4">{renderStatus(getRecord('nonushta'))}</td>
                        <td className="p-4">{renderStatus(getRecord('abed'))}</td>
                        <td className="p-4">{renderStatus(getRecord('kechki_ovqat'))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {users.length === 0 && (
                 <div className="p-8 text-center text-slate-500 text-sm">Hali hech kim ro'yxatdan o'tmagan</div>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSaveSettings} className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 p-6 space-y-6">
            <h2 className="text-xl font-semibold flex items-center gap-2 border-b border-slate-700 pb-4 mb-4">
              <Settings size={20} className="text-cyan-400"/> Sozlamalar
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                   <Clock size={16}/> Nonushta gacha (08:00)
                </label>
                <input 
                  type="time" 
                  value={settings.breakfastTime || ''} 
                  onChange={e => setSettings({...settings, breakfastTime: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 outline-none focus:border-cyan-400 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                   <Clock size={16}/> Abed gacha (12:00)
                </label>
                <input 
                  type="time" 
                  value={settings.lunchTime || ''} 
                  onChange={e => setSettings({...settings, lunchTime: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 outline-none focus:border-cyan-400 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                   <Clock size={16}/> Kechki ovqat gacha (18:00)
                </label>
                <input 
                  type="time" 
                  value={settings.dinnerTime || ''} 
                  onChange={e => setSettings({...settings, dinnerTime: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 outline-none focus:border-cyan-400 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                   Eslatma oralig'i (daqiqa)
                </label>
                <input 
                  type="number" 
                  value={settings.reminderInterval || 60} 
                  onChange={e => setSettings({...settings, reminderInterval: parseInt(e.target.value)})}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 outline-none focus:border-cyan-400 transition-colors"
                />
              </div>
            </div>

            <button type="submit" className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-900 font-bold py-3 px-4 rounded-xl transition-all shadow-lg transform active:scale-95">
              Saqlash
            </button>
          </form>
        )}

      </div>
    </div>
  );
}

export default App;
