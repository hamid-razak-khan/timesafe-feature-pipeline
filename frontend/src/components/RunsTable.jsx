import React from 'react';
import { CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';

export default function RunsTable({ runs = [], isLoading = false }) {
  const getStatusBadge = (status) => {
    switch (status) {
      case 'success':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            <span>Success</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3 animate-spin" />
            <span>Running</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Operational Pipeline Execution Telemetry</h3>
          <p className="text-xs text-slate-400">Historical execution runs and row reconciliation metrics</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-[#0a0f1d]/50 text-slate-400 font-medium">
              <th className="py-3 px-4">Run ID</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Start Time (UTC)</th>
              <th className="py-3 px-4 text-right">Input</th>
              <th className="py-3 px-4 text-right">Accepted</th>
              <th className="py-3 px-4 text-right">Rejected</th>
              <th className="py-3 px-4 text-right">Features</th>
              <th className="py-3 px-4 text-right">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
            {isLoading ? (
              <tr>
                <td colSpan="9" className="py-8 text-center text-slate-500 font-sans">
                  Loading operational execution logs...
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan="9" className="py-8 text-center text-slate-500 font-sans">
                  No pipeline execution runs recorded yet. Trigger a run to populate.
                </td>
              </tr>
            ) : (
              runs.map((r) => (
                <tr key={r.run_id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-4 font-semibold text-blue-400">{r.run_id}</td>
                  <td className="py-2.5 px-4 font-sans text-slate-300">
                    <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-[11px]">
                      {r.run_type}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-sans">{getStatusBadge(r.status)}</td>
                  <td className="py-2.5 px-4 text-slate-400">{r.start_time?.replace('T', ' ').substring(0, 19)}</td>
                  <td className="py-2.5 px-4 text-right text-slate-200">{r.input_rows}</td>
                  <td className="py-2.5 px-4 text-right text-emerald-400 font-semibold">{r.accepted_rows}</td>
                  <td className="py-2.5 px-4 text-right text-rose-400 font-semibold">{r.rejected_rows}</td>
                  <td className="py-2.5 px-4 text-right text-blue-400">{r.feature_rows}</td>
                  <td className="py-2.5 px-4 text-right text-slate-400">
                    {Number(r.duration_seconds).toFixed(2)}s
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

