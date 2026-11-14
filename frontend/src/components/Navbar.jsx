import React from 'react';
import { Layers, ShieldCheck, Sliders, CheckCircle2, ChevronRight, Activity } from 'lucide-react';

export default function Navbar({ activePage, setActivePage, onOpenAdvanced, healthStatus }) {
  const navItems = [
    { id: 'home', label: 'Home' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'wizard', label: 'My Datasets' },
    { id: 'results', label: 'Results' },
    { id: 'history', label: 'History' },
  ];

  return (
    <header className="h-16 border-b border-[rgba(168,85,247,0.18)] bg-[#10101F]/85 backdrop-blur-md px-6 sm:px-8 flex items-center justify-between shrink-0 sticky top-0 z-30 transition-all">
      {/* Brand Logo & Title */}
      <div 
        className="flex items-center space-x-3 cursor-pointer group" 
        onClick={() => setActivePage('home')}
      >
        <div className="w-9 h-9 rounded-xl bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] flex items-center justify-center text-[#A855F7] shadow-[0_0_15px_-3px_rgba(168,85,247,0.35)] group-hover:border-[#A855F7] transition-all">
          <Layers className="w-5 h-5 text-[#D8B4FE]" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-bold text-[#F8F7FF] tracking-tight text-base leading-none group-hover:text-[#D8B4FE] transition-colors">
              TimeSafe
            </h1>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.25)] text-[#D8B4FE]">
              Point-in-Time ML
            </span>
          </div>
          <p className="text-[11px] text-[#A1A1B5] font-medium tracking-wide mt-0.5">
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
              className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                isActive
                  ? 'bg-[#8B5CF6]/20 text-[#D8B4FE] border border-[rgba(168,85,247,0.4)] shadow-[0_0_12px_-2px_rgba(168,85,247,0.25)]'
                  : 'text-[#A1A1B5] hover:text-[#F8F7FF] hover:bg-[#16112B]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Secondary / System Status & Advanced Action */}
      <div className="flex items-center space-x-3">
        {/* Backend Connection indicator */}
        <div className="hidden md:flex items-center space-x-2 text-xs text-[#A1A1B5] bg-[#16112B] border border-[rgba(168,85,247,0.18)] px-3 py-1.5 rounded-xl">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse"></span>
          <span>{healthStatus?.status === 'ok' ? 'System Online' : 'Connecting...'}</span>
        </div>

        {/* Expandable Advanced / Technical Details Button */}
        <button
          onClick={onOpenAdvanced}
          className="flex items-center space-x-1.5 bg-[#16112B] hover:bg-[#211936] text-[#F8F7FF] border border-[rgba(168,85,247,0.25)] hover:border-[#A855F7]/60 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all hover:shadow-[0_0_15px_-3px_rgba(168,85,247,0.3)]"
          title="Inspect pipeline runs, quarantine store, and reconciliation audits"
        >
          <Sliders className="w-3.5 h-3.5 text-[#A855F7]" />
          <span>Advanced Details</span>
        </button>
      </div>
    </header>
  );
}

