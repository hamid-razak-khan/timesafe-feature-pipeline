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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Feature Results</h2>
            <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
              Point-in-Time Features
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Point-in-time consistent feature representations ready for training or real-time ML inference
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadStoredFeatures}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
            <span>Refresh</span>
          </button>

          {features.length > 0 && (
            <button
              onClick={handleDownloadCsv}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition-all hover:scale-[1.02]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV ({features.length} rows)</span>
            </button>
          )}

          <button
            onClick={onNavigateToWizard}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Generate More Features</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Badges */}
      {features.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4 flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-100">{features.length.toLocaleString()}</div>
              <div className="text-[11px] text-slate-400">Total Entities Computed</div>
            </div>
          </div>

          <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4 flex items-center space-x-3.5">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              summary?.has_availability_warning 
                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400' 
                : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            }`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className={`text-base font-bold ${
                summary?.has_availability_warning ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {summary?.has_availability_warning ? 'Event-Time Mode' : 'Dual-Timestamp Gate'}
              </div>
              <div className="text-[11px] text-slate-400">
                {summary?.has_availability_warning ? 'Availability Not Enforced' : 'event_time < T & avail <= T'}
              </div>
            </div>
          </div>

          <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4 flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-200 font-mono truncate max-w-[170px]" title={summary?.cutoff_time || 'Defined at cut-off'}>
                {summary?.cutoff_time ? new Date(summary.cutoff_time).toLocaleDateString() : 'Active Version'}
              </div>
              <div className="text-[11px] text-slate-400">Prediction Cut-off (T)</div>
            </div>
          </div>

          <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4 flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-100">{columns.length}</div>
              <div className="text-[11px] text-slate-400">Engineered Feature Dimensions</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {features.length === 0 && !isLoading ? (
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 mx-auto flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-200">No Features Generated Yet</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Upload a transactional dataset or try our neutral sample data to compute point-in-time ML feature snapshots.
            </p>
          </div>
          <button
            onClick={onNavigateToWizard}
            className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-5 rounded-xl text-xs transition-all shadow-md shadow-blue-600/20"
          >
            <span>Open Feature Generator</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {/* Table Header Filter & Search */}
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search by entity ID or values..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-[#0a0f1d] border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="text-xs text-slate-400 font-mono">
              Showing {paginatedFeatures.length} of {filteredFeatures.length} matching rows
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-medium">
                  {columns.map((col) => (
                    <th key={col} className="py-3 px-4 uppercase tracking-wider text-[11px]">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                {paginatedFeatures.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    {columns.map((col) => {
                      const val = row[col];
                      const isEntity = col.includes('id') || col.includes('customer') || col.includes('entity');
                      return (
                        <td key={col} className="py-2.5 px-4 whitespace-nowrap">
                          {isEntity ? (
                            <span className="font-semibold text-blue-400">{val}</span>
                          ) : typeof val === 'number' ? (
                            <span>{Number.isInteger(val) ? val : val.toFixed(2)}</span>
                          ) : val === null || val === undefined ? (
                            <span className="text-slate-600">—</span>
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
            <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 bg-slate-900/40">
              <div>
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300"
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

