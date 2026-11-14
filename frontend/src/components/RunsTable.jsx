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
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#8B5CF6]/10 text-[#D8B4FE] border border-[rgba(168,85,247,0.3)]">
            <Clock className="w-3 h-3 animate-spin text-[#8B5CF6]" />
            <span>Running</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-[rgba(168,85,247,0.18)] bg-[#10101F] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#F8F7FF]">Operational Pipeline Execution Telemetry</h3>
          <p className="text-xs text-[#A1A1B5]">Historical execution runs and row reconciliation metrics</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[rgba(168,85,247,0.18)] bg-[#10101F]/80 text-[#A1A1B5] font-medium">
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
          <tbody className="divide-y divide-[rgba(168,85,247,0.1)] font-mono text-[#F8F7FF]">
            {isLoading ? (
              <tr>
                <td colSpan="9" className="py-8 text-center text-[#A1A1B5] font-sans">
                  Loading operational execution logs...
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan="9" className="py-8 text-center text-[#A1A1B5] font-sans">
                  No pipeline execution runs recorded yet. Trigger a run to populate.
                </td>
              </tr>
            ) : (
              runs.map((r) => (
                <tr key={r.run_id} className="hover:bg-[#211936]/40 transition-colors">
                  <td className="py-2.5 px-4 font-semibold text-[#D8B4FE]">{r.run_id}</td>
                  <td className="py-2.5 px-4 font-sans text-[#F8F7FF]">
                    <span className="px-2 py-0.5 rounded bg-[#211936] border border-[rgba(168,85,247,0.25)] text-[11px] text-[#D8B4FE]">
                      {r.run_type}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-sans">{getStatusBadge(r.status)}</td>
                  <td className="py-2.5 px-4 text-[#A1A1B5]">{r.start_time?.replace('T', ' ').substring(0, 19)}</td>
                  <td className="py-2.5 px-4 text-right text-[#F8F7FF]">{r.input_rows}</td>
                  <td className="py-2.5 px-4 text-right text-emerald-400 font-semibold">{r.accepted_rows}</td>
                  <td className="py-2.5 px-4 text-right text-rose-400 font-semibold">{r.rejected_rows}</td>
                  <td className="py-2.5 px-4 text-right text-[#D8B4FE] font-semibold">{r.feature_rows}</td>
                  <td className="py-2.5 px-4 text-right text-[#A1A1B5]">
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

