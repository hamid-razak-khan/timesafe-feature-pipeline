import React from 'react';
import { UploadCloud, Sparkles, ArrowRight, ShieldCheck, CheckCircle2, Clock, Cpu, FileSpreadsheet } from 'lucide-react';

export default function Home({ onStartUpload, onStartSample }) {
  const steps = [
    {
      num: '1',
      title: 'Upload Historical Data',
      desc: 'Provide your transactional CSV with events from banking, e-commerce, subscriptions, or logistics.',
      icon: UploadCloud,
    },
    {
      num: '2',
      title: 'Choose Columns & Features',
      desc: 'Map entity IDs, event times, and availability timestamps. Pick lookback windows (7d, 30d).',
      icon: Cpu,
    },
    {
      num: '3',
      title: 'Generate & Download',
      desc: 'Receive point-in-time ML feature vectors ready for scikit-learn or XGBoost.',
      icon: FileSpreadsheet,
    },
  ];

  const domains = [
    'Banking & Payments',
    'E-Commerce & Retail',
    'SaaS Subscriptions',
    'Logistics & Tracking',
    'User Activity Streams',
  ];

  return (
    <div className="py-8 sm:py-16 max-w-5xl mx-auto space-y-16">
      {/* Hero Section */}
      <div className="text-center space-y-6">
        <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold tracking-wide">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Point-in-Time Anti-Leakage Feature Store</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-100 tracking-tight leading-tight">
          TimeSafe
        </h1>

        <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto font-normal leading-relaxed">
          Transform your historical transactional data into reliable, ML-ready features designed to eliminate future-data leakage.
        </p>

        {/* Primary Call to Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button
            onClick={onStartUpload}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3.5 px-6 rounded-xl text-sm transition-all shadow-lg shadow-blue-600/20 hover:scale-[1.02]"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload Dataset</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>

          <button
            onClick={onStartSample}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-[#0f172a] hover:bg-slate-800 text-slate-200 border border-slate-700/80 font-medium py-3.5 px-6 rounded-xl text-sm transition-all hover:scale-[1.02]"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Try Sample Dataset</span>
          </button>
        </div>

        {/* Domain tags */}
        <div className="pt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
          <span>Supports:</span>
          {domains.map((d) => (
            <span key={d} className="px-2.5 py-1 rounded-md bg-slate-800/60 border border-slate-800 text-slate-400">
              {d}
            </span>
          ))}
        </div>
      </div>

      {/* 3-Step Simple Explanation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.num}
              className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 relative group hover:border-slate-700 transition-all shadow-sm"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm mb-4">
                {step.num}
              </div>
              <h3 className="text-base font-semibold text-slate-100 mb-2">{step.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Trust & Simplicity Highlights */}
      <div className="bg-[#0f172a]/60 border border-slate-800/80 rounded-2xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-slate-400">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-200">Point-in-Time Correctness</h4>
            <p className="text-slate-500 text-[11px]">Strict dual-timestamp filtering ensures zero information leakage.</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-200">Consistent Train & Inference</h4>
            <p className="text-slate-500 text-[11px]">Single unified calculation eliminates train/serve skew completely.</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-200">Idempotent Rerun Engine</h4>
            <p className="text-slate-500 text-[11px]">Idempotent pipelines and auditable quarantine for bad data.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

