import React, { useState, useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  FileText, 
  ShieldCheck, 
  History, 
  ArrowRight, 
  Wrench,
  Layers,
  Calendar,
  AlertCircle
} from 'lucide-react';
import apiClient from '../services/api';

export default function RecordDetailModal({ isOpen, onClose, historyId, onOpenCorrection }) {
  if (!isOpen || !historyId) return null;

  const [detail, setDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDetail = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiClient.getHistoryRecordDetail(historyId);
        setDetail(res);
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load record lifecycle details.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchDetail();
  }, [historyId]);

  const rec = detail?.record;

  const getStatusBadge = (status) => {
    switch (status?.toLowerCase()) {
      case 'accepted':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'reprocessed':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'corrected':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'rejected':
      case 'quarantined':
      default:
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#16112B] border border-[rgba(168,85,247,0.25)] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl shadow-[#8B5CF6]/10 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[rgba(168,85,247,0.18)] flex items-center justify-between bg-[#10101F]">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 flex items-center justify-center text-[#D8B4FE]">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-[#F8F7FF]">Record Lifecycle & Audit Trail</h3>
                {rec?.processing_status && (
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${getStatusBadge(rec.processing_status)}`}>
                    {rec.processing_status}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#D8B4FE] font-mono mt-0.5">
                ID: {rec?.record_id || historyId}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#A1A1B5] hover:text-[#F8F7FF] hover:bg-[#211936] transition-colors border border-transparent hover:border-[rgba(168,85,247,0.2)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 bg-[#080811]">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-2 border-[#8B5CF6] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs text-[#A1A1B5]">Loading record audit history...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <>
              {/* Snapshot Notice if applicable */}
              {detail?.affected_snapshots_warning && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start space-x-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <p className="leading-relaxed">{detail.affected_snapshots_warning}</p>
                </div>
              )}

              {/* Record Summary Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.18)]">
                  <span className="text-[10px] text-[#A1A1B5] uppercase tracking-wider font-semibold block">Entity ID</span>
                  <span className="text-xs font-mono font-medium text-[#F8F7FF] mt-0.5 block truncate">
                    {rec?.entity_id || '—'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.18)]">
                  <span className="text-[10px] text-[#A1A1B5] uppercase tracking-wider font-semibold block">Amount</span>
                  <span className="text-xs font-mono font-medium text-[#F8F7FF] mt-0.5 block">
                    {rec?.amount !== null && rec?.amount !== undefined ? `$${Number(rec.amount).toFixed(2)}` : '—'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.18)]">
                  <span className="text-[10px] text-[#A1A1B5] uppercase tracking-wider font-semibold block">Source File</span>
                  <span className="text-xs font-medium text-[#F8F7FF] mt-0.5 block truncate">
                    {rec?.source_file} (row {rec?.source_row_number})
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.18)]">
                  <span className="text-[10px] text-[#A1A1B5] uppercase tracking-wider font-semibold block">Event Type</span>
                  <span className="text-xs font-medium text-[#F8F7FF] mt-0.5 block capitalize">
                    {rec?.event_type || 'transaction'}
                  </span>
                </div>
              </div>

              {/* Timestamps Card */}
              <div className="p-4 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] space-y-2 text-xs">
                <div className="flex items-center space-x-2 text-[#D8B4FE] font-semibold mb-2">
                  <Clock className="w-3.5 h-3.5 text-[#8B5CF6]" />
                  <span>Dual Timestamps & Anti-Leakage Tracking</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-[11px]">
                  <div className="flex justify-between border-b border-[rgba(168,85,247,0.12)] pb-1.5">
                    <span className="text-[#A1A1B5]">Event Time:</span>
                    <span className="text-[#F8F7FF]">{rec?.event_time || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b border-[rgba(168,85,247,0.12)] pb-1.5">
                    <span className="text-[#A1A1B5]">Available At:</span>
                    <span className="text-[#D8B4FE]">{rec?.available_at || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b border-[rgba(168,85,247,0.12)] pb-1.5">
                    <span className="text-[#A1A1B5]">Initial Run ID:</span>
                    <span className="text-[#F8F7FF]">{rec?.initial_run_id}</span>
                  </div>
                  <div className="flex justify-between border-b border-[rgba(168,85,247,0.12)] pb-1.5">
                    <span className="text-[#A1A1B5]">Latest Run ID:</span>
                    <span className="text-[#F8F7FF]">{rec?.latest_run_id}</span>
                  </div>
                </div>
              </div>

              {/* Rejection Diagnostics if rejected */}
              {rec?.rejection_reason && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center space-x-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{rec.rejection_title || 'Rejection Diagnostic'}</span>
                    </span>
                    <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded font-mono">
                      {rec.rejection_category || 'Defective'}
                    </span>
                  </div>
                  <p className="text-xs text-rose-200 font-mono mt-1">
                    {rec.rejection_reason}
                  </p>
                </div>
              )}

              {/* Lifecycle Event Trail Timeline */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-[#D8B4FE] uppercase tracking-wider flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#8B5CF6]" />
                  <span>Processing Lifecycle Timeline</span>
                </span>

                {detail?.events && detail.events.length > 0 ? (
                  <div className="space-y-2 border-l-2 border-[#8B5CF6]/30 ml-2 pl-4 py-1">
                    {detail.events.map((evt, idx) => (
                      <div key={evt.event_id || idx} className="relative group">
                        <div className="absolute -left-[23px] top-1 w-2.5 h-2.5 rounded-full bg-[#8B5CF6] ring-4 ring-[#16112B]"></div>
                        <div className="p-2.5 rounded-lg bg-[#16112B] border border-[rgba(168,85,247,0.18)] text-xs">
                          <div className="flex items-center justify-between text-[11px] text-[#A1A1B5] mb-1">
                            <span className="font-semibold text-[#F8F7FF] capitalize">
                              {evt.event_type?.replace(/_/g, ' ')}
                            </span>
                            <span className="font-mono text-[#A1A1B5]">{evt.created_at}</span>
                          </div>
                          <p className="text-[#F8F7FF] text-[11px] leading-relaxed">{evt.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-[#16112B] border border-[rgba(168,85,247,0.18)] text-xs text-[#A1A1B5]">
                    No individual lifecycle events recorded for this record.
                  </div>
                )}
              </div>

              {/* Original Raw Payload */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-[#A1A1B5] uppercase tracking-wider flex items-center space-x-1.5">
                  <FileText className="w-3.5 h-3.5 text-[#8B5CF6]" />
                  <span>Original Raw Input Payload</span>
                </span>
                <div className="p-3 rounded-xl bg-[#10101F] border border-[rgba(168,85,247,0.18)] font-mono text-xs text-[#F8F7FF] max-h-44 overflow-y-auto shadow-inner">
                  <pre className="whitespace-pre-wrap">{detail?.original_payload}</pre>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[rgba(168,85,247,0.18)] bg-[#10101F] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-[#A1A1B5] hover:text-[#F8F7FF] hover:bg-[#211936] transition-colors"
          >
            Close
          </button>

          {rec?.processing_status !== 'accepted' && (
            <button
              onClick={() => {
                onClose();
                if (onOpenCorrection) {
                  onOpenCorrection({
                    reject_id: detail?.reject_id || rec?.record_id,
                    source_file: rec?.source_file,
                    source_row_number: rec?.source_row_number,
                    rejection_reason: rec?.rejection_reason,
                    rejection_title: rec?.rejection_title,
                    raw_record: detail?.original_payload,
                    amount: rec?.amount,
                    entity_id: rec?.entity_id,
                    record_id: rec?.record_id,
                    event_time: rec?.event_time,
                    available_at: rec?.available_at,
                    event_type: rec?.event_type,
                  });
                }
              }}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] hover:opacity-95 text-white text-xs font-semibold flex items-center space-x-1.5 transition-opacity shadow-lg shadow-[#8B5CF6]/25"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Review & Fix Record</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

