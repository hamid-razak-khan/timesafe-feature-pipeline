import React, { useState, useEffect } from 'react';
import { 
  History as HistoryIcon, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Layers, 
  Wrench, 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink,
  Calendar,
  FileSpreadsheet,
  Cpu,
  Info
} from 'lucide-react';
import apiClient from '../services/api';
import CorrectionModal from '../components/CorrectionModal';
import RecordDetailModal from '../components/RecordDetailModal';

export default function History({ onOpenAdvanced }) {
  const [activeTab, setActiveTab] = useState('records'); // 'records' or 'runs'

  // Tab A: Record History State
  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [filterOptions, setFilterOptions] = useState({ source_files: [], error_categories: [], statuses: [] });
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 20;

  // Filters for Records
  const [search, setSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Tab B: Processing History (Runs) State
  const [runs, setRuns] = useState([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [runStatusFilter, setRunStatusFilter] = useState('all');
  const [runSearch, setRunSearch] = useState('');

  // Modals
  const [selectedDetailId, setSelectedDetailId] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedReject, setSelectedReject] = useState(null);
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);

  // Fetch Record History
  const fetchRecords = async () => {
    setIsLoadingRecords(true);
    try {
      const params = {
        search: search.trim() || undefined,
        source_file: selectedFile !== 'all' ? selectedFile : undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
        error_category: selectedCategory !== 'all' ? selectedCategory : undefined,
        page,
        limit,
      };
      const res = await apiClient.getHistoryRecords(params);
      setRecords(res.records || []);
      setTotalRecords(res.total || 0);
      if (res.filter_options) {
        setFilterOptions(res.filter_options);
      }
    } catch (err) {
      console.error('Failed to load record history:', err);
    } finally {
      setIsLoadingRecords(false);
    }
  };

  // Fetch Processing Runs
  const fetchRuns = async () => {
    setIsLoadingRuns(true);
    try {
      const params = {
        status: runStatusFilter !== 'all' ? runStatusFilter : undefined,
        search: runSearch.trim() || undefined,
        limit: 50,
      };
      const res = await apiClient.getHistoryRuns(params);
      setRuns(res.runs || []);
      setTotalRuns(res.total || 0);
    } catch (err) {
      console.error('Failed to load processing history runs:', err);
    } finally {
      setIsLoadingRuns(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'records') {
      fetchRecords();
    } else {
      fetchRuns();
    }
  }, [activeTab, page, selectedFile, selectedStatus, selectedCategory, runStatusFilter]);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'records') {
        setPage(1);
        fetchRecords();
      } else {
        fetchRuns();
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search, runSearch]);

  const handleExportCSV = () => {
    const params = {
      search: search.trim() || undefined,
      source_file: selectedFile !== 'all' ? selectedFile : undefined,
      status: selectedStatus !== 'all' ? selectedStatus : undefined,
      error_category: selectedCategory !== 'all' ? selectedCategory : undefined,
    };
    const url = apiClient.getExportHistoryUrl(params);
    window.open(url, '_blank');
  };

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

  const totalPages = Math.ceil(totalRecords / limit) || 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[rgba(168,85,247,0.18)]">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-2xl font-extrabold text-[#F8F7FF] tracking-tight">History & Audits</h2>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] text-[#D8B4FE]">
              Immutable Ledger
            </span>
          </div>
          <p className="text-xs text-[#A1A1B5] mt-1">
            Track original source records, validation outcomes, corrections, and processing pipeline runs.
          </p>
        </div>

        {/* Tab Toggle Switch */}
        <div className="flex items-center p-1 bg-[#10101F] border border-[rgba(168,85,247,0.2)] rounded-xl">
          <button
            onClick={() => setActiveTab('records')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'records'
                ? 'bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] text-white shadow-[0_0_12px_-2px_rgba(168,85,247,0.4)]'
                : 'text-[#A1A1B5] hover:text-[#F8F7FF]'
            }`}
          >
            Record History
          </button>
          <button
            onClick={() => setActiveTab('runs')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'runs'
                ? 'bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] text-white shadow-[0_0_12px_-2px_rgba(168,85,247,0.4)]'
                : 'text-[#A1A1B5] hover:text-[#F8F7FF]'
            }`}
          >
            Processing History
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB A: RECORD HISTORY */}
      {/* ========================================================================= */}
      {activeTab === 'records' && (
        <div className="space-y-4">
          {/* Filter & Action Toolbar */}
          <div className="p-4 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Bar */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#A1A1B5] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Record ID, Entity ID, or error reason..."
                className="w-full bg-[#211936] border border-[rgba(168,85,247,0.25)] rounded-xl pl-9 pr-4 py-2 text-xs text-[#F8F7FF] placeholder-[#A1A1B5] focus:outline-none focus:border-[#A855F7] transition-colors"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Dataset Filter */}
              <select
                value={selectedFile}
                onChange={(e) => {
                  setSelectedFile(e.target.value);
                  setPage(1);
                }}
                className="bg-[#211936] border border-[rgba(168,85,247,0.25)] rounded-xl px-3 py-2 text-xs text-[#F8F7FF] focus:outline-none focus:border-[#A855F7]"
              >
                <option value="all">All Datasets</option>
                {filterOptions.source_files?.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setPage(1);
                }}
                className="bg-[#211936] border border-[rgba(168,85,247,0.25)] rounded-xl px-3 py-2 text-xs text-[#F8F7FF] focus:outline-none focus:border-[#A855F7]"
              >
                <option value="all">All Statuses</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="reprocessed">Reprocessed</option>
                <option value="corrected">Corrected</option>
              </select>

              {/* Error Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setPage(1);
                }}
                className="bg-[#211936] border border-[rgba(168,85,247,0.25)] rounded-xl px-3 py-2 text-xs text-[#F8F7FF] focus:outline-none focus:border-[#A855F7]"
              >
                <option value="all">All Categories</option>
                {filterOptions.error_categories?.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* Export CSV Button */}
              <button
                onClick={handleExportCSV}
                className="flex items-center space-x-1.5 bg-[#211936] hover:bg-[#16112B] text-[#F8F7FF] border border-[rgba(168,85,247,0.3)] hover:border-[#A855F7]/50 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all"
                title="Export filtered records as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              <button
                onClick={fetchRecords}
                className="p-2 bg-[#211936] hover:bg-[#16112B] text-[#A1A1B5] hover:text-[#F8F7FF] border border-[rgba(168,85,247,0.25)] rounded-xl transition-colors"
                title="Refresh table"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRecords ? 'animate-spin text-[#A855F7]' : ''}`} />
              </button>
            </div>
          </div>

          {/* Record History Table */}
          <div className="rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[rgba(168,85,247,0.15)] text-[11px] text-[#A1A1B5] uppercase tracking-wider bg-[#10101F]/70">
                    <th className="py-3 px-4">Record ID</th>
                    <th className="py-3 px-4">Entity ID</th>
                    <th className="py-3 px-4">Source Dataset</th>
                    <th className="py-3 px-4">Event Date</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Rejection Diagnostic</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(168,85,247,0.1)] font-sans">
                  {isLoadingRecords ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[#A1A1B5]">
                        <div className="flex items-center justify-center space-x-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-[#A855F7]" />
                          <span>Loading records audit log...</span>
                        </div>
                      </td>
                    </tr>
                  ) : records.length > 0 ? (
                    records.map((r) => (
                      <tr key={r.history_id} className="hover:bg-[#211936]/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-[#F8F7FF]">
                          {r.record_id}
                        </td>
                        <td className="py-3 px-4 font-mono text-[#D8B4FE]">
                          {r.entity_id || '—'}
                        </td>
                        <td className="py-3 px-4 text-[#A1A1B5]">
                          <span className="truncate block max-w-[140px]" title={r.source_file}>
                            {r.source_file}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[#A1A1B5]">
                          {r.event_time ? new Date(r.event_time).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-4 font-mono text-[#F8F7FF]">
                          {r.amount !== null && r.amount !== undefined ? `$${Number(r.amount).toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${getStatusBadge(r.processing_status)}`}>
                            {r.processing_status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {r.rejection_title ? (
                            <div className="max-w-[200px]">
                              <span className="font-semibold text-rose-400 block truncate" title={r.rejection_reason}>
                                {r.rejection_title}
                              </span>
                              <span className="text-[10px] text-[#A1A1B5] font-mono truncate block">
                                {r.rejection_category}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[#A1A1B5]/50 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => {
                                setSelectedDetailId(r.history_id);
                                setIsDetailOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-xl bg-[#211936] hover:bg-[#16112B] text-[#F8F7FF] text-[11px] font-semibold border border-[rgba(168,85,247,0.25)] transition-all"
                              title="View complete record lifecycle and audit events"
                            >
                              Lifecycle
                            </button>

                            {r.processing_status !== 'accepted' && (
                              <button
                                onClick={() => {
                                  setSelectedReject({
                                    reject_id: r.history_id.replace('HIST_', ''),
                                    source_file: r.source_file,
                                    source_row_number: r.source_row_number,
                                    rejection_reason: r.rejection_reason,
                                    rejection_title: r.rejection_title,
                                    raw_record: r.original_payload,
                                    amount: r.amount,
                                    entity_id: r.entity_id,
                                    record_id: r.record_id,
                                    event_time: r.event_time,
                                    available_at: r.available_at,
                                    event_type: r.event_type,
                                  });
                                  setIsCorrectionOpen(true);
                                }}
                                className="px-2.5 py-1 rounded-xl bg-[#8B5CF6]/20 hover:bg-[#8B5CF6]/30 text-[#D8B4FE] border border-[rgba(168,85,247,0.4)] text-[11px] font-semibold transition-all flex items-center space-x-1"
                                title="Review and correct this quarantined record"
                              >
                                <Wrench className="w-3 h-3 text-[#A855F7]" />
                                <span>Fix</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[#A1A1B5]">
                        No records match the current filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-[rgba(168,85,247,0.18)] flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#10101F] text-xs text-[#A1A1B5]">
              <div>
                Showing <span className="font-semibold text-[#F8F7FF]">{(page - 1) * limit + 1}</span> to{' '}
                <span className="font-semibold text-[#F8F7FF]">{Math.min(page * limit, totalRecords)}</span> of{' '}
                <span className="font-semibold text-[#F8F7FF]">{totalRecords}</span> records
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-xl bg-[#211936] hover:bg-[#16112B] text-[#F8F7FF] border border-[rgba(168,85,247,0.25)] transition-colors disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono px-2 text-[#D8B4FE]">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-xl bg-[#211936] hover:bg-[#16112B] text-[#F8F7FF] border border-[rgba(168,85,247,0.25)] transition-colors disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB B: PROCESSING HISTORY (RUNS) */}
      {/* ========================================================================= */}
      {activeTab === 'runs' && (
        <div className="space-y-4">
          {/* Subtitle Banner */}
          <div className="p-4 rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#F8F7FF]">Processing History</h3>
              <p className="text-xs text-[#A1A1B5] mt-0.5">
                Track uploads, processing results, errors, and previous pipeline runs.
              </p>
            </div>

            {/* Filter toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#A1A1B5] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={runSearch}
                  onChange={(e) => setRunSearch(e.target.value)}
                  placeholder="Search Run ID..."
                  className="bg-[#211936] border border-[rgba(168,85,247,0.25)] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#F8F7FF] placeholder-[#A1A1B5] focus:outline-none focus:border-[#A855F7] w-48"
                />
              </div>

              <select
                value={runStatusFilter}
                onChange={(e) => setRunStatusFilter(e.target.value)}
                className="bg-[#211936] border border-[rgba(168,85,247,0.25)] rounded-xl px-3 py-1.5 text-xs text-[#F8F7FF] focus:outline-none focus:border-[#A855F7]"
              >
                <option value="all">All Statuses</option>
                <option value="success">Success</option>
                <option value="warnings">Warnings / Rejections</option>
                <option value="failed">Failed</option>
              </select>

              <button
                onClick={fetchRuns}
                className="p-1.5 bg-[#211936] hover:bg-[#16112B] text-[#A1A1B5] hover:text-[#F8F7FF] border border-[rgba(168,85,247,0.25)] rounded-xl transition-colors"
                title="Refresh runs"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingRuns ? 'animate-spin text-[#A855F7]' : ''}`} />
              </button>
            </div>
          </div>

          {/* Runs Execution Table */}
          <div className="rounded-2xl bg-[#16112B] border border-[rgba(168,85,247,0.18)] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[rgba(168,85,247,0.15)] text-[11px] text-[#A1A1B5] uppercase tracking-wider bg-[#10101F]/70">
                    <th className="py-3 px-4">Run ID & Type</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Started At</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Input Rows</th>
                    <th className="py-3 px-4">Accepted</th>
                    <th className="py-3 px-4">Rejected</th>
                    <th className="py-3 px-4">Features</th>
                    <th className="py-3 px-4">Reconciliation</th>
                    <th className="py-3 px-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(168,85,247,0.1)] font-sans">
                  {isLoadingRuns ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-[#A1A1B5]">
                        <div className="flex items-center justify-center space-x-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-[#A855F7]" />
                          <span>Loading processing runs...</span>
                        </div>
                      </td>
                    </tr>
                  ) : runs.length > 0 ? (
                    runs.map((r) => {
                      const badgeColor =
                        r.status_badge === 'green'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : r.status_badge === 'amber'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30';

                      return (
                        <tr key={r.run_id} className="hover:bg-[#211936]/40 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-[#F8F7FF]">{r.friendly_type}</div>
                            <div className="text-[10px] font-mono text-[#A1A1B5] mt-0.5">{r.run_id}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-[#A1A1B5]">
                            {r.start_time ? new Date(r.start_time).toLocaleString() : '—'}
                          </td>
                          <td className="py-3 px-4 font-mono text-[#D8B4FE]">
                            {r.duration_seconds}s
                          </td>
                          <td className="py-3 px-4 font-medium text-[#F8F7FF]">
                            {r.input_rows?.toLocaleString() || 0}
                          </td>
                          <td className="py-3 px-4 text-emerald-400 font-medium">
                            {r.accepted_rows?.toLocaleString() || 0}
                          </td>
                          <td className="py-3 px-4">
                            {r.rejected_rows > 0 ? (
                              <span className="text-rose-400 font-semibold">{r.rejected_rows}</span>
                            ) : (
                              <span className="text-[#A1A1B5]">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[#D8B4FE] font-medium">
                            {r.feature_rows || 0}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {r.reconciliation_status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                if (onOpenAdvanced) onOpenAdvanced();
                              }}
                              className="text-xs text-[#D8B4FE] hover:text-white font-medium hover:underline inline-flex items-center space-x-1"
                            >
                              <span>Inspect</span>
                              <ExternalLink className="w-3 h-3 text-[#A855F7]" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-[#A1A1B5]">
                        No processing pipeline runs recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Record Lifecycle Modal */}
      {selectedDetailId && (
        <RecordDetailModal
          isOpen={isDetailOpen}
          onClose={() => {
            setIsDetailOpen(false);
            setSelectedDetailId(null);
          }}
          historyId={selectedDetailId}
          onOpenCorrection={(rej) => {
            setSelectedReject(rej);
            setIsCorrectionOpen(true);
          }}
        />
      )}

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
            fetchRecords();
            fetchRuns();
          }}
        />
      )}
    </div>
  );
}

