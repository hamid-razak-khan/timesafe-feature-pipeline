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
  ExternalLink
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
  const [rejects, setRejects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState(null);

  // Correction Modal State
  const [selectedReject, setSelectedReject] = useState(null);
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const [sumData, rejData] = await Promise.all([
        apiClient.getDashboardSummary(),
        apiClient.getRejects({ limit: 5 }),
      ]);
      setSummary(sumData);
      setRejects(rejData || []);
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
    <div className="space-y-8 max-w-7xl mx-auto pb-8">
      {/* Top Header & Quick Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight">Overview Dashboard</h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time operational throughput, point-in-time features, and data quality observability
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={fetchDashboardData}
            disabled={isLoading}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          <button
            onClick={() => onNavigate('wizard')}
            className="flex items-center space-x-1.5 bg-[#0f172a] hover:bg-slate-800 text-slate-200 border border-slate-700 font-medium py-2 px-3.5 rounded-lg text-xs transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
            <span>Upload Dataset</span>
          </button>

          <button
            onClick={() => onNavigate('results')}
            className="flex items-center space-x-1.5 bg-[#0f172a] hover:bg-slate-800 text-slate-200 border border-slate-700 font-medium py-2 px-3.5 rounded-lg text-xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-purple-400" />
            <span>View Results</span>
          </button>

          <button
            onClick={handleTriggerPipeline}
            disabled={isTriggering}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg text-xs transition-colors disabled:opacity-50 shadow-md shadow-blue-600/20"
          >
            {isTriggering ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Running Pipeline...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Trigger Full Pipeline</span>
              </>
            )}
          </button>
        </div>
      </div>

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

      {/* 4 Primary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Records Processed */}
        <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 hover:border-slate-700 transition-all shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Records Processed
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-100 tracking-tight">
            {summary ? Number(summary.total_records_processed).toLocaleString() : '—'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Across all imported datasets & streams
          </p>
        </div>

        {/* Card 2: Accepted Records */}
        <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 hover:border-slate-700 transition-all shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Accepted Records
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 tracking-tight">
            {summary ? Number(summary.accepted_records).toLocaleString() : '—'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Clean, validated & stored in operational WAL
          </p>
        </div>

        {/* Card 3: Records Needing Attention */}
        <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 hover:border-slate-700 transition-all shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
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
          <p className="text-[11px] text-slate-400 mt-1">
            Quarantined defective or conflicting records
          </p>
        </div>

        {/* Card 4: Generated ML Features */}
        <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 hover:border-slate-700 transition-all shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Generated ML Features
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-purple-400 tracking-tight">
            {summary ? Number(summary.generated_ml_features).toLocaleString() : '—'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Point-in-time vectors (Dual-timestamp safe)
          </p>
        </div>
      </div>

      {/* Needs Attention Alert Card */}
      {summary && summary.needs_attention_count > 0 && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-rose-950/40 to-[#0f172a] border border-rose-500/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-slate-100">
                  {summary.needs_attention_count} Quarantined Record(s) Require Review
                </h3>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Records with validation defects (e.g. negative values, missing keys, timestamp violations) were quarantined to protect your operational ML store.
              </p>
              {/* Top reasons tags */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                {summary.rejection_reasons_summary?.slice(0, 3).map((r) => (
                  <span
                    key={r.code}
                    className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300"
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
                className="flex items-center space-x-1.5 bg-rose-600 hover:bg-rose-500 text-white font-medium py-2 px-4 rounded-xl text-xs transition-colors shadow-lg shadow-rose-600/20"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Review & Fix Records</span>
              </button>
            )}
            <button
              onClick={() => onNavigate('history')}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium py-2 px-3.5 rounded-xl text-xs transition-colors"
            >
              <span>View All Rejects</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 2 Clean Visual Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Accepted vs Rejected Distribution */}
        <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-100">Accepted vs. Rejected</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Pipeline data ingestion quality ratio</p>
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
                    backgroundColor: '#0a0f1d',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span className="text-slate-400">Accepted:</span>
              <span className="font-semibold text-slate-200">{summary?.accepted_records || 0}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
              <span className="text-slate-400">Rejected:</span>
              <span className="font-semibold text-slate-200">{summary?.rejected_records || 0}</span>
            </div>
          </div>
        </div>

        {/* Chart 2: Processing Activity Over Time */}
        <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-100">Processing Activity Over Time</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Historical ingestion volumes and feature output batches</p>
            </div>
            <div className="flex items-center space-x-2 text-[11px] text-slate-400">
              <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
              <span>Audit Timeline</span>
            </div>
          </div>

          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={summary?.activity_timeline || []}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0a0f1d',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="accepted" name="Accepted Records" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rejected" name="Rejected Records" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="features" name="ML Features" fill="#a855f7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100">Recent Processing Activity</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Execution history of pipeline ingestions, runs, and retries</p>
          </div>
          <button
            onClick={() => onNavigate('history')}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center space-x-1"
          >
            <span>View Full History</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Run Type</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Started</th>
                <th className="py-2.5 px-3">Records Processed</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {summary?.recent_activity?.length > 0 ? (
                summary.recent_activity.map((r) => {
                  const badgeColor =
                    r.badge_color === 'green'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : r.badge_color === 'amber'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30';

                  return (
                    <tr key={r.run_id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-200">{r.friendly_type}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{r.run_id}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${badgeColor}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                        {r.start_time ? new Date(r.start_time).toLocaleString() : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-slate-200 font-medium">
                          {r.records_processed?.toLocaleString() || 0} rows
                        </div>
                        {r.rejected_rows > 0 && (
                          <div className="text-[10px] text-rose-400">{r.rejected_rows} rejected</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                        {r.duration_seconds}s
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => {
                            if (onOpenAdvanced) onOpenAdvanced();
                          }}
                          className="text-xs text-blue-400 hover:text-blue-300 font-medium hover:underline inline-flex items-center space-x-1"
                        >
                          <span>Details</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    No execution activity recorded yet.
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
