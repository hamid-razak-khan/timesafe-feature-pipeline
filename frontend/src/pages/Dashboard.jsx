import React, { useState, useEffect, useRef } from 'react';
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
  AlertCircle,
  Filter,
  X,
  Calendar,
  Info
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

/**
 * Custom Donut Tooltip
 * High-contrast dark purple background with clear white text and exact counts & percentages.
 */
function DonutTooltip({ active, payload, totalValid, totalRejected }) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  const total = totalValid + totalRejected;
  const percent = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0';
  const isAccepted = item.name.includes('Valid') || item.name.includes('Accepted');

  return (
    <div
      style={{
        backgroundColor: '#211936',
        color: '#F8F7FF',
        border: '1px solid rgba(168, 85, 247, 0.35)',
        borderRadius: '10px',
        padding: '10px 14px',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.6), 0 0 12px -2px rgba(168, 85, 247, 0.3)',
      }}
      className="text-xs space-y-1.5 z-50 pointer-events-none min-w-[170px]"
    >
      <div className="flex items-center space-x-2">
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: isAccepted ? '#10B981' : '#F43F5E' }}
        />
        <span className="font-bold text-[#F8F7FF]">
          {isAccepted ? 'Accepted Records' : 'Rejected Records'}
        </span>
      </div>
      <div className="text-[#A1A1B5] flex justify-between gap-4 pt-1 border-t border-[rgba(168,85,247,0.15)]">
        <span>Count:</span>
        <strong className="text-[#F8F7FF] font-mono">{Number(item.value).toLocaleString()}</strong>
      </div>
      <div className="text-[#A1A1B5] flex justify-between gap-4">
        <span>Percentage:</span>
        <strong className="text-[#F8F7FF] font-mono">{percent}%</strong>
      </div>
    </div>
  );
}

/**
 * Custom Activity Bar Chart Tooltip
 * Eliminates light grey backgrounds and renders high-contrast, verified metrics.
 */
function ActivityTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0]?.payload || {};

  return (
    <div
      style={{
        backgroundColor: '#211936',
        color: '#F8F7FF',
        border: '1px solid rgba(168, 85, 247, 0.35)',
        borderRadius: '10px',
        padding: '12px 14px',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.6), 0 0 12px -2px rgba(168, 85, 247, 0.3)',
      }}
      className="text-xs space-y-2 z-50 pointer-events-none min-w-[220px]"
    >
      <div className="pb-1 border-b border-[rgba(168,85,247,0.2)]">
        <div className="font-bold text-[#F8F7FF] flex items-center justify-between">
          <span>{item.display_date || label}</span>
          {item.source_file && item.source_file !== 'All Datasets' && (
            <span className="text-[10px] font-mono text-[#D8B4FE] bg-[#16112B] px-1.5 py-0.5 rounded border border-[rgba(168,85,247,0.25)]">
              {item.source_file}
            </span>
          )}
        </div>
        <p className="text-[10px] text-[#A1A1B5]">Batch processing telemetry</p>
      </div>

      <div className="space-y-1.5 pt-0.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center space-x-1.5 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span>Accepted Records:</span>
          </span>
          <span className="font-mono font-bold text-[#F8F7FF]">
            {Number(item.accepted || 0).toLocaleString()}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center space-x-1.5 text-rose-300">
            <span className="w-2 h-2 rounded-full bg-[#F43F5E]" />
            <span>Rejected Records:</span>
          </span>
          <span className="font-mono font-bold text-[#F8F7FF]">
            {Number(item.rejected || 0).toLocaleString()}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center space-x-1.5 text-purple-300">
            <span className="w-2 h-2 rounded-full bg-[#A855F7]" />
            <span>ML Features:</span>
          </span>
          <span className="font-mono font-bold text-[#F8F7FF]">
            {Number(item.features || 0).toLocaleString()}
          </span>
        </div>
      </div>

      {item.runs_count !== undefined && item.runs_count > 0 && (
        <div className="pt-1.5 border-t border-[rgba(168,85,247,0.15)] text-[10px] text-[#A1A1B5] flex justify-between">
          <span>Completed Batches:</span>
          <span className="font-mono text-[#D8B4FE] font-semibold">{item.runs_count}</span>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ onNavigate, onOpenAdvanced }) {
  // Primary Dashboard State
  const [summary, setSummary] = useState(null);
  const [activityData, setActivityData] = useState([]);
  const [activityGranularity, setActivityGranularity] = useState('daily');
  const [recentRuns, setRecentRuns] = useState([]);
  const [rejects, setRejects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(null);

  // Filter Bar State
  const [selectedDataset, setSelectedDataset] = useState('all');
  const [datePreset, setDatePreset] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [availableDatasets, setAvailableDatasets] = useState([]);

  // Stale Request Protection Ref
  const requestIdRef = useRef(0);

  // Correction Modal State
  const [selectedReject, setSelectedReject] = useState(null);
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);

  // Fetch filter options on initial load
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const options = await apiClient.getDashboardFilterOptions();
        if (options?.datasets) {
          setAvailableDatasets(options.datasets);
        }
      } catch (err) {
        console.warn('Failed to load dashboard filter options:', err);
      }
    };
    loadFilterOptions();
  }, []);

  // Fetch Dashboard data synchronized with current filters
  const fetchDashboardData = async () => {
    const currentReqId = ++requestIdRef.current;
    setIsLoading(true);
    setHasError(null);

    // Build query params
    const params = {};
    if (selectedDataset && selectedDataset !== 'all') {
      params.source_file = selectedDataset;
    }
    if (datePreset && datePreset !== 'all') {
      params.date_preset = datePreset;
      if (datePreset === 'custom') {
        if (customStartDate) params.start_date = customStartDate;
        if (customEndDate) params.end_date = customEndDate;
      }
    }
    if (selectedStatus && selectedStatus !== 'all') {
      params.status = selectedStatus;
    }

    try {
      // Concurrently query summary, activity, recent runs, and sample rejects
      const [sumData, actData, runsData, rejData] = await Promise.all([
        apiClient.getDashboardSummary(params),
        apiClient.getDashboardActivity(params).catch((err) => {
          console.warn('Dashboard activity endpoint fallback:', err);
          return null;
        }),
        apiClient.getDashboardRecentRuns({ limit: 10, ...params }).catch((err) => {
          console.warn('Dashboard recent runs endpoint fallback:', err);
          return null;
        }),
        apiClient.getRejects({ limit: 5, ...(selectedDataset !== 'all' ? { source_file: selectedDataset } : {}) }).catch((err) => {
          console.warn('Rejects endpoint fallback:', err);
          return [];
        }),
      ]);

      // Guard against stale asynchronous responses
      if (currentReqId !== requestIdRef.current) {
        return;
      }

      setSummary(sumData);

      // Populate dataset filter options if returned
      if (sumData?.available_datasets && sumData.available_datasets.length > 0) {
        setAvailableDatasets(sumData.available_datasets);
      }

      // Handle activity timeline
      if (actData?.daily_timeline && actData.daily_timeline.length > 0) {
        setActivityData(actData.daily_timeline);
        setActivityGranularity(actData.granularity || 'daily');
      } else if (sumData?.activity_timeline && sumData.activity_timeline.length > 0) {
        setActivityData(sumData.activity_timeline);
        setActivityGranularity('daily');
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
      if (currentReqId === requestIdRef.current) {
        console.error('Failed to load dashboard data:', err);
        setHasError(err.response?.data?.detail || err.message || 'Failed to fetch dashboard metrics.');
      }
    } finally {
      if (currentReqId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  // Re-fetch whenever filters change
  useEffect(() => {
    fetchDashboardData();
  }, [selectedDataset, datePreset, customStartDate, customEndDate, selectedStatus]);

  // Reset Filters Handler
  const handleResetFilters = () => {
    setSelectedDataset('all');
    setDatePreset('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setSelectedStatus('all');
  };

  const isFilterActive = selectedDataset !== 'all' || datePreset !== 'all' || selectedStatus !== 'all';

  // Accurate metric values
  const totalValid = summary?.valid_records ?? summary?.accepted_records ?? 0;
  const totalRejected = summary?.rejected_records ?? 0;
  const totalFeatures = summary?.feature_snapshots_generated ?? summary?.generated_ml_features ?? 0;
  const totalRecords = totalValid + totalRejected;
  const validPercent = totalRecords > 0 ? ((totalValid / totalRecords) * 100).toFixed(1) : 0;

  // Donut chart data strictly calculated from current state
  const pieData = [
    { name: 'Valid Records', value: totalValid, color: '#10B981' },
    { name: 'Quarantined Rejections', value: totalRejected, color: '#F43F5E' },
  ];

  const handleOpenCorrection = (rej) => {
    setSelectedReject(rej);
    setIsCorrectionOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fadeIn">
      {/* ========================================================================= */}
      {/* 1. DASHBOARD HEADER & QUICK ACTIONS */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-[rgba(168,85,247,0.18)]">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8F7FF] tracking-tight">
              Executive Dashboard
            </h1>
            <span className="text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full bg-[#8B5CF6]/20 text-[#D8B4FE] border border-[#8B5CF6]/30">
              Live Observability
            </span>
          </div>
          <p className="text-xs text-[#A1A1B5] mt-1">
            Point-in-time feature engineering telemetry, quarantine analytics, and execution accounting
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => onNavigate('wizard', 'upload')}
            className="flex items-center space-x-2 bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] hover:opacity-95 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-all shadow-[0_0_20px_-3px_rgba(168,85,247,0.5)] hover:scale-[1.02]"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload Dataset</span>
          </button>

          <button
            onClick={fetchDashboardData}
            disabled={isLoading}
            className="flex items-center space-x-1.5 bg-[#211936] hover:bg-[#16112B] text-[#D8B4FE] hover:text-[#F8F7FF] border border-[rgba(168,85,247,0.25)] font-semibold py-2 px-3.5 rounded-xl text-xs transition-colors disabled:opacity-50"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#A855F7]' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. ADVANCED FILTER BAR */}
      {/* ========================================================================= */}
      <div className="bg-[#16112B] border border-[rgba(168,85,247,0.22)] rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-[#A855F7]" />
            <span className="text-xs font-bold text-[#F8F7FF] uppercase tracking-wider">
              Telemetry Filters
            </span>
            {isFilterActive && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#8B5CF6]/20 text-[#D8B4FE] border border-[#8B5CF6]/35">
                Filtered Scope
              </span>
            )}
          </div>

          {isFilterActive && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-[#A1A1B5] hover:text-rose-400 font-medium flex items-center space-x-1 transition-colors self-start md:self-auto"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Filter 1: Dataset / Source File */}
          <div>
            <label className="block text-[11px] font-medium text-[#A1A1B5] mb-1">
              Dataset / Source File
            </label>
            <select
              value={selectedDataset}
              onChange={(e) => setSelectedDataset(e.target.value)}
              className="w-full bg-[#211936] border border-[rgba(168,85,247,0.25)] rounded-xl px-3 py-2 text-[#F8F7FF] text-xs focus:outline-none focus:border-[#A855F7]"
            >
              <option value="all">All Datasets (Global)</option>
              {availableDatasets.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.label} {ds.valid_records ? `(${ds.valid_records} valid)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Filter 2: Date Range Preset */}
          <div>
            <label className="block text-[11px] font-medium text-[#A1A1B5] mb-1">
              Date Range
            </label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="w-full bg-[#211936] border border-[rgba(168,85,247,0.25)] rounded-xl px-3 py-2 text-[#F8F7FF] text-xs focus:outline-none focus:border-[#A855F7]"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          {/* Filter 3: Execution Status */}
          <div>
            <label className="block text-[11px] font-medium text-[#A1A1B5] mb-1">
              Run Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-[#211936] border border-[rgba(168,85,247,0.25)] rounded-xl px-3 py-2 text-[#F8F7FF] text-xs focus:outline-none focus:border-[#A855F7]"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed (Clean)</option>
              <option value="warning">Completed with Rejections</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Custom Date Inputs (Conditional) */}
          {datePreset === 'custom' ? (
            <div className="flex items-center space-x-2">
              <div className="flex-1">
                <label className="block text-[10px] text-[#A1A1B5] mb-1">Start Date</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full bg-[#211936] border border-[rgba(168,85,247,0.25)] rounded-xl px-2.5 py-1.5 text-[#F8F7FF] text-xs [color-scheme:dark] focus:outline-none focus:border-[#A855F7]"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] text-[#A1A1B5] mb-1">End Date</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full bg-[#211936] border border-[rgba(168,85,247,0.25)] rounded-xl px-2.5 py-1.5 text-[#F8F7FF] text-xs [color-scheme:dark] focus:outline-none focus:border-[#A855F7]"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col justify-end">
              <div className="text-[11px] text-[#A1A1B5] bg-[#10101F] p-2 rounded-xl border border-[rgba(168,85,247,0.15)] flex items-center justify-between">
                <span>Timeline Cadence:</span>
                <span className="font-mono text-[#D8B4FE] font-bold uppercase">{activityGranularity}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error Alert Banner */}
      {hasError && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{hasError}</span>
          </div>
          <button
            onClick={fetchDashboardData}
            className="text-xs underline text-red-200 hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. CORE SUMMARY KPI CARDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Datasets Processed */}
        <div className="p-5 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] hover:border-[rgba(168,85,247,0.4)] transition-all shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[#A1A1B5] uppercase tracking-wider">
                Datasets Processed
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] flex items-center justify-center text-[#A855F7]">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-[#F8F7FF] tracking-tight">
              {isLoading ? (
                <div className="h-8 w-16 bg-[#211936] rounded animate-pulse" />
              ) : (
                (summary?.datasets_processed ?? (selectedDataset !== 'all' ? 1 : 0)).toLocaleString()
              )}
            </div>
          </div>
          <p className="text-[11px] text-[#A1A1B5] mt-3 pt-2 border-t border-[rgba(168,85,247,0.1)]">
            {selectedDataset === 'all' ? 'Distinct dataset sources in storage' : `Source: ${selectedDataset}`}
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
          <div className="mt-3 pt-2 border-t border-[rgba(168,85,247,0.1)] flex items-center justify-between text-[11px] text-[#A1A1B5]">
            <span>Current unique valid stored</span>
            {summary?.total_historical_accepted !== undefined && (
              <span className="font-mono text-[#D8B4FE]" title="Total records accepted across historical batch runs">
                Hist: {summary.total_historical_accepted.toLocaleString()}
              </span>
            )}
          </div>
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
          <div className="mt-3 pt-2 border-t border-[rgba(168,85,247,0.1)] flex items-center justify-between text-[11px] text-[#A1A1B5]">
            <span>Total quarantine events</span>
            {summary?.needs_attention_count !== undefined && (
              <span className="font-mono text-rose-300 font-semibold" title="Unresolved quarantined records requiring review">
                {summary.needs_attention_count} Unresolved
              </span>
            )}
          </div>
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
                totalFeatures.toLocaleString()
              )}
            </div>
          </div>
          <p className="text-[11px] text-[#A1A1B5] mt-3 pt-2 border-t border-[rgba(168,85,247,0.1)]">
            Point-in-time feature vectors
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. NEEDS ATTENTION ALERT BANNER */}
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
                Records with validation defects (e.g. negative values, causality violations, missing fields) are isolated to protect downstream ML feature calculation.
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
      {/* 5. CHARTS: ACCEPTED VS REJECTED & PROCESSING ACTIVITY OVER TIME */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Accepted vs Rejected Donut Chart */}
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

            {/* Donut Chart with Custom Readable Tooltip */}
            <div className="h-56 w-full flex items-center justify-center mt-2">
              {totalRecords === 0 ? (
                <div className="text-center p-4 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-[#211936] flex items-center justify-center mx-auto text-[#A1A1B5]">
                    <PieChartIcon className="w-5 h-5 text-[#8B5CF6]" />
                  </div>
                  <p className="text-xs text-[#A1A1B5] font-medium">
                    No processing data matches current filters.
                  </p>
                  <p className="text-[11px] text-[#A1A1B5]/70">
                    Try adjusting your dataset or date filters.
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
                        content={<DonutTooltip totalValid={totalValid} totalRejected={totalRejected} />}
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
              <span className="font-semibold text-[#F8F7FF]">{totalValid.toLocaleString()}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
              <span className="text-[#A1A1B5]">Rejected:</span>
              <span className="font-semibold text-[#F8F7FF]">{totalRejected.toLocaleString()}</span>
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
                  Verified batch execution volumes ({activityGranularity} aggregation, zero parent/child double-counting)
                </p>
              </div>
              <div className="flex items-center space-x-2 text-[11px] text-[#D8B4FE]">
                <TrendingUp className="w-3.5 h-3.5 text-[#A855F7]" />
                <span className="font-mono uppercase">{activityGranularity} View</span>
              </div>
            </div>

            {/* Bar Chart Container (Transparent background, no grey overlay) */}
            <div className="h-56 w-full min-w-0 mt-2 bg-transparent">
              {activityData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-[#211936] flex items-center justify-center mx-auto text-[#A1A1B5]">
                    <BarChart3 className="w-5 h-5 text-[#8B5CF6]" />
                  </div>
                  <p className="text-xs text-[#A1A1B5] font-medium">
                    No processing activity recorded for the selected filter.
                  </p>
                  <p className="text-[11px] text-[#A1A1B5]/70">
                    Select "All Datasets" or run an ingestion pipeline to view activity.
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                  <BarChart
                    data={activityData}
                    margin={{ top: 10, right: 15, left: -15, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(168, 85, 247, 0.12)" />
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
                      content={<ActivityTooltip />}
                      cursor={{ fill: 'rgba(168, 85, 247, 0.08)' }}
                    />
                    <Legend 
                      iconType="circle" 
                      wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} 
                    />
                    <Bar dataKey="accepted" name="Accepted Records" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="rejected" name="Rejected Records" fill="#F43F5E" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="features" name="ML Features" fill="#A855F7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-[rgba(168,85,247,0.12)] flex items-center justify-between text-[11px] text-[#A1A1B5]">
            <span>Series: Accepted Ingestion, Quarantined Rejections, Generated Features</span>
            <span className="font-mono text-[#D8B4FE]">Cadence: {activityGranularity.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. RECENT ACTIVITY TABLE */}
      {/* ========================================================================= */}
      <div className="p-5 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#F8F7FF]">Recent Activity</h3>
            <p className="text-[11px] text-[#A1A1B5] mt-0.5">
              Filtered pipeline execution runs, row accounting, and reconciliation statuses
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
                <th className="py-2.5 px-3 text-right">Features</th>
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
                  const featureCount = r.feature_records ?? r.feature_rows ?? 0;

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
                      <td className="py-3 px-3 text-right font-semibold text-[#D8B4FE]">
                        {Number(featureCount).toLocaleString()}
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
                  <td colSpan={8} className="py-8 text-center text-[#A1A1B5]">
                    No pipeline runs match the current filter selection.
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
