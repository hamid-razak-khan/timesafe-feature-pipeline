import React from 'react';

export default function MetricCard({ title, value, subtitle, icon: Icon, color = 'purple', badge }) {
  const colorMap = {
    purple: 'text-[#D8B4FE] bg-[#8B5CF6]/10 border-[#8B5CF6]/30',
    blue: 'text-[#D8B4FE] bg-[#8B5CF6]/10 border-[#8B5CF6]/30',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };

  return (
    <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-xl p-5 shadow-sm hover:border-[rgba(168,85,247,0.35)] transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[#A1A1B5] uppercase tracking-wider">{title}</span>
        {Icon && (
          <div className={`p-2 rounded-lg border ${colorMap[color] || colorMap.purple}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className="flex items-baseline space-x-2">
        <span className="text-2xl font-bold tracking-tight text-[#F8F7FF]">{value ?? '—'}</span>
        {badge && (
          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${badge.className}`}>
            {badge.text}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-[#A1A1B5] mt-2">{subtitle}</p>}
    </div>
  );
}

