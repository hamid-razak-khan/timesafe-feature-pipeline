import React from 'react';
import { 
  LayoutDashboard, 
  UploadCloud, 
  Cpu, 
  ShieldAlert, 
  History, 
  CheckCircle2, 
  Activity,
  Layers
} from 'lucide-react';

export default function Sidebar({ activePage, setActivePage, healthStatus }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'ingestion', label: 'Data Ingestion', icon: UploadCloud },
    { id: 'features', label: 'Feature Explorer', icon: Cpu },
    { id: 'quality', label: 'Data Quality & Rejects', icon: ShieldAlert },
    { id: 'runs', label: 'Pipeline Runs', icon: History },
  ];

  return (
    <aside className="w-64 bg-[#0f172a] border-r border-slate-800 flex flex-col justify-between shrink-0 select-none">
      <div>
        {/* Brand Header */}
        <div className="h-16 flex items-center px-6 border-b border-slate-800 space-x-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-100 tracking-tight text-base leading-none">TimeSafe</h1>
            <p className="text-[11px] text-slate-400 font-medium tracking-wide uppercase mt-1">Feature Pipeline</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer / System Status */}
      <div className="p-4 border-t border-slate-800">
        <div className="bg-[#0a0f1d] border border-slate-800/80 rounded-lg p-3 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 font-medium">Backend API</span>
            <span className="flex items-center space-x-1 text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>{healthStatus?.status === 'ok' ? 'Connected' : 'Offline'}</span>
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-500 text-[11px]">
            <span>Storage: SQLite (WAL)</span>
            <span>v0.1.0</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
