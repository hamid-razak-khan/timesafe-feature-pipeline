import React, { useState, useEffect } from 'react';
import { ShieldAlert, Search, RefreshCw, Filter, Eye, AlertTriangle, Wrench, CheckCircle2 } from 'lucide-react';
import apiClient from '../services/api';
import CorrectionModal from '../components/CorrectionModal';

export default function DataQuality() {
  const [rejects, setRejects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchReason, setSearchReason] = useState('');
  const [selectedRun, setSelectedRun] = useState('all');
  const [expandedRecord, setExpandedRecord] = useState(null);
  const [selectedCorrectionReject, setSelectedCorrectionReject] = useState(null);
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[rgba(168,85,247,0.18)]">
        <div>
          <h2 className="text-xl font-bold text-[#F8F7FF] tracking-tight">Data Quality & Quarantine Store</h2>
          <p className="text-xs text-[#A1A1B5] mt-0.5">
            Traceable operational quarantine for malformed, non-referential, or conflicting source records
          </p>
        </div>

        <button
          onClick={loadRejects}
          className="flex items-center space-x-1.5 p-2 rounded-lg bg-[#211936] hover:bg-[#2c2247] text-[#F8F7FF] border border-[rgba(168,85,247,0.25)] text-xs transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#8B5CF6]' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-[#A1A1B5] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by rejection reason..."
              value={searchReason}
              onChange={(e) => setSearchReason(e.target.value)}
              className="w-full bg-[#10101F] border border-[rgba(168,85,247,0.25)] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#F8F7FF] placeholder-[#A1A1B5] focus:outline-none focus:border-[#8B5CF6]"
            />
          </div>

          <select
            value={selectedRun}
            onChange={(e) => setSelectedRun(e.target.value)}
            className="bg-[#10101F] border border-[rgba(168,85,247,0.25)] rounded-lg px-3 py-1.5 text-xs text-[#F8F7FF] focus:outline-none focus:border-[#8B5CF6]"
          >
            <option value="all">All Pipeline Runs</option>
            {uniqueRuns.map((runId) => (
              <option key={runId} value={runId}>
                {runId}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-[#A1A1B5]">
          Showing <span className="font-semibold text-rose-400">{filtered.length}</span> quarantined records
        </span>
      </div>

      {/* Rejection Records Table */}
      <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[rgba(168,85,247,0.18)] bg-[#10101F]/80 text-[#A1A1B5] font-medium">
                <th className="py-3 px-4">Reject ID</th>
                <th className="py-3 px-4">Source File</th>
                <th className="py-3 px-4 text-right">Row #</th>
                <th className="py-3 px-4">Rejection Reason</th>
                <th className="py-3 px-4">Run ID</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Rejected At (UTC)</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(168,85,247,0.1)] font-mono text-[#F8F7FF]">
              {isLoading ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-[#A1A1B5] font-sans">
                    Loading quarantined records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-[#A1A1B5] font-sans">
                    No quarantined records found. All processed rows satisfied validation rules.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.reject_id} className="hover:bg-[#211936]/40 transition-colors">
                    <td className="py-2.5 px-4 font-semibold text-rose-400">{item.reject_id}</td>
                    <td className="py-2.5 px-4 font-sans text-[#F8F7FF]">{item.source_file}</td>
                    <td className="py-2.5 px-4 text-right text-[#A1A1B5] font-semibold">{item.source_row_number}</td>
                    <td className="py-2.5 px-4 font-sans">
                      <span className="px-2 py-0.5 rounded text-[11px] bg-rose-500/10 border border-rose-500/20 text-rose-400 font-medium">
                        {item.rejection_reason}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-[#A1A1B5]">{item.run_id}</td>
                    <td className="py-2.5 px-4 font-sans">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                        item.resolution_status === 'reprocessed'
                          ? 'bg-[#8B5CF6]/15 text-[#D8B4FE] border-[#8B5CF6]/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        {item.resolution_status || 'unresolved'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-[#A1A1B5]">{item.rejected_at?.replace('T', ' ').substring(0, 19)}</td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5 font-sans">
                        <button
                          onClick={() => setExpandedRecord(expandedRecord === item.reject_id ? null : item.reject_id)}
                          className="p-1 hover:bg-[#211936] rounded text-[#A1A1B5] hover:text-[#F8F7FF] transition-colors"
                          title="View raw record"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => {
                            setSelectedCorrectionReject(item);
                            setIsCorrectionOpen(true);
                          }}
                          className="px-2 py-0.5 rounded bg-[#8B5CF6]/20 hover:bg-[#8B5CF6]/30 text-[#D8B4FE] border border-[#8B5CF6]/30 text-[11px] font-medium transition-colors flex items-center space-x-1"
                          title="Review and correct this record"
                        >
                          <Wrench className="w-3 h-3" />
                          <span>Fix</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review & Fix Modal */}
      {selectedCorrectionReject && (
        <CorrectionModal
          isOpen={isCorrectionOpen}
          onClose={() => {
            setIsCorrectionOpen(false);
            setSelectedCorrectionReject(null);
          }}
          rejectRecord={selectedCorrectionReject}
          onReprocessSuccess={() => {
            loadRejects();
          }}
        />
      )}

      {/* Record Inspector Modal / Box */}
      {expandedRecord && (
        <div className="bg-[#16112B] border border-[#8B5CF6]/40 rounded-xl p-5 shadow-lg space-y-2">
          <div className="flex items-center justify-between border-b border-[rgba(168,85,247,0.18)] pb-2">
            <h4 className="text-xs font-semibold text-[#F8F7FF]">Raw Quarantined Record Payload ({expandedRecord})</h4>
            <button
              onClick={() => setExpandedRecord(null)}
              className="text-xs text-[#A1A1B5] hover:text-[#F8F7FF]"
            >
              Close
            </button>
          </div>
          <pre className="p-3 bg-[#10101F] rounded-lg text-xs font-mono text-emerald-400 overflow-x-auto border border-[rgba(168,85,247,0.15)]">
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

