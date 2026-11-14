import React, { useState, useEffect } from 'react';
import { History, Play, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import RunsTable from '../components/RunsTable';
import apiClient from '../services/api';

export default function PipelineRuns() {
  const [runs, setRuns] = useState([]);
  const [reconReport, setReconReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [r, report] = await Promise.all([
        apiClient.getPipelineRuns(100),
        apiClient.getReconciliationReport(),
      ]);
      setRuns(r);
      setReconReport(report);
    } catch (err) {
      console.error('Failed to load runs history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTrigger = async () => {
    setIsTriggering(true);
    setTriggerMsg(null);
    try {
      const res = await apiClient.triggerPipeline();
      setTriggerMsg({
        type: 'success',
        text: `Pipeline executed (${res.run_id}): Published ${res.feature_snapshots_count} features in ${res.duration_seconds.toFixed(2)}s. Audit: ${res.overall_status}`,
      });
      loadData();
    } catch (err) {
      setTriggerMsg({
        type: 'error',
        text: err.response?.data?.detail || err.message,
      });
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[rgba(168,85,247,0.18)]">
        <div>
          <h2 className="text-xl font-bold text-[#F8F7FF] tracking-tight">Pipeline Execution Telemetry & Runs</h2>
          <p className="text-xs text-[#A1A1B5] mt-0.5">
            Operational run history, execution durations, row accounting, and reconciliation audit evidence
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadData}
            className="p-2 rounded-lg bg-[#211936] hover:bg-[#2c2247] text-[#F8F7FF] border border-[rgba(168,85,247,0.25)] transition-colors"
            title="Refresh runs"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#8B5CF6]' : ''}`} />
          </button>

          <button
            onClick={handleTrigger}
            disabled={isTriggering}
            className="flex items-center space-x-2 bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] hover:opacity-95 text-white font-medium py-2 px-4 rounded-lg text-xs transition-opacity disabled:opacity-50 shadow-lg shadow-[#8B5CF6]/25"
          >
            {isTriggering ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Running Pipeline...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Trigger New Execution</span>
              </>
            )}
          </button>
        </div>
      </div>

      {triggerMsg && (
        <div
          className={`p-3.5 rounded-lg text-xs flex items-center space-x-2 border ${
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

      {/* Reconciliation Audit Summary Banner */}
      {reconReport && (
        <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-semibold text-[#F8F7FF]">Live Mathematical Reconciliation Report</h3>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                reconReport.overall_status === 'PASSED'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              }`}
            >
              Overall: {reconReport.overall_status}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs mt-3 pt-3 border-t border-[rgba(168,85,247,0.15)]">
            <div>
              <span className="text-[#A1A1B5]">Referential Integrity:</span>
              <p className="font-semibold text-emerald-400 mt-0.5">
                {reconReport.integrity_checks?.referential_integrity_passed ? '0 Orphaned Keys' : 'Violations Detected'}
              </p>
            </div>
            <div>
              <span className="text-[#A1A1B5]">Snapshot Uniqueness:</span>
              <p className="font-semibold text-emerald-400 mt-0.5">
                {reconReport.integrity_checks?.uniqueness_passed ? '0 Duplicate Tuples' : 'Duplicates Found'}
              </p>
            </div>
            <div>
              <span className="text-[#A1A1B5]">Row Accounting:</span>
              <p className="font-semibold text-[#D8B4FE] mt-0.5">
                input = accepted + rejected
              </p>
            </div>
            <div>
              <span className="text-[#A1A1B5]">Audited Runs:</span>
              <p className="font-semibold text-[#F8F7FF] mt-0.5">
                {reconReport.run_audits?.length ?? 0} runs verified
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Runs Table */}
      <RunsTable runs={runs} isLoading={isLoading} />
    </div>
  );
}

