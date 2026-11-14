import React, { useState, useEffect } from 'react';
import { 
  Database, 
  CheckCircle2, 
  XCircle, 
  Cpu, 
  Clock, 
  Play, 
  RefreshCw, 
  ShieldCheck, 
  AlertTriangle 
} from 'lucide-react';
import MetricCard from '../components/MetricCard';
import QualityChart from '../components/QualityChart';
import RunsTable from '../components/RunsTable';
import apiClient from '../services/api';

export default function Dashboard({ onNavigate }) {
  const [metrics, setMetrics] = useState(null);
  const [runs, setRuns] = useState([]);
  const [rejects, setRejects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [m, r, rej] = await Promise.all([
        apiClient.getMetrics(),
        apiClient.getPipelineRuns(10),
        apiClient.getRejects({ limit: 100 }),
      ]);
      setMetrics(m);
      setRuns(r);
      setRejects(rej);
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTriggerRun = async () => {
    setIsTriggering(true);
    setActionMsg(null);
    try {
      const res = await apiClient.triggerPipeline();
      setActionMsg({
        type: 'success',
        text: `Pipeline completed: ${res.feature_snapshots_count} features created in ${res.duration_seconds.toFixed(2)}s (Audit: ${res.overall_status})`,
      });
      loadData();
    } catch (err) {
      setActionMsg({
        type: 'error',
        text: err.response?.data?.detail || 'Pipeline trigger failed.',
      });
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-100 tracking-tight">System Overview</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time pipeline metrics, row accounting, and point-in-time feature snapshots
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadData}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          <button
            onClick={handleTriggerRun}
            disabled={isTriggering}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg text-xs transition-colors disabled:opacity-50 shadow-sm"
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

      {actionMsg && (
        <div
          className={`p-3.5 rounded-lg text-xs flex items-center space-x-2 border ${
            actionMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          {actionMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{actionMsg.text}</span>
        </div>
      )}

      {/* Primary KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Transactions"
          value={metrics?.total_transactions}
          subtitle={`Across ${metrics?.total_customers ?? 0} verified customers`}
          icon={Database}
          color="blue"
        />
        <MetricCard
          title="Feature Snapshots"
          value={metrics?.total_feature_snapshots}
          subtitle="Point-in-time correct (Anti-leakage)"
          icon={Cpu}
          color="purple"
        />
        <MetricCard
          title="Quarantined Rejects"
          value={metrics?.total_rejected_records}
          subtitle="Anomalous & defective records"
          icon={XCircle}
          color="rose"
        />
        <MetricCard
          title="Reconciliation"
          value={metrics?.reconciliation_status ?? '—'}
          subtitle={`input = inserted + noop + rejected`}
          icon={ShieldCheck}
          color="emerald"
          badge={{
            text: metrics?.reconciliation_status === 'PASSED' ? '100% Balanced' : 'Unbalanced',
            className:
              metrics?.reconciliation_status === 'PASSED'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30',
          }}
        />
      </div>

      {/* Secondary Operational Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Runs (Success / Failed)</span>
            <div className="text-lg font-bold text-slate-200 mt-1">
              <span className="text-emerald-400">{metrics?.successful_runs ?? 0}</span>
              <span className="text-slate-600 mx-1">/</span>
              <span className="text-rose-400">{metrics?.failed_runs ?? 0}</span>
            </div>
          </div>
          <CheckCircle2 className="w-5 h-5 text-emerald-400/80" />
        </div>

        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Avg Pipeline Duration</span>
            <div className="text-lg font-bold text-slate-200 mt-1">
              {metrics?.avg_pipeline_duration_seconds ?? 0}s
            </div>
          </div>
          <Clock className="w-5 h-5 text-blue-400/80" />
        </div>

        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Last Execution</span>
            <div className="text-xs font-mono text-slate-300 mt-1">
              {metrics?.last_run_time ? metrics.last_run_time.replace('T', ' ').substring(0, 19) : 'No executions yet'}
            </div>
          </div>
          <RefreshCw className="w-5 h-5 text-purple-400/80" />
        </div>
      </div>

      {/* Visual Analytics */}
      <QualityChart runs={runs} rejects={rejects} />

      {/* Recent Pipeline Runs Table */}
      <RunsTable runs={runs} isLoading={isLoading} />
    </div>
  );
}

