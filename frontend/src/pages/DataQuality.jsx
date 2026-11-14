import React, { useState, useEffect } from 'react';
import { ShieldAlert, Search, RefreshCw, Filter, Eye, AlertTriangle } from 'lucide-react';
import apiClient from '../services/api';

export default function DataQuality() {
  const [rejects, setRejects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchReason, setSearchReason] = useState('');
  const [selectedRun, setSelectedRun] = useState('all');
  const [expandedRecord, setExpandedRecord] = useState(null);

  const loadRejects = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.getRejects({ limit: 500 });
      setRejects(data);
    } catch (err) {
      console.error('Failed to load quarantined records:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRejects();
  }, []);

  const uniqueRuns = Array.from(new Set(rejects.map((r) => r.run_id))).filter(Boolean);

  const filtered = rejects.filter((r) => {
    const matchesReason =
      r.rejection_reason.toLowerCase().includes(searchReason.toLowerCase()) ||
      r.source_file.toLowerCase().includes(searchReason.toLowerCase());
    const matchesRun = selectedRun === 'all' || r.run_id === selectedRun;
    return matchesReason && matchesRun;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-100 tracking-tight">Data Quality & Quarantine Store</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Traceable operational quarantine for malformed, non-referential, or conflicting source records
          </p>
        </div>

        <button
          onClick={loadRejects}
          className="flex items-center space-x-1.5 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by rejection reason..."
              value={searchReason}
              onChange={(e) => setSearchReason(e.target.value)}
              className="w-full bg-[#0a0f1d] border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={selectedRun}
            onChange={(e) => setSelectedRun(e.target.value)}
            className="bg-[#0a0f1d] border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Pipeline Runs</option>
            {uniqueRuns.map((runId) => (
              <option key={runId} value={runId}>
                {runId}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-slate-400">
          Showing <span className="font-semibold text-rose-400">{filtered.length}</span> quarantined records
        </span>
      </div>

      {/* Rejection Records Table */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0a0f1d]/50 text-slate-400 font-medium">
                <th className="py-3 px-4">Reject ID</th>
                <th className="py-3 px-4">Source File</th>
                <th className="py-3 px-4 text-right">Row #</th>
                <th className="py-3 px-4">Rejection Reason</th>
                <th className="py-3 px-4">Run ID</th>
                <th className="py-3 px-4">Rejected At (UTC)</th>
                <th className="py-3 px-4 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
              {isLoading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500 font-sans">
                    Loading quarantined records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500 font-sans">
                    No quarantined records found. All processed rows satisfied validation rules.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.reject_id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 font-semibold text-rose-400">{item.reject_id}</td>
                    <td className="py-2.5 px-4 font-sans text-slate-300">{item.source_file}</td>
                    <td className="py-2.5 px-4 text-right text-slate-400 font-semibold">{item.source_row_number}</td>
                    <td className="py-2.5 px-4 font-sans">
                      <span className="px-2 py-0.5 rounded text-[11px] bg-rose-500/10 border border-rose-500/20 text-rose-400 font-medium">
                        {item.rejection_reason}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">{item.run_id}</td>
                    <td className="py-2.5 px-4 text-slate-400">{item.rejected_at?.replace('T', ' ').substring(0, 19)}</td>
                    <td className="py-2.5 px-4 text-center">
                      <button
                        onClick={() => setExpandedRecord(expandedRecord === item.reject_id ? null : item.reject_id)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
                        title="View raw record"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Inspector Modal / Box */}
      {expandedRecord && (
        <div className="bg-[#0f172a] border border-blue-500/40 rounded-xl p-5 shadow-lg space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="text-xs font-semibold text-slate-200">Raw Quarantined Record Payload ({expandedRecord})</h4>
            <button
              onClick={() => setExpandedRecord(null)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Close
            </button>
          </div>
          <pre className="p-3 bg-[#0a0f1d] rounded-lg text-xs font-mono text-emerald-400 overflow-x-auto">
            {JSON.stringify(
              JSON.parse(
                rejects.find((r) => r.reject_id === expandedRecord)?.raw_record || '{}'
              ),
              null,
              2
            )}
          </pre>
        </div>
      )}
    </div>
  );
}

