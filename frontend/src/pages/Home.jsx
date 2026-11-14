import React from 'react';
import { 
  UploadCloud, 
  Sparkles, 
  ArrowRight, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  Cpu, 
  FileSpreadsheet, 
  Sliders, 
  ShieldAlert, 
  BarChart3, 
  Layers, 
  Zap,
  Activity
} from 'lucide-react';

export default function Home({ onNavigate }) {
  const steps = [
    {
      num: '01',
      title: 'Upload Your Data',
      desc: 'Upload transactional or event-based CSV datasets from banking, retail, logistics, or user activity.',
      icon: UploadCloud,
      tag: 'Flexible CSV Ingestion',
    },
    {
      num: '02',
      title: 'Configure Features',
      desc: 'Map columns, choose time windows (7d, 30d), and select point-in-time feature calculations.',
      icon: Sliders,
      tag: 'Configurable Windows',
    },
    {
      num: '03',
      title: 'Generate Results',
      desc: 'Generate and download ML-ready feature datasets with guaranteed zero future-data leakage.',
      icon: FileSpreadsheet,
      tag: 'Clean ML Outputs',
    },
  ];

  const valueProps = [
    {
      title: 'Prevent Future-Data Leakage',
      desc: 'Enforces strict dual-timestamp rules (event_time < T and available_at <= T) to guarantee consistent training and inference.',
      icon: Clock,
      color: 'text-[#8B5CF6]',
      bg: 'bg-[#8B5CF6]/10 border-[#8B5CF6]/30',
    },
    {
      title: 'Validate Data Quality',
      desc: 'Automates schema validation, timestamp causality checks, decimal non-negativity, and transparent quarantine isolation.',
      icon: ShieldCheck,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/25',
    },
    {
      title: 'Generate Consistent ML Features',
      desc: 'Calculates reproducible rolling aggregates, purchase recency, and customer metrics using a unified feature engine.',
      icon: Cpu,
      color: 'text-[#A855F7]',
      bg: 'bg-[#A855F7]/10 border-[#A855F7]/30',
    },
    {
      title: 'Track Processing Results',
      desc: 'Full mathematical reconciliation accounting (Total = Valid + Quarantined) with complete run telemetry and audit proof.',
      icon: BarChart3,
      color: 'text-[#D8B4FE]',
      bg: 'bg-[#8B5CF6]/15 border-[#8B5CF6]/30',
    },
  ];

  const domains = [
    'Banking Transactions',
    'E-Commerce Purchases',
    'Retail Checkouts',
    'SaaS Subscriptions',
    'Logistics & Shipments',
    'User Event Streams',
  ];

  return (
    <div className="py-6 sm:py-12 max-w-6xl mx-auto space-y-16 animate-fadeIn">
      {/* ========================================================================= */}
      {/* 1. HERO SECTION */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden rounded-3xl bg-[#10101F] border border-[rgba(168,85,247,0.22)] p-8 sm:p-14 text-center space-y-7 shadow-2xl shadow-[#8B5CF6]/5">
        {/* Subtle radial purple glow backdrop */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.18),transparent_70%)]" />

        {/* Eyebrow Label */}
        <div className="relative inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] text-[#D8B4FE] text-xs font-semibold tracking-wider uppercase shadow-[0_0_15px_-2px_rgba(168,85,247,0.3)]">
          <Zap className="w-3.5 h-3.5 text-[#A855F7]" />
          <span>Point-in-Time ML Feature Engineering Platform</span>
        </div>

        {/* Headline */}
        <h1 className="relative text-3xl sm:text-5xl lg:text-6xl font-black text-[#F8F7FF] tracking-tight leading-[1.15] max-w-4xl mx-auto">
          Transform Raw Data Into <br className="hidden sm:inline" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D8B4FE] via-[#A855F7] to-[#8B5CF6]">
            Reliable ML Features
          </span>
        </h1>

        {/* Supporting Text */}
        <p className="relative text-base sm:text-lg text-[#A1A1B5] max-w-2xl mx-auto font-normal leading-relaxed">
          Upload historical datasets, configure feature calculations, and generate point-in-time correct ML-ready data with TimeSafe.
        </p>

        {/* Primary Action Buttons */}
        <div className="relative flex flex-col sm:flex-row items-center justify-center gap-4 pt-3">
          <button
            onClick={() => onNavigate('wizard', 'upload')}
            className="w-full sm:w-auto flex items-center justify-center space-x-2.5 bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] hover:opacity-95 text-white font-semibold py-3.5 px-7 rounded-xl text-sm transition-all shadow-lg shadow-[#8B5CF6]/30 hover:scale-[1.02]"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Get Started</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>

          <button
            onClick={() => onNavigate('wizard', 'sample')}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-[#211936] hover:bg-[#2c2247] text-[#F8F7FF] border border-[rgba(168,85,247,0.3)] font-semibold py-3.5 px-6 rounded-xl text-sm transition-all hover:scale-[1.02]"
          >
            <Sparkles className="w-4 h-4 text-[#D8B4FE]" />
            <span>Try Sample Dataset</span>
          </button>
        </div>

        {/* Pipeline Architecture Diagram Strip */}
        <div className="pt-6 max-w-3xl mx-auto">
          <div className="p-4 rounded-2xl bg-[#080811]/70 border border-[rgba(168,85,247,0.18)] shadow-inner">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
              <div className="p-3 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.15)] space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#A1A1B5] tracking-wider block">Stage 1</span>
                <span className="text-xs font-semibold text-[#F8F7FF] block">Raw Data</span>
                <span className="text-[11px] text-[#A1A1B5] block">Transactional CSV</span>
              </div>
              <div className="p-3 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.15)] space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">Stage 2</span>
                <span className="text-xs font-semibold text-[#F8F7FF] block">Validation</span>
                <span className="text-[11px] text-[#A1A1B5] block">Anti-Leakage Gate</span>
              </div>
              <div className="p-3 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.15)] space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#A855F7] tracking-wider block">Stage 3</span>
                <span className="text-xs font-semibold text-[#F8F7FF] block">Feature Engine</span>
                <span className="text-[11px] text-[#A1A1B5] block">7d / 30d Lookback</span>
              </div>
              <div className="p-3 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.15)] space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#D8B4FE] tracking-wider block">Stage 4</span>
                <span className="text-xs font-semibold text-[#F8F7FF] block">ML-Ready Data</span>
                <span className="text-[11px] text-[#A1A1B5] block">Zero Leakage Output</span>
              </div>
            </div>
          </div>
        </div>

        {/* Supported Domains Pill Strip */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-[#A1A1B5]">
          <span className="font-medium text-[#F8F7FF]">Supports:</span>
          {domains.map((d) => (
            <span
              key={d}
              className="px-2.5 py-1 rounded-full bg-[#16112B] border border-[rgba(168,85,247,0.18)] text-[#D8B4FE] text-[11px] font-medium"
            >
              {d}
            </span>
          ))}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. THREE-STEP EXPLANATION */}
      {/* ========================================================================= */}
      <section className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#F8F7FF] tracking-tight">
            How TimeSafe Works
          </h2>
          <p className="text-xs sm:text-sm text-[#A1A1B5] max-w-xl mx-auto">
            A three-step reproducible workflow designed to transform messy raw logs into verified ML features.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-2xl p-6 relative group hover:border-[rgba(168,85,247,0.4)] transition-all shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-mono font-bold text-[#D8B4FE] bg-[#211936] px-2.5 py-1 rounded-lg border border-[rgba(168,85,247,0.25)]">
                      Step {step.num}
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.25)] flex items-center justify-center text-[#A855F7] group-hover:scale-105 transition-transform">
                      <Icon className="w-5 h-5 text-[#D8B4FE]" />
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-[#F8F7FF] mb-2">{step.title}</h3>
                  <p className="text-xs text-[#A1A1B5] leading-relaxed mb-4">{step.desc}</p>
                </div>

                <div className="pt-3 border-t border-[rgba(168,85,247,0.12)]">
                  <span className="text-[11px] font-semibold text-[#D8B4FE] inline-flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{step.tag}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. WHY TIMESAFE IS USEFUL */}
      {/* ========================================================================= */}
      <section className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#F8F7FF] tracking-tight">
            Why TimeSafe?
          </h2>
          <p className="text-xs sm:text-sm text-[#A1A1B5] max-w-xl mx-auto">
            Traditional feature pipelines suffer from subtle data leakage and untraceable dirty data. TimeSafe guarantees mathematical correctness.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {valueProps.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] hover:border-[rgba(168,85,247,0.35)] rounded-2xl p-6 transition-all shadow-sm space-y-3"
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${item.bg}`}>
                    <Icon className={`w-4 h-4 ${item.color}`} />
                  </div>
                  <h3 className="text-sm font-bold text-[#F8F7FF]">{item.title}</h3>
                </div>
                <p className="text-xs text-[#A1A1B5] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. BOTTOM CALL TO ACTION */}
      {/* ========================================================================= */}
      <section className="rounded-2xl bg-gradient-to-r from-[#16112B] via-[#211936] to-[#16112B] border border-[rgba(168,85,247,0.25)] p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
        <div className="space-y-2 text-center sm:text-left">
          <h3 className="text-lg sm:text-xl font-bold text-[#F8F7FF]">
            Ready to generate point-in-time correct ML features?
          </h3>
          <p className="text-xs text-[#A1A1B5] max-w-md">
            Upload any transactional CSV dataset, configure columns, and export ML features in seconds.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={() => onNavigate('dashboard')}
            className="px-4 py-2.5 rounded-xl bg-[#10101F] hover:bg-[#16112B] text-[#F8F7FF] border border-[rgba(168,85,247,0.25)] text-xs font-semibold transition-colors"
          >
            Open Dashboard
          </button>
          <button
            onClick={() => onNavigate('wizard', 'upload')}
            className="flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] hover:opacity-95 text-white text-xs font-semibold transition-opacity shadow-lg shadow-[#8B5CF6]/25"
          >
            <span>Upload Dataset</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>
    </div>
  );
}
