import React from 'react';
import { Layers, ShieldCheck, Sliders, CheckCircle2, ChevronRight, Activity } from 'lucide-react';

export default function Navbar({ activePage, setActivePage, onOpenAdvanced, healthStatus }) {
  const navItems = [
    { id: 'home', label: 'Home' },
    { id: 'wizard', label: 'My Datasets' },
    { id: 'results', label: 'Results' },
  ];

  return (
    <header className="h-16 border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur-md px-6 sm:px-8 flex items-center justify-between shrink-0 sticky top-0 z-30">
      {/* Brand Logo & Title */}
      <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActivePage('home')}>
        <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-bold text-slate-100 tracking-tight text-base leading-none">TimeSafe</h1>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
              Point-in-Time ML
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium tracking-wide mt-0.5">
            Reliable Transactional Feature Store
          </p>
        </div>
      </div>

      {/* Primary Clean Navigation */}
      <nav className="flex items-center space-x-1 sm:space-x-2">
        {navItems.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Secondary / Advanced Actions */}
      <div className="flex items-center space-x-3">
        {/* Backend Status indicator */}
        <div className="hidden md:flex items-center space-x-1.5 text-xs text-slate-400 bg-[#0a0f1d] border border-slate-800 px-2.5 py-1.5 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>{healthStatus?.status === 'ok' ? 'System Online' : 'Connecting...'}</span>
        </div>

        {/* Expandable Advanced / Technical Details Button */}
        <button
          onClick={onOpenAdvanced}
          className="flex items-center space-x-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-slate-100 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          title="Inspect pipeline runs, quarantine store, and reconciliation audits"
        >
          <Sliders className="w-3.5 h-3.5 text-blue-400" />
          <span>Advanced Details</span>
        </button>
      </div>
    </header>
  );
}

