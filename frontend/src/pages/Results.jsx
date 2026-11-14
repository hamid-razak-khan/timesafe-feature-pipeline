import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  Search, 
  RefreshCw, 
  ShieldCheck, 
  Layers, 
  ArrowRight,
  Filter,
  CheckCircle2,
  Calendar,
  Sparkles
} from 'lucide-react';
import apiClient from '../services/api';

export default function Results({ initialFeatures = null, initialSummary = null, onNavigateToWizard }) {
  const [features, setFeatures] = useState(initialFeatures || []);
  const [summary, setSummary] = useState(initialSummary || null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [featureVersion, setFeatureVersion] = useState('v1');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  // If initialFeatures was passed from wizard generation, keep it; otherwise try loading stored features from backend
  useEffect(() => {
    if (initialFeatures && initialFeatures.length > 0) {
      setFeatures(initialFeatures);
      if (initialSummary) setSummary(initialSummary);
    } else {
      loadStoredFeatures();
    }
  }, [initialFeatures, initialSummary]);

  const loadStoredFeatures = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.getFeatures({ feature_version: featureVersion, limit: 200 });
      setFeatures(data || []);
    } catch (err) {
      console.error('Failed to load stored features:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredFeatures = features.filter((row) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const entityKey = Object.keys(row).find((k) => k.includes('id') || k.includes('customer') || k.includes('entity'));
    const entityVal = entityKey ? String(row[entityKey]).toLowerCase() : '';
    return entityVal.includes(term) || JSON.stringify(row).toLowerCase().includes(term);
  });

  const totalPages = Math.ceil(filteredFeatures.length / rowsPerPage) || 1;
  const paginatedFeatures = filteredFeatures.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const handleDownloadCsv = () => {
    if (!features || features.length === 0) return;
    const headers = Object.keys(features[0]);
    const csvRows = [headers.join(',')];
    features.forEach((row) => {
      const vals = headers.map((h) => {
        const val = row[h] === null || row[h] === undefined ? '' : row[h];
        return `"${val}"`;
      });
      csvRows.push(vals.join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timesafe_features_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const columns = features.length > 0 ? Object.keys(features[0]) : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[rgba(168,85,247,0.18)]">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-2xl font-bold text-[#F8F7FF] tracking-tight">Feature Results</h2>
            <span className="text-[11px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] text-[#D8B4FE]">
              Point-in-Time Features
            </span>
          </div>
          <p className="text-xs text-[#A1A1B5] mt-1">
            Point-in-time consistent feature representations ready for training or real-time ML inference
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadStoredFeatures}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-[#16112B] hover:bg-[#211936] text-[#A1A1B5] hover:text-[#F8F7FF] border border-[rgba(168,85,247,0.25)] text-xs font-semibold transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#A855F7]' : ''}`} />
            <span>Refresh</span>
          </button>

          {features.length > 0 && (
            <button
              onClick={handleDownloadCsv}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] hover:opacity-95 text-white text-xs font-semibold shadow-[0_0_15px_-3px_rgba(168,85,247,0.4)] transition-all hover:scale-[1.02]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV ({features.length} rows)</span>
            </button>
          )}

          <button
            onClick={onNavigateToWizard}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#211936] hover:bg-[#16112B] text-[#F8F7FF] border border-[rgba(168,85,247,0.3)] hover:border-[#A855F7]/50 text-xs font-semibold transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#D8B4FE]" />
            <span>Generate More Features</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Badges */}
      {features.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-2xl p-4 flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] flex items-center justify-center text-[#D8B4FE]">
              <Layers className="w-5 h-5 text-[#A855F7]" />
            </div>
            <div>
              <div className="text-xl font-bold text-[#F8F7FF]">{features.length.toLocaleString()}</div>
              <div className="text-[11px] text-[#A1A1B5]">Total Entities Computed</div>
            </div>
          </div>

          <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-2xl p-4 flex items-center space-x-3.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              summary?.has_availability_warning 
                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400' 
                : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            }`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className={`text-sm font-bold ${
                summary?.has_availability_warning ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {summary?.has_availability_warning ? 'Event-Time Mode' : 'Dual-Timestamp Gate'}
              </div>
              <div className="text-[11px] text-[#A1A1B5]">
                {summary?.has_availability_warning ? 'Availability Not Enforced' : 'event_time < T & avail <= T'}
              </div>
            </div>
          </div>

          <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-2xl p-4 flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] flex items-center justify-center text-[#D8B4FE]">
              <Calendar className="w-5 h-5 text-[#A855F7]" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#F8F7FF] font-mono truncate max-w-[170px]" title={summary?.cutoff_time || 'Defined at cut-off'}>
                {summary?.cutoff_time ? new Date(summary.cutoff_time).toLocaleDateString() : 'Active Version'}
              </div>
              <div className="text-[11px] text-[#A1A1B5]">Prediction Cut-off (T)</div>
            </div>
          </div>

          <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-2xl p-4 flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] flex items-center justify-center text-[#D8B4FE]">
              <FileSpreadsheet className="w-5 h-5 text-[#D8B4FE]" />
            </div>
            <div>
              <div className="text-xl font-bold text-[#F8F7FF]">{columns.length}</div>
              <div className="text-[11px] text-[#A1A1B5]">Engineered Feature Dimensions</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {features.length === 0 && !isLoading ? (
        <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-2xl p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#8B5CF6]/15 border border-[rgba(168,85,247,0.3)] text-[#D8B4FE] mx-auto flex items-center justify-center shadow-[0_0_15px_-3px_rgba(168,85,247,0.3)]">
            <FileSpreadsheet className="w-7 h-7 text-[#A855F7]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-[#F8F7FF]">No Features Generated Yet</h3>
            <p className="text-xs text-[#A1A1B5] max-w-md mx-auto">
              Upload a transactional dataset or try our neutral sample data to compute point-in-time ML feature snapshots.
            </p>
          </div>
          <button
            onClick={onNavigateToWizard}
            className="inline-flex items-center space-x-2 bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] hover:opacity-95 text-white font-semibold py-2.5 px-5 rounded-xl text-xs transition-all shadow-[0_0_15px_-3px_rgba(168,85,247,0.4)] hover:scale-[1.02]"
          >
            <span>Open Feature Generator</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-2xl overflow-hidden shadow-sm">
          {/* Table Header Filter & Search */}
          <div className="p-4 border-b border-[rgba(168,85,247,0.15)] flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#10101F]/60">
            <div className="relative w-full sm:w-80">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1B5]" />
              <input
                type="text"
                placeholder="Search by entity ID or values..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-[#211936] border border-[rgba(168,85,247,0.25)] rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#F8F7FF] placeholder-[#A1A1B5] focus:outline-none focus:border-[#A855F7]"
              />
            </div>

            <div className="text-xs text-[#A1A1B5] font-mono">
              Showing {paginatedFeatures.length} of {filteredFeatures.length} matching rows
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[rgba(168,85,247,0.15)] bg-[#10101F]/80 text-[#A1A1B5] font-medium">
                  {columns.map((col) => (
                    <th key={col} className="py-3 px-4 uppercase tracking-wider text-[11px]">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(168,85,247,0.1)] font-mono text-[#F8F7FF]">
                {paginatedFeatures.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[#211936]/40 transition-colors">
                    {columns.map((col) => {
                      const val = row[col];
                      const isEntity = col.includes('id') || col.includes('customer') || col.includes('entity');
                      return (
                        <td key={col} className="py-2.5 px-4 whitespace-nowrap">
                          {isEntity ? (
                            <span className="font-semibold text-[#D8B4FE]">{val}</span>
                          ) : typeof val === 'number' ? (
                            <span>{Number.isInteger(val) ? val : val.toFixed(2)}</span>
                          ) : val === null || val === undefined ? (
                            <span className="text-[#A1A1B5]/50">—</span>
                          ) : (
                            <span>{String(val)}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-[rgba(168,85,247,0.15)] flex items-center justify-between text-xs text-[#A1A1B5] bg-[#10101F]/70">
              <div>
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 rounded-lg bg-[#211936] hover:bg-[#16112B] disabled:opacity-40 text-[#F8F7FF] border border-[rgba(168,85,247,0.2)] transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 rounded-lg bg-[#211936] hover:bg-[#16112B] disabled:opacity-40 text-[#F8F7FF] border border-[rgba(168,85,247,0.2)] transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

