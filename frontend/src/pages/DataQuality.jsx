import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, 
  Search, 
  RefreshCw, 
  Filter, 
  Eye, 
  AlertTriangle, 
  Wrench, 
  CheckCircle2, 
  Download, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  History, 
  Calendar, 
  ArrowUpDown, 
  SlidersHorizontal, 
  Copy, 
  Check, 
  X, 
  FileText 
} from 'lucide-react';
import apiClient from '../services/api';
import CorrectionModal from '../components/CorrectionModal';
import RecordDetailModal from '../components/RecordDetailModal';

export default function DataQuality() {
  // Server-side data states
  const [records, setRecords] = useState([]);
  const [totalMatching, setTotalMatching] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalStored, setTotalStored] = useState(0);
  const [totalUnresolved, setTotalUnresolved] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Dynamic filter metadata choices from backend
  const [filterOptions, setFilterOptions] = useState({
    source_files: [],
    rejection_reasons: [],
    resolution_statuses: [],
    pipeline_runs: [],
    total_stored: 0,
    total_unresolved: 0,
  });

  // Filter form states
  const [search, setSearch] = useState('');
  const [sourceFile, setSourceFile] = useState('all');
  const [rejectionReason, setRejectionReason] = useState('all');
  const [resolutionStatus, setResolutionStatus] = useState('all');
  const [selectedRun, setSelectedRun] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Modals & Inspectors
  const [expandedRecord, setExpandedRecord] = useState(null);
  const [selectedCorrectionReject, setSelectedCorrectionReject] = useState(null);
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);
  const [selectedDetailId, setSelectedDetailId] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Stale request guard
  const requestIdRef = useRef(0);

  // Load filter options on mount
  const loadFilterOptions = async () => {
    try {
      const opts = await apiClient.getRejectsFilterOptions();
      setFilterOptions(opts);
    } catch (err) {
      console.error('Failed to load reject filter options:', err);
    }
  };

  useEffect(() => {
    loadFilterOptions();
  }, []);

  // Fetch paginated rejected records with active filters
  const loadRejects = async () => {
    const currentReq = ++requestIdRef.current;
    setIsLoading(true);
    try {
      const params = {
        page,
        page_size: pageSize,
        sort: sortOrder,
      };

      if (sourceFile && sourceFile !== 'all') params.source_file = sourceFile;
      if (rejectionReason && rejectionReason !== 'all') params.rejection_reason = rejectionReason;
      if (resolutionStatus && resolutionStatus !== 'all') params.status = resolutionStatus;
      if (selectedRun && selectedRun !== 'all') params.run_id = selectedRun;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (search.trim()) params.search = search.trim();

      const data = await apiClient.getRejects(params);

      // Guard against out-of-order stale requests
      if (currentReq !== requestIdRef.current) return;

      if (data && typeof data === 'object' && Array.isArray(data.records)) {
        setRecords(data.records);
        setTotalMatching(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setTotalStored(data.total_stored || 0);
        setTotalUnresolved(data.total_unresolved || 0);
      } else if (Array.isArray(data)) {
        setRecords(data);
        setTotalMatching(data.length);
        setTotalPages(1);
      }
    } catch (err) {
      if (currentReq === requestIdRef.current) {
        console.error('Failed to load quarantined records:', err);
      }
    } finally {
      if (currentReq === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  // Trigger data fetch on filter or pagination change
  useEffect(() => {
    loadRejects();
  }, [
    page,
    pageSize,
    sortOrder,
    sourceFile,
    rejectionReason,
    resolutionStatus,
    selectedRun,
    startDate,
    endDate,
    search,
  ]);

  // Reset pagination to page 1 whenever any filter changes
  const handleFilterChange = (setter, value) => {
    setter(value);
    setPage(1);
  };

  // Clear all filters back to defaults
  const handleResetFilters = () => {
    setSearch('');
    setSourceFile('all');
    setRejectionReason('all');
    setResolutionStatus('all');
    setSelectedRun('all');
    setStartDate('');
    setEndDate('');
    setSortOrder('newest');
    setPage(1);
  };

  // Refresh data and dynamic options
  const handleRefresh = () => {
    loadFilterOptions();
    loadRejects();
  };

  // Export full filtered CSV (all matching records, not just visible page)
  const handleExportCsv = () => {
    const exportUrl = apiClient.getExportRejectsUrl({
      source_file: sourceFile !== 'all' ? sourceFile : undefined,
      rejection_reason: rejectionReason !== 'all' ? rejectionReason : undefined,
      status: resolutionStatus !== 'all' ? resolutionStatus : undefined,
      run_id: selectedRun !== 'all' ? selectedRun : undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      search: search.trim() || undefined,
      sort: sortOrder,
    });
    window.open(exportUrl, '_blank');
  };

  // Copy raw JSON to clipboard
  const handleCopyPayload = (raw) => {
    try {
      const formatted = JSON.stringify(typeof raw === 'string' ? JSON.parse(raw) : raw, null, 2);
      navigator.clipboard.writeText(formatted);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      navigator.clipboard.writeText(String(raw));
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  // Count active secondary filters
  const activeSecondaryCount = [
    selectedRun !== 'all',
    Boolean(startDate),
    Boolean(endDate),
    sortOrder !== 'newest',
  ].filter(Boolean).length;

  const totalActiveFilters = [
    sourceFile !== 'all',
    rejectionReason !== 'all',
    resolutionStatus !== 'all',
    selectedRun !== 'all',
    Boolean(startDate),
    Boolean(endDate),
    Boolean(search.trim()),
    sortOrder !== 'newest',
  ].filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* Header & High-Level KPI Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-[rgba(168,85,247,0.18)]">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl font-bold text-[#F8F7FF] tracking-tight">Data Quality & Quarantine Store</h2>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30">
              Audit Isolation
            </span>
          </div>
          <p className="text-xs text-[#A1A1B5] mt-1">
            Traceable operational quarantine with schema validation, causal time-boundary diagnostics, and safe reprocessing
          </p>
        </div>

        {/* Global Action Badges & Refresh */}
        <div className="flex items-center space-x-3 self-start sm:self-auto">
          <div className="hidden lg:flex items-center space-x-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-[#10101F] border border-[rgba(168,85,247,0.2)] text-[#A1A1B5]">
              Total Stored: <strong className="text-[#F8F7FF]">{totalStored || filterOptions.total_stored || 0}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400">
              Unresolved: <strong className="text-rose-300">{totalUnresolved || filterOptions.total_unresolved || 0}</strong>
            </span>
          </div>

          <button
            onClick={handleExportCsv}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#211936] hover:bg-[#2c2247] text-[#D8B4FE] border border-[rgba(168,85,247,0.25)] text-xs font-medium transition-colors shadow-sm"
            title="Export all matching quarantined records as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleRefresh}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#211936] hover:bg-[#2c2247] text-[#F8F7FF] border border-[rgba(168,85,247,0.25)] text-xs font-medium transition-colors shadow-sm"
            title="Refresh quarantine records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#8B5CF6]' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar Card */}
      <div className="bg-[#16112B] border border-[rgba(168,85,247,0.2)] rounded-xl p-4 space-y-3 shadow-md">
        {/* Row 1: Search, Source File (Highest Priority), Rejection Reason, Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#A1A1B5] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search ID, Entity, Row, Error..."
              value={search}
              onChange={(e) => handleFilterChange(setSearch, e.target.value)}
              className="w-full bg-[#10101F] border border-[rgba(168,85,247,0.25)] rounded-lg pl-8 pr-7 py-1.5 text-xs text-[#F8F7FF] placeholder-[#A1A1B5] focus:outline-none focus:border-[#8B5CF6] transition-colors"
            />
            {search && (
              <button
                onClick={() => handleFilterChange(setSearch, '')}
                className="absolute right-2.5 top-2 text-[#A1A1B5] hover:text-[#F8F7FF]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 2. Source File Filter (Highest Priority) */}
          <div>
            <select
              value={sourceFile}
              onChange={(e) => handleFilterChange(setSourceFile, e.target.value)}
              className="w-full bg-[#10101F] border border-[rgba(168,85,247,0.25)] rounded-lg px-3 py-1.5 text-xs text-[#F8F7FF] focus:outline-none focus:border-[#8B5CF6] font-sans transition-colors cursor-pointer"
            >
              <option value="all">Source File: All Files</option>
              {filterOptions.source_files.map((file) => (
                <option key={file.name} value={file.name}>
                  {file.name} ({file.count} rejects)
                </option>
              ))}
            </select>
          </div>

          {/* 3. Rejection Reason Filter */}
          <div>
            <select
              value={rejectionReason}
              onChange={(e) => handleFilterChange(setRejectionReason, e.target.value)}
              className="w-full bg-[#10101F] border border-[rgba(168,85,247,0.25)] rounded-lg px-3 py-1.5 text-xs text-[#F8F7FF] focus:outline-none focus:border-[#8B5CF6] font-sans transition-colors cursor-pointer"
            >
              <option value="all">Reason: All Rejection Reasons</option>
              {filterOptions.rejection_reasons.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.category}: {r.title} ({r.count})
                </option>
              ))}
            </select>
          </div>

          {/* 4. Resolution Status Filter */}
          <div className="flex items-center space-x-2">
            <select
              value={resolutionStatus}
              onChange={(e) => handleFilterChange(setResolutionStatus, e.target.value)}
              className="w-full bg-[#10101F] border border-[rgba(168,85,247,0.25)] rounded-lg px-3 py-1.5 text-xs text-[#F8F7FF] focus:outline-none focus:border-[#8B5CF6] font-sans transition-colors cursor-pointer"
            >
              <option value="all">Status: All Statuses</option>
              <option value="unresolved">
                Unresolved ({filterOptions.total_unresolved || totalUnresolved})
              </option>
              <option value="reprocessed">Reprocessed</option>
              <option value="corrected">Corrected</option>
              <option value="retry_failed">Retry Failed</option>
            </select>

            <button
              onClick={() => setShowMoreFilters(!showMoreFilters)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center space-x-1 transition-colors shrink-0 ${
                showMoreFilters || activeSecondaryCount > 0
                  ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-[#D8B4FE]'
                  : 'bg-[#10101F] border-[rgba(168,85,247,0.25)] text-[#A1A1B5] hover:text-[#F8F7FF]'
              }`}
              title="Toggle secondary filters (Pipeline run, date range, sort order)"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {activeSecondaryCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#8B5CF6] text-[10px] text-white flex items-center justify-center font-bold">
                  {activeSecondaryCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Row 2: Secondary / Expandable Filters (Pipeline Run, Date Range, Sort Order, Reset) */}
        {showMoreFilters && (
          <div className="pt-3 border-t border-[rgba(168,85,247,0.15)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-fadeIn">
            {/* Pipeline Run */}
            <div>
              <label className="block text-[10px] uppercase font-semibold text-[#A1A1B5] mb-1">
                Pipeline Execution Run
              </label>
              <select
                value={selectedRun}
                onChange={(e) => handleFilterChange(setSelectedRun, e.target.value)}
                className="w-full bg-[#10101F] border border-[rgba(168,85,247,0.25)] rounded-lg px-3 py-1.5 text-xs text-[#F8F7FF] focus:outline-none focus:border-[#8B5CF6] cursor-pointer"
              >
                <option value="all">All Pipeline Runs</option>
                {filterOptions.pipeline_runs.map((run) => (
                  <option key={run.run_id} value={run.run_id}>
                    {run.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range: Start Date */}
            <div>
              <label className="block text-[10px] uppercase font-semibold text-[#A1A1B5] mb-1">
                Rejection Start Date (UTC)
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-[#A1A1B5] absolute left-3 top-2 pointer-events-none" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => handleFilterChange(setStartDate, e.target.value)}
                  className="w-full bg-[#10101F] border border-[rgba(168,85,247,0.25)] rounded-lg pl-8 pr-3 py-1 text-xs text-[#F8F7FF] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
            </div>

            {/* Date Range: End Date */}
            <div>
              <label className="block text-[10px] uppercase font-semibold text-[#A1A1B5] mb-1">
                Rejection End Date (UTC)
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-[#A1A1B5] absolute left-3 top-2 pointer-events-none" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => handleFilterChange(setEndDate, e.target.value)}
                  className="w-full bg-[#10101F] border border-[rgba(168,85,247,0.25)] rounded-lg pl-8 pr-3 py-1 text-xs text-[#F8F7FF] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
            </div>

            {/* Sort Order & Reset Button */}
            <div>
              <label className="block text-[10px] uppercase font-semibold text-[#A1A1B5] mb-1">
                Sort & Reset
              </label>
              <div className="flex items-center space-x-2">
                <select
                  value={sortOrder}
                  onChange={(e) => handleFilterChange(setSortOrder, e.target.value)}
                  className="w-full bg-[#10101F] border border-[rgba(168,85,247,0.25)] rounded-lg px-2.5 py-1 text-xs text-[#F8F7FF] focus:outline-none focus:border-[#8B5CF6] cursor-pointer"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>

                <button
                  onClick={handleResetFilters}
                  disabled={totalActiveFilters === 0}
                  className={`px-3 py-1 rounded-lg border text-xs font-medium flex items-center space-x-1 shrink-0 transition-colors ${
                    totalActiveFilters > 0
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                      : 'bg-[#10101F] border-[rgba(168,85,247,0.15)] text-[#A1A1B5]/50 cursor-not-allowed'
                  }`}
                  title="Clear all active filters"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter Feedback and Pagination Info Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs px-1">
        <div className="flex items-center space-x-2 text-[#A1A1B5]">
          <span>
            Showing <strong className="text-[#D8B4FE] font-bold">{records.length}</strong> of{' '}
            <strong className="text-rose-400 font-bold">{totalMatching}</strong> matching quarantined records
          </span>
          {totalActiveFilters > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-[#211936] text-[#D8B4FE] border border-[rgba(168,85,247,0.25)]">
              {totalActiveFilters} filter{totalActiveFilters > 1 ? 's' : ''} applied
            </span>
          )}
        </div>

        {/* Pagination Navigation & Page Size Selector */}
        <div className="flex items-center space-x-3 self-end sm:self-auto">
          <div className="flex items-center space-x-1.5 text-xs text-[#A1A1B5]">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-[#10101F] border border-[rgba(168,85,247,0.25)] rounded px-2 py-0.5 text-xs text-[#F8F7FF] focus:outline-none cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className={`p-1 rounded border transition-colors ${
                page <= 1 || isLoading
                  ? 'border-transparent text-[#A1A1B5]/40 cursor-not-allowed'
                  : 'bg-[#211936] border-[rgba(168,85,247,0.25)] text-[#F8F7FF] hover:bg-[#2c2247]'
              }`}
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs text-[#A1A1B5] font-mono px-1">
              Page <strong className="text-[#F8F7FF]">{page}</strong> of{' '}
              <strong className="text-[#F8F7FF]">{totalPages}</strong>
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className={`p-1 rounded border transition-colors ${
                page >= totalPages || isLoading
                  ? 'border-transparent text-[#A1A1B5]/40 cursor-not-allowed'
                  : 'bg-[#211936] border-[rgba(168,85,247,0.25)] text-[#F8F7FF] hover:bg-[#2c2247]'
              }`}
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Quarantined Records Table Container with Subtle Purple Scrollbar */}
      <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-xl overflow-hidden shadow-sm flex flex-col">
        <div className="overflow-x-auto max-h-[56vh] overflow-y-auto scrollbar-thin scrollbar-thumb-[#8B5CF6]/30 scrollbar-track-[#10101F]">
          <table className="w-full text-left border-collapse text-xs min-w-[1050px]">
            <thead className="sticky top-0 bg-[#10101F] z-10 border-b border-[rgba(168,85,247,0.18)] text-[#A1A1B5] font-medium shadow-sm">
              <tr>
                <th className="py-3 px-4">Reject ID</th>
                <th className="py-3 px-4">Source File</th>
                <th className="py-3 px-4 text-right">Row #</th>
                <th className="py-3 px-4">Entity / Record ID</th>
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
                  <td colSpan="9" className="py-12 text-center text-[#A1A1B5] font-sans">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <RefreshCw className="w-5 h-5 text-[#8B5CF6] animate-spin" />
                      <span>Loading quarantined records...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-[#A1A1B5] font-sans">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <ShieldAlert className="w-7 h-7 text-emerald-400/60" />
                      <p className="text-sm font-semibold text-[#F8F7FF]">No quarantined records match your filter criteria.</p>
                      <p className="text-xs text-[#A1A1B5]">
                        All records either satisfied causal integrity rules or were cleared by active filters.
                      </p>
                      {totalActiveFilters > 0 && (
                        <button
                          onClick={handleResetFilters}
                          className="mt-2 text-xs text-[#8B5CF6] hover:underline flex items-center space-x-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Clear filters</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                records.map((item) => {
                  const isUnresolved = !item.resolution_status || item.resolution_status === 'unresolved';
                  const isReprocessed = item.resolution_status === 'reprocessed';
                  const isCorrected = item.resolution_status === 'corrected';

                  return (
                    <tr key={item.reject_id} className="hover:bg-[#211936]/40 transition-colors">
                      {/* Reject ID */}
                      <td className="py-2.5 px-4 font-semibold text-rose-400">
                        <button
                          onClick={() => {
                            setSelectedDetailId(item.reject_id);
                            setIsDetailOpen(true);
                          }}
                          className="hover:underline text-left"
                          title="Click to view lifecycle audit"
                        >
                          {item.reject_id}
                        </button>
                      </td>

                      {/* Source File (Clearly Visible) */}
                      <td className="py-2.5 px-4 font-sans text-[#F8F7FF] font-medium">
                        <span className="flex items-center space-x-1">
                          <FileText className="w-3 h-3 text-[#A1A1B5] shrink-0" />
                          <span className="truncate max-w-[160px]" title={item.source_file}>
                            {item.source_file}
                          </span>
                        </span>
                      </td>

                      {/* Source Row # */}
                      <td className="py-2.5 px-4 text-right text-[#A1A1B5] font-semibold">
                        #{item.source_row_number}
                      </td>

                      {/* Entity / Record ID */}
                      <td className="py-2.5 px-4">
                        <div className="flex flex-col text-[11px] leading-tight">
                          <span className="text-[#D8B4FE] font-semibold">{item.entity_id || '—'}</span>
                          <span className="text-[#A1A1B5] text-[10px]">{item.record_id || ''}</span>
                        </div>
                      </td>

                      {/* Rejection Reason */}
                      <td className="py-2.5 px-4 font-sans max-w-[240px]">
                        <div className="flex flex-col">
                          <span className="px-2 py-0.5 rounded text-[11px] bg-rose-500/10 border border-rose-500/20 text-rose-400 font-medium truncate" title={item.rejection_reason}>
                            {item.error_title || item.rejection_reason}
                          </span>
                          {item.error_category && (
                            <span className="text-[10px] text-[#A1A1B5] mt-0.5 truncate">
                              {item.error_category}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Run ID */}
                      <td className="py-2.5 px-4 text-[#A1A1B5] text-[11px] truncate max-w-[120px]" title={item.run_id}>
                        {item.run_id}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-4 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                            isReprocessed
                              ? 'bg-[#8B5CF6]/15 text-[#D8B4FE] border-[#8B5CF6]/30'
                              : isCorrected
                              ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                              : isUnresolved
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {item.resolution_status || 'unresolved'}
                        </span>
                      </td>

                      {/* Rejected At (UTC) */}
                      <td className="py-2.5 px-4 text-[#A1A1B5] text-[11px]">
                        {item.rejected_at?.replace('T', ' ').substring(0, 19)}
                      </td>

                      {/* Actions: View Raw, Lifecycle Audit, Fix/Reprocess */}
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5 font-sans">
                          {/* Inspect Raw Record */}
                          <button
                            onClick={() => setExpandedRecord(expandedRecord === item.reject_id ? null : item.reject_id)}
                            className={`p-1 rounded transition-colors ${
                              expandedRecord === item.reject_id
                                ? 'bg-[#8B5CF6]/20 text-[#D8B4FE]'
                                : 'hover:bg-[#211936] text-[#A1A1B5] hover:text-[#F8F7FF]'
                            }`}
                            title="Inspect raw payload JSON"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Lifecycle History */}
                          <button
                            onClick={() => {
                              setSelectedDetailId(item.reject_id);
                              setIsDetailOpen(true);
                            }}
                            className="p-1 hover:bg-[#211936] rounded text-[#A1A1B5] hover:text-[#D8B4FE] transition-colors"
                            title="View complete audit lifecycle"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {/* Fix & Reprocess */}
                          <button
                            onClick={() => {
                              setSelectedCorrectionReject(item);
                              setIsCorrectionOpen(true);
                            }}
                            className="px-2 py-0.5 rounded bg-[#8B5CF6]/20 hover:bg-[#8B5CF6]/30 text-[#D8B4FE] border border-[#8B5CF6]/30 text-[11px] font-medium transition-colors flex items-center space-x-1"
                            title="Review and safely correct record"
                          >
                            <Wrench className="w-3 h-3" />
                            <span>Fix</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inline Raw Record Inspector Box */}
      {expandedRecord && (
        <div className="bg-[#16112B] border border-[#8B5CF6]/40 rounded-xl p-4 shadow-xl space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-[rgba(168,85,247,0.18)] pb-2">
            <div className="flex items-center space-x-2">
              <Eye className="w-4 h-4 text-[#8B5CF6]" />
              <h4 className="text-xs font-semibold text-[#F8F7FF]">
                Raw Quarantined Record Payload ({expandedRecord})
              </h4>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  const r = records.find((x) => x.reject_id === expandedRecord);
                  if (r) handleCopyPayload(r.raw_record);
                }}
                className="flex items-center space-x-1 px-2 py-0.5 rounded bg-[#211936] hover:bg-[#2c2247] text-[#D8B4FE] text-[11px] transition-colors"
                title="Copy raw JSON"
              >
                {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{isCopied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                onClick={() => setExpandedRecord(null)}
                className="text-xs text-[#A1A1B5] hover:text-[#F8F7FF] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
          <pre className="p-3 bg-[#10101F] rounded-lg text-xs font-mono text-emerald-400 overflow-x-auto border border-[rgba(168,85,247,0.15)] max-h-48 overflow-y-auto">
            {JSON.stringify(
              (() => {
                const r = records.find((x) => x.reject_id === expandedRecord);
                if (!r) return {};
                try {
                  return typeof r.raw_record === 'string' ? JSON.parse(r.raw_record) : r.raw_record;
                } catch {
                  return { raw: r.raw_record };
                }
              })(),
              null,
              2
            )}
          </pre>
        </div>
      )}

      {/* Review & Fix Modal (CorrectionModal) */}
      {selectedCorrectionReject && (
        <CorrectionModal
          isOpen={isCorrectionOpen}
          onClose={() => {
            setIsCorrectionOpen(false);
            setSelectedCorrectionReject(null);
          }}
          rejectRecord={selectedCorrectionReject}
          onReprocessSuccess={() => {
            // Re-fetch data and options without losing current page or active filters
            loadRejects();
            loadFilterOptions();
          }}
        />
      )}

      {/* Lifecycle Audit Modal (RecordDetailModal) */}
      {selectedDetailId && (
        <RecordDetailModal
          isOpen={isDetailOpen}
          onClose={() => {
            setIsDetailOpen(false);
            setSelectedDetailId(null);
          }}
          historyId={selectedDetailId}
          onOpenCorrection={(rej) => {
            setSelectedCorrectionReject(rej);
            setIsCorrectionOpen(true);
          }}
        />
      )}
    </div>
  );
}
