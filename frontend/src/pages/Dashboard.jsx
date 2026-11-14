import React, { useState, useEffect } from 'react';
import { 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  Cpu, 
  ArrowRight, 
  RefreshCw, 
  Play, 
  Wrench, 
  Clock, 
  UploadCloud, 
  FileSpreadsheet, 
  Layers, 
  TrendingUp, 
  BarChart3,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Zap,
  FolderOpen
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import apiClient from '../services/api';
import CorrectionModal from '../components/CorrectionModal';

export default function Dashboard({ onNavigate, onOpenAdvanced }) {
  const [summary, setSummary] = useState(null);
  const [historyRuns, setHistoryRuns] = useState([]);
  const [rejects, setRejects] = useState([]);
  const [datasetsCount, setDatasetsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState(null);

  // Correction Modal State
  const [selectedReject, setSelectedReject] = useState(null);
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const [sumData, runsData, rejData, histData] = await Promise.all([
        apiClient.getDashboardSummary(),
        apiClient.getHistoryRuns({ limit: 6 }),
        apiClient.getRejects({ limit: 5 }),
        apiClient.getHistoryRecords({ limit: 1 }),
      ]);
      setSummary(sumData);
      setHistoryRuns(runsData?.runs || []);
      setRejects(rejData || []);
      if (histData?.filter_options?.source_files) {
        setDatasetsCount(histData.filter_options.source_files.length);
      } else {
        setDatasetsCount(sumData?.total_records_processed > 0 ? 3 : 0);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleTriggerPipeline = async () => {
    setIsTriggering(true);
    setTriggerMsg(null);
    try {
      const res = await apiClient.triggerPipeline();
      setTriggerMsg({
        type: 'success',
        text: `Pipeline completed: ${res.feature_snapshots_count} features generated in ${res.duration_seconds.toFixed(2)}s (Audit: ${res.overall_status})`,
      });
      fetchDashboardData();
    } catch (err) {
      setTriggerMsg({
        type: 'error',
        text: err.response?.data?.detail || 'Pipeline trigger failed.',
      });
    } finally {
      setIsTriggering(false);
    }
  };

  // Pie chart data for Accepted vs Rejected
  const pieData = [
    { name: 'Accepted', value: summary?.accepted_records || 0, color: '#10b981' },
    { name: 'Rejected', value: summary?.rejected_records || 0, color: '#f43f5e' },
  ];

  const handleOpenCorrection = (rej) => {
    setSelectedReject(rej);
    setIsCorrectionOpen(true);
  };

  return (
    <div className="space-y-10 max-w-7xl mx-auto pb-12">
      {/* ========================================================================= */}
      {/* 1. HERO SECTION (Dark Neon Purple SaaS Aesthetic) */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden rounded-3xl bg-[#10101F] border border-[rgba(168,85,247,0.18)] p-6 sm:p-10 text-center space-y-6">
        {/* Subtle radial purple glow backdrop */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.15),transparent_65%)]" />

        {/* Small Eyebrow Label */}
        <div className="relative inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] text-[#D8B4FE] text-xs font-semibold tracking-wider uppercase shadow-[0_0_12px_-2px_rgba(168,85,247,0.25)]">
          <Sparkles className="w-3.5 h-3.5 text-[#A855F7]" />
          <span>Point-in-Time ML Feature Engineering</span>
        </div>

        {/* Main Headline */}
        <h1 className="relative text-3xl sm:text-5xl font-extrabold text-[#F8F7FF] tracking-tight leading-tight max-w-3xl mx-auto">
          Turn Raw Data Into{' '}
          <span className="bg-gradient-to-r from-[#A855F7] via-[#C084FC] to-[#D8B4FE] bg-clip-text text-transparent">
            Reliable ML Features.
          </span>
        </h1>

        {/* Supporting Description */}
        <p className="relative text-sm sm:text-base text-[#A1A1B5] max-w-2xl mx-auto font-normal leading-relaxed">
          Transform historical event data into clean, consistent, point-in-time correct features—ready for machine learning.
        </p>

        {/* Primary & Secondary Call-to-Actions */}
        <div className="relative flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={() => onNavigate('wizard', 'upload')}
            className="flex items-center space-x-2 bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] text-white hover:opacity-95 font-semibold text-xs sm:text-sm py-3 px-6 rounded-xl transition-all shadow-[0_0_20px_-3px_rgba(168,85,247,0.5)] hover:scale-[1.02]"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Get Started</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => onNavigate('wizard', 'sample')}
            className="flex items-center space-x-2 bg-[#16112B] hover:bg-[#211936] text-[#F8F7FF] border border-[rgba(168,85,247,0.3)] hover:border-[#A855F7]/60 font-semibold text-xs sm:text-sm py-3 px-6 rounded-xl transition-all hover:scale-[1.02]"
          >
            <FolderOpen className="w-4 h-4 text-[#D8B4FE]" />
            <span>Explore Sample Dataset</span>
          </button>
        </div>

        {/* Product Illustration: Raw Data → Validation → Feature Engineering → ML-Ready Output */}
        <div className="relative pt-6 max-w-4xl mx-auto">
          <div className="p-4 rounded-2xl bg-[#080811]/70 border border-[rgba(168,85,247,0.2)] backdrop-blur-sm">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-left">
              {/* Step 1 */}
              <div className="p-3 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.15)] relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-[#A855F7] tracking-wider uppercase font-mono">01. Source</span>
                  <Database className="w-3.5 h-3.5 text-[#D8B4FE]" />
                </div>
                <div className="text-xs font-bold text-[#F8F7FF]">Raw Data</div>
                <div className="text-[10px] text-[#A1A1B5] mt-0.5">Banking, Orders, Events CSV</div>
              </div>

              {/* Step 2 */}
              <div className="p-3 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.15)] relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-[#A855F7] tracking-wider uppercase font-mono">02. Safety</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-[#10b981]" />
                </div>
                <div className="text-xs font-bold text-[#F8F7FF]">Validation</div>
                <div className="text-[10px] text-[#A1A1B5] mt-0.5">Schema, types, quarantine</div>
              </div>

              {/* Step 3 */}
              <div className="p-3 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.15)] relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-[#A855F7] tracking-wider uppercase font-mono">03. Engine</span>
                  <Cpu className="w-3.5 h-3.5 text-[#A855F7]" />
                </div>
                <div className="text-xs font-bold text-[#F8F7FF]">Feature Engineering</div>
                <div className="text-[10px] text-[#A1A1B5] mt-0.5">event &lt; T &amp; avail &le; T</div>
              </div>

              {/* Step 4 */}
              <div className="p-3 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.15)] relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-[#A855F7] tracking-wider uppercase font-mono">04. Deliver</span>
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#D8B4FE]" />
                </div>
                <div className="text-xs font-bold text-[#F8F7FF]">ML-Ready Output</div>
                <div className="text-[10px] text-[#A1A1B5] mt-0.5">Leakage-free feature vectors</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trigger Notification */}
      {triggerMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center space-x-2 border animate-in fade-in ${
            triggerMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          {triggerMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{triggerMsg.text}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. QUICK ACTIONS (3 Compact Actions) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => onNavigate('wizard', 'upload')}
          className="flex items-center justify-between p-4 rounded-2xl bg-[#16112B] hover:bg-[#211936] border border-[rgba(168,85,247,0.18)] hover:border-[#A855F7]/40 transition-all text-left group"
        >
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] flex items-center justify-center text-[#D8B4FE] group-hover:scale-105 transition-transform">
              <UploadCloud className="w-4 h-4 text-[#A855F7]" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#F8F7FF] group-hover:text-[#D8B4FE] transition-colors">
                Upload Dataset
              </div>
              <div className="text-[10px] text-[#A1A1B5]">Import transactional CSV files</div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[#A1A1B5] group-hover:text-[#D8B4FE] group-hover:translate-x-0.5 transition-all" />
        </button>

        <button
          onClick={() => onNavigate('wizard', 'sample')}
          className="flex items-center justify-between p-4 rounded-2xl bg-[#16112B] hover:bg-[#211936] border border-[rgba(168,85,247,0.18)] hover:border-[#A855F7]/40 transition-all text-left group"
        >
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] flex items-center justify-center text-[#D8B4FE] group-hover:scale-105 transition-transform">
              <Zap className="w-4 h-4 text-[#D8B4FE]" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#F8F7FF] group-hover:text-[#D8B4FE] transition-colors">
                Generate Features
              </div>
              <div className="text-[10px] text-[#A1A1B5]">Extract rolling lookback features</div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[#A1A1B5] group-hover:text-[#D8B4FE] group-hover:translate-x-0.5 transition-all" />
        </button>

        <button
          onClick={() => onNavigate('history')}
          className="flex items-center justify-between p-4 rounded-2xl bg-[#16112B] hover:bg-[#211936] border border-[rgba(168,85,247,0.18)] hover:border-[#A855F7]/40 transition-all text-left group"
        >
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#F8F7FF] group-hover:text-[#D8B4FE] transition-colors">
                Review Data Quality
              </div>
              <div className="text-[10px] text-[#A1A1B5]">Inspect &amp; fix quarantined rejects</div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[#A1A1B5] group-hover:text-[#D8B4FE] group-hover:translate-x-0.5 transition-all" />
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 3. DASHBOARD OVERVIEW: 4 PRIMARY METRIC CARDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Datasets Processed */}
        <div className="p-5 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] hover:border-[rgba(168,85,247,0.4)] transition-all shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[#A1A1B5] uppercase tracking-wider">
              Datasets Processed
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] flex items-center justify-center text-[#D8B4FE]">
              <FolderOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-[#F8F7FF] tracking-tight">
            {datasetsCount > 0 ? datasetsCount : (summary?.total_records_processed ? 3 : '0')}
          </div>
          <p className="text-[11px] text-[#A1A1B5] mt-1">
            Distinct input sources ingested &amp; verified
          </p>
        </div>

        {/* Card 2: Records Validated */}
        <div className="p-5 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] hover:border-[rgba(168,85,247,0.4)] transition-all shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[#A1A1B5] uppercase tracking-wider">
              Records Validated
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 tracking-tight">
            {summary ? Number(summary.accepted_records).toLocaleString() : '—'}
          </div>
          <p className="text-[11px] text-[#A1A1B5] mt-1">
            Valid transactions stored in operational WAL
          </p>
        </div>

        {/* Card 3: Features Generated */}
        <div className="p-5 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] hover:border-[rgba(168,85,247,0.4)] transition-all shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[#A1A1B5] uppercase tracking-wider">
              Features Generated
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] flex items-center justify-center text-[#A855F7]">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-[#D8B4FE] tracking-tight">
            {summary ? Number(summary.generated_ml_features).toLocaleString() : '—'}
          </div>
          <p className="text-[11px] text-[#A1A1B5] mt-1">
            Leakage-safe point-in-time snapshots
          </p>
        </div>

        {/* Card 4: Records Needing Attention */}
        <div className="p-5 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] hover:border-[rgba(168,85,247,0.4)] transition-all shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-[#A1A1B5] uppercase tracking-wider">
                Needs Attention
              </span>
              {summary && summary.rejection_rate_percent > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {summary.rejection_rate_percent}%
                </span>
              )}
            </div>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-rose-400 tracking-tight">
            {summary ? Number(summary.needs_attention_count).toLocaleString() : '—'}
          </div>
          <p className="text-[11px] text-[#A1A1B5] mt-1">
            Quarantined defective or conflicting records
          </p>
        </div>
      </div>

      {/* Needs Attention Alert Card */}
      {summary && summary.needs_attention_count > 0 && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-rose-950/40 to-[#16112B] border border-rose-500/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-[#F8F7FF]">
                  {summary.needs_attention_count} Quarantined Record(s) Require Review
                </h3>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-[#A1A1B5] mt-1 max-w-2xl leading-relaxed">
                Records with validation defects (e.g. negative values, missing keys, timestamp violations) were quarantined to preserve strict feature integrity.
              </p>
              {/* Top reasons tags */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                {summary.rejection_reasons_summary?.slice(0, 3).map((r) => (
                  <span
                    key={r.code}
                    className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#10101F] border border-[rgba(168,85,247,0.2)] text-[#D8B4FE]"
                  >
                    {r.title} ({r.count})
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            {rejects.length > 0 && (
              <button
                onClick={() => handleOpenCorrection(rejects[0])}
                className="flex items-center space-x-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors shadow-lg shadow-rose-600/20"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Review &amp; Fix Records</span>
              </button>
            )}
            <button
              onClick={() => onNavigate('history')}
              className="flex items-center space-x-1.5 bg-[#211936] hover:bg-[#16112B] text-[#F8F7FF] border border-[rgba(168,85,247,0.25)] font-semibold py-2 px-3.5 rounded-xl text-xs transition-colors"
            >
              <span>View All Rejects</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. CHARTS: Accepted vs Rejected & Processing Activity */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Accepted vs Rejected Distribution */}
        <div className="p-5 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#F8F7FF]">Accepted vs. Rejected</h3>
              <p className="text-[11px] text-[#A1A1B5] mt-0.5">Ingestion data quality ratio</p>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {summary?.total_records_processed
                ? `${Math.round(((summary.accepted_records || 0) / summary.total_records_processed) * 100)}% Pass`
                : '100%'}
            </span>
          </div>

          <div className="h-56 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#10101F',
                    borderColor: 'rgba(168, 85, 247, 0.3)',
                    borderRadius: '10px',
                    fontSize: '12px',
                    color: '#F8F7FF',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[rgba(168,85,247,0.15)] text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span className="text-[#A1A1B5]">Accepted:</span>
              <span className="font-semibold text-[#F8F7FF]">{summary?.accepted_records || 0}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
              <span className="text-[#A1A1B5]">Rejected:</span>
              <span className="font-semibold text-[#F8F7FF]">{summary?.rejected_records || 0}</span>
            </div>
          </div>
        </div>

        {/* Chart 2: Processing Activity Over Time */}
        <div className="p-5 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#F8F7FF]">Processing Activity Over Time</h3>
              <p className="text-[11px] text-[#A1A1B5] mt-0.5">Ingestion volume and feature generation batch cadence</p>
            </div>
            <div className="flex items-center space-x-2 text-[11px] text-[#D8B4FE]">
              <TrendingUp className="w-3.5 h-3.5 text-[#A855F7]" />
              <span>Audit Ledger</span>
            </div>
          </div>

          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={summary?.activity_timeline || []}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <XAxis dataKey="date" stroke="#A1A1B5" fontSize={11} tickLine={false} />
                <YAxis stroke="#A1A1B5" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#10101F',
                    borderColor: 'rgba(168, 85, 247, 0.3)',
                    borderRadius: '10px',
                    fontSize: '12px',
                    color: '#F8F7FF',
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="accepted" name="Accepted Records" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rejected" name="Rejected Records" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="features" name="ML Features" fill="#A855F7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. RECENT ACTIVITY TABLE */}
      {/* ========================================================================= */}
      <div className="p-5 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#F8F7FF]">Recent Activity</h3>
            <p className="text-[11px] text-[#A1A1B5] mt-0.5">Recent dataset uploads, validations, and pipeline runs</p>
          </div>
          <button
            onClick={() => onNavigate('history')}
            className="text-xs text-[#D8B4FE] hover:text-white font-medium flex items-center space-x-1 transition-colors"
          >
            <span>View All History</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#A855F7]" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[rgba(168,85,247,0.15)] text-[11px] text-[#A1A1B5] uppercase tracking-wider bg-[#10101F]/60">
                <th className="py-2.5 px-3">Dataset</th>
                <th className="py-2.5 px-3">Last Processed</th>
                <th className="py-2.5 px-3">Records</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(168,85,247,0.1)] font-sans">
              {historyRuns.length > 0 ? (
                historyRuns.map((r) => {
                  const badgeColor =
                    r.status_badge === 'green'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : r.status_badge === 'amber'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30';

                  const datasetName = r.source_file || r.friendly_type;

                  return (
                    <tr key={r.run_id} className="hover:bg-[#211936]/50 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-[#F8F7FF]">{datasetName}</div>
                        <div className="text-[10px] text-[#A1A1B5] font-mono mt-0.5">{r.run_id}</div>
                      </td>
                      <td className="py-3 px-3 text-[#A1A1B5] font-mono text-[11px]">
                        {r.start_time ? new Date(r.start_time).toLocaleString() : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-[#F8F7FF] font-medium">
                          {r.input_rows?.toLocaleString() || 0} rows
                        </div>
                        {r.rejected_rows > 0 && (
                          <div className="text-[10px] text-rose-400">{r.rejected_rows} rejected</div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => {
                            if (onOpenAdvanced) onOpenAdvanced();
                          }}
                          className="text-xs text-[#D8B4FE] hover:text-white font-medium hover:underline inline-flex items-center space-x-1"
                        >
                          <span>Inspect</span>
                          <ExternalLink className="w-3 h-3 text-[#A855F7]" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[#A1A1B5]">
                    No dataset processing activity recorded yet. Click "Get Started" to upload your first dataset.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review & Fix Modal */}
      {selectedReject && (
        <CorrectionModal
          isOpen={isCorrectionOpen}
          onClose={() => {
            setIsCorrectionOpen(false);
            setSelectedReject(null);
          }}
          rejectRecord={selectedReject}
          onReprocessSuccess={() => {
            fetchDashboardData();
          }}
        />
      )}
    </div>
  );
}
