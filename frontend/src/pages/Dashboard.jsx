import React, { useState, useEffect } from 'react';
import { 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  Cpu, 
  ArrowRight, 
  RefreshCw, 
  UploadCloud, 
  FileSpreadsheet, 
  Layers, 
  TrendingUp, 
  BarChart3,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  PieChart as PieChartIcon,
  Wrench,
  Clock,
  History,
  AlertCircle
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
  Cell,
  CartesianGrid
} from 'recharts';
import apiClient from '../services/api';
import CorrectionModal from '../components/CorrectionModal';

export default function Dashboard({ onNavigate, onOpenAdvanced }) {
  const [summary, setSummary] = useState(null);
  const [activityData, setActivityData] = useState([]);
  const [activityMode, setActivityMode] = useState('daily'); // 'daily' or 'runs'
  const [recentRuns, setRecentRuns] = useState([]);
  const [rejects, setRejects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(null);

  // Correction Modal State
  const [selectedReject, setSelectedReject] = useState(null);
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    setHasError(null);
    try {
      // Fetch summary, activity, and recent runs concurrently
      const [sumData, actData, runsData, rejData] = await Promise.all([
        apiClient.getDashboardSummary(),
        apiClient.getDashboardActivity().catch((err) => {
          console.warn('Dashboard activity endpoint fallback:', err);
          return null;
        }),
        apiClient.getDashboardRecentRuns(8).catch((err) => {
          console.warn('Dashboard recent runs endpoint fallback:', err);
          return null;
        }),
        apiClient.getRejects({ limit: 5 }).catch((err) => {
          console.warn('Rejects endpoint fallback:', err);
          return [];
        }),
      ]);

      setSummary(sumData);

      // Handle activity timeline
      if (actData?.daily_timeline && actData.daily_timeline.length > 0) {
        setActivityData(actData.daily_timeline);
      } else if (sumData?.activity_timeline && sumData.activity_timeline.length > 0) {
        setActivityData(sumData.activity_timeline);
      } else {
        setActivityData([]);
      }

      // Handle recent runs
      if (runsData?.runs && runsData.runs.length > 0) {
        setRecentRuns(runsData.runs);
      } else if (sumData?.recent_activity && sumData.recent_activity.length > 0) {
        setRecentRuns(sumData.recent_activity);
      } else {
        setRecentRuns([]);
      }

      setRejects(rejData || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setHasError(err.response?.data?.detail || err.message || 'Failed to fetch dashboard metrics from backend.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const totalValid = summary?.valid_records ?? summary?.accepted_records ?? 0;
  const totalRejected = summary?.rejected_records ?? 0;
  const totalRecords = totalValid + totalRejected;
  const validPercent = totalRecords > 0 ? Math.round((totalValid / totalRecords) * 100) : 0;

  // Donut chart data
  const pieData = [
    { name: 'Valid Records', value: totalValid, color: '#10b981' },
    { name: 'Quarantined Rejections', value: totalRejected, color: '#f43f5e' },
  ];

  const handleOpenCorrection = (rej) => {
    setSelectedReject(rej);
    setIsCorrectionOpen(true);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 animate-fadeIn">
      {/* ========================================================================= */}
      {/* 1. DASHBOARD HEADER & QUICK ACTIONS */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-[rgba(168,85,247,0.18)]">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8F7FF] tracking-tight">
              Data Processing Dashboard
            </h1>
            <span className="text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] text-[#D8B4FE]">
              Live Engine
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#A1A1B5] mt-1">
            Monitor your datasets, processing activity, data quality, and generated features.
          </p>
        </div>

        {/* Dashboard Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onNavigate('wizard', 'upload')}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] hover:opacity-95 text-white text-xs font-semibold shadow-lg shadow-[#8B5CF6]/25 transition-opacity"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload Dataset</span>
          </button>

          <button
            onClick={() => onNavigate('results')}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-[#211936] hover:bg-[#2c2247] text-[#F8F7FF] border border-[rgba(168,85,247,0.25)] text-xs font-semibold transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#D8B4FE]" />
            <span>View Results</span>
          </button>

          <button
            onClick={() => onNavigate('history')}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-[#211936] hover:bg-[#2c2247] text-[#F8F7FF] border border-[rgba(168,85,247,0.25)] text-xs font-semibold transition-colors"
          >
            <History className="w-3.5 h-3.5 text-[#D8B4FE]" />
            <span>View History</span>
          </button>

          <button
            onClick={fetchDashboardData}
            disabled={isLoading}
            className="p-2 rounded-xl bg-[#16112B] hover:bg-[#211936] text-[#A1A1B5] hover:text-[#F8F7FF] border border-[rgba(168,85,247,0.2)] transition-colors disabled:opacity-50"
            title="Refresh dashboard data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#8B5CF6]' : ''}`} />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ERROR ALERT BANNER (If API Failed) */}
      {/* ========================================================================= */}
      {hasError && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-lg">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-rose-200">Unable to load dashboard metrics</span>
              <p className="text-rose-300/80 mt-0.5">{hasError}</p>
            </div>
          </div>
          <button
            onClick={fetchDashboardData}
            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-colors self-start sm:self-auto shrink-0"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. FOUR PRIMARY DASHBOARD SUMMARY CARDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Card 1: Datasets Processed */}
        <div className="p-5 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] hover:border-[rgba(168,85,247,0.4)] transition-all shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[#A1A1B5] uppercase tracking-wider">
                Datasets Processed
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.25)] flex items-center justify-center text-[#D8B4FE]">
                <Database className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-[#F8F7FF] tracking-tight">
              {isLoading ? (
                <div className="h-8 w-16 bg-[#211936] rounded animate-pulse" />
              ) : (
                summary?.datasets_processed ?? (totalRecords > 0 ? 1 : 0)
              )}
            </div>
          </div>
          <p className="text-[11px] text-[#A1A1B5] mt-3 pt-2 border-t border-[rgba(168,85,247,0.1)]">
            Distinct input CSV sources ingested
          </p>
        </div>

        {/* Card 2: Valid Records */}
        <div className="p-5 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] hover:border-[rgba(168,85,247,0.4)] transition-all shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[#A1A1B5] uppercase tracking-wider">
                Valid Records
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-emerald-400 tracking-tight">
              {isLoading ? (
                <div className="h-8 w-20 bg-[#211936] rounded animate-pulse" />
              ) : (
                totalValid.toLocaleString()
              )}
            </div>
          </div>
          <p className="text-[11px] text-[#A1A1B5] mt-3 pt-2 border-t border-[rgba(168,85,247,0.1)]">
            Stored operational transactions
          </p>
        </div>

        {/* Card 3: Rejected Records */}
        <div className="p-5 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] hover:border-[rgba(168,85,247,0.4)] transition-all shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-[#A1A1B5] uppercase tracking-wider">
                  Rejected Records
                </span>
                {totalRecords > 0 && summary?.rejection_rate_percent !== undefined && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {summary.rejection_rate_percent}%
                  </span>
                )}
              </div>
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-rose-400 tracking-tight">
              {isLoading ? (
                <div className="h-8 w-20 bg-[#211936] rounded animate-pulse" />
              ) : (
                totalRejected.toLocaleString()
              )}
            </div>
          </div>
          <p className="text-[11px] text-[#A1A1B5] mt-3 pt-2 border-t border-[rgba(168,85,247,0.1)]">
            {summary?.needs_attention_count 
              ? `${summary.needs_attention_count} require review in quarantine` 
              : 'Quarantined defective rows'}
          </p>
        </div>

        {/* Card 4: Feature Snapshots Generated */}
        <div className="p-5 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] hover:border-[rgba(168,85,247,0.4)] transition-all shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[#A1A1B5] uppercase tracking-wider">
                Feature Snapshots
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] flex items-center justify-center text-[#A855F7]">
                <Cpu className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-[#D8B4FE] tracking-tight">
              {isLoading ? (
                <div className="h-8 w-16 bg-[#211936] rounded animate-pulse" />
              ) : (
                (summary?.feature_snapshots_generated ?? summary?.generated_ml_features ?? 0).toLocaleString()
              )}
            </div>
          </div>
          <p className="text-[11px] text-[#A1A1B5] mt-3 pt-2 border-t border-[rgba(168,85,247,0.1)]">
            Leakage-safe point-in-time vectors
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. NEEDS ATTENTION ALERT BANNER */}
      {/* ========================================================================= */}
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
                  Data Quality
                </span>
              </div>
              <p className="text-xs text-[#A1A1B5] mt-1 max-w-2xl leading-relaxed">
                Records with validation defects (e.g. negative values, missing keys, causality violations) are quarantined to protect ML features from dirty data.
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
                <span>Review &amp; Fix</span>
              </button>
            )}
            <button
              onClick={() => onNavigate('history')}
              className="flex items-center space-x-1.5 bg-[#211936] hover:bg-[#16112B] text-[#F8F7FF] border border-[rgba(168,85,247,0.25)] font-semibold py-2 px-3.5 rounded-xl text-xs transition-colors"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. CHARTS: ACCEPTED VS REJECTED & PROCESSING ACTIVITY OVER TIME */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Accepted vs Rejected Distribution */}
        <div className="p-5 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#F8F7FF]">Accepted vs. Rejected</h3>
                <p className="text-[11px] text-[#A1A1B5] mt-0.5">Ingestion data quality ratio</p>
              </div>
              {totalRecords > 0 ? (
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {validPercent}% Valid
                </span>
              ) : (
                <span className="text-[11px] font-mono text-[#A1A1B5] bg-[#211936] px-2 py-0.5 rounded border border-[rgba(168,85,247,0.2)]">
                  No Data
                </span>
              )}
            </div>

            {/* Donut Chart or Clean Empty State */}
            <div className="h-56 w-full flex items-center justify-center mt-2">
              {totalRecords === 0 ? (
                <div className="text-center p-4 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-[#211936] flex items-center justify-center mx-auto text-[#A1A1B5]">
                    <PieChartIcon className="w-5 h-5 text-[#8B5CF6]" />
                  </div>
                  <p className="text-xs text-[#A1A1B5] font-medium">
                    No processing data available yet.
                  </p>
                  <p className="text-[11px] text-[#A1A1B5]/70">
                    Upload a dataset to get started.
                  </p>
                </div>
              ) : (
                <div className="h-full w-full relative">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
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
                  {/* Center Stat */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-extrabold text-[#F8F7FF]">{validPercent}%</span>
                    <span className="text-[10px] uppercase font-semibold text-[#A1A1B5]">Pass</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[rgba(168,85,247,0.12)] text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span className="text-[#A1A1B5]">Accepted:</span>
              <span className="font-semibold text-[#F8F7FF]">{totalValid}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
              <span className="text-[#A1A1B5]">Rejected:</span>
              <span className="font-semibold text-[#F8F7FF]">{totalRejected}</span>
            </div>
          </div>
        </div>

        {/* Chart 2: Processing Activity Over Time */}
        <div className="p-5 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] space-y-4 lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#F8F7FF]">Processing Activity Over Time</h3>
                <p className="text-[11px] text-[#A1A1B5] mt-0.5">
                  Actual ingestion volumes and feature generation output (no parent run double-counting)
                </p>
              </div>
              <div className="flex items-center space-x-2 text-[11px] text-[#D8B4FE]">
                <TrendingUp className="w-3.5 h-3.5 text-[#A855F7]" />
                <span>Audit Verified</span>
              </div>
            </div>

            {/* Bar Chart Container */}
            <div className="h-56 w-full min-w-0 mt-2">
              {activityData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-[#211936] flex items-center justify-center mx-auto text-[#A1A1B5]">
                    <BarChart3 className="w-5 h-5 text-[#8B5CF6]" />
                  </div>
                  <p className="text-xs text-[#A1A1B5] font-medium">
                    No processing activity recorded yet.
                  </p>
                  <p className="text-[11px] text-[#A1A1B5]/70">
                    Upload a dataset or trigger a pipeline run to populate activity metrics.
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                  <BarChart
                    data={activityData}
                    margin={{ top: 10, right: 15, left: -15, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(168, 85, 247, 0.08)" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#A1A1B5" 
                      fontSize={11} 
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="#A1A1B5" 
                      fontSize={11} 
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#10101F',
                        borderColor: 'rgba(168, 85, 247, 0.3)',
                        borderRadius: '10px',
                        fontSize: '12px',
                        color: '#F8F7FF',
                      }}
                    />
                    <Legend 
                      iconType="circle" 
                      wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} 
                    />
                    <Bar dataKey="accepted" name="Accepted Records" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="rejected" name="Rejected Records" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="features" name="ML Features" fill="#A855F7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-[rgba(168,85,247,0.12)] flex items-center justify-between text-[11px] text-[#A1A1B5]">
            <span>Series: Valid Transactions, Quarantined Rejections, Published Feature Snapshots</span>
            <span className="font-mono text-[#D8B4FE]">Cadence: Batch Execution</span>
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
            <p className="text-[11px] text-[#A1A1B5] mt-0.5">
              Latest pipeline executions, row accounting, and reconciliation statuses
            </p>
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
                <th className="py-2.5 px-3">Dataset / Source</th>
                <th className="py-2.5 px-3">Processing Date</th>
                <th className="py-2.5 px-3 text-right">Input Records</th>
                <th className="py-2.5 px-3 text-right">Accepted</th>
                <th className="py-2.5 px-3 text-right">Rejected</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(168,85,247,0.1)] font-sans">
              {recentRuns.length > 0 ? (
                recentRuns.map((r) => {
                  const badgeColor =
                    r.badge_color === 'green'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : r.badge_color === 'amber'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30';

                  const datasetName = r.source_file || r.dataset_name || r.friendly_type;
                  const inputCount = r.input_records ?? r.input_rows ?? r.records_processed ?? 0;
                  const acceptedCount = r.accepted_records ?? r.accepted_rows ?? 0;
                  const rejectedCount = r.rejected_records ?? r.rejected_rows ?? 0;

                  return (
                    <tr key={r.run_id} className="hover:bg-[#211936]/50 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-[#F8F7FF]">{datasetName}</div>
                        <div className="text-[10px] text-[#A1A1B5] font-mono mt-0.5">{r.run_id}</div>
                      </td>
                      <td className="py-3 px-3 text-[#A1A1B5] font-mono text-[11px]">
                        {r.start_time ? new Date(r.start_time).toLocaleString() : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-[#F8F7FF]">
                        {Number(inputCount).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-emerald-400">
                        {Number(acceptedCount).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-rose-400">
                        {Number(rejectedCount).toLocaleString()}
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
                          <span>View Details</span>
                          <ExternalLink className="w-3 h-3 text-[#A855F7]" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#A1A1B5]">
                    No dataset processing activity recorded yet. Click "Upload Dataset" to get started.
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
