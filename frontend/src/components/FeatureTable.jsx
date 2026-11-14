import React, { useState } from 'react';
import { Search, Filter, Download, ArrowUpDown } from 'lucide-react';
import apiClient from '../services/api';

export default function FeatureTable({ features = [], isLoading = false, onRefresh }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVersion, setSelectedVersion] = useState('all');

  const filtered = features.filter((item) => {
    const matchesCust = item.customer_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesVer = selectedVersion === 'all' || item.feature_version === selectedVersion;
    return matchesCust && matchesVer;
  });

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      {/* Table Header & Controls */}
      <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search Customer ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#0a0f1d] border border-slate-700/80 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-56"
            />
          </div>
          <select
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
            className="bg-[#0a0f1d] border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Versions</option>
            <option value="v1">v1</option>
            <option value="v2">v2</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <a
            href={apiClient.getExportFeaturesUrl(selectedVersion === 'all' ? 'v1' : selectedVersion)}
            download="feature_snapshots.csv"
            className="flex items-center space-x-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-[#0a0f1d]/50 text-slate-400 font-medium">
              <th className="py-3 px-4">Customer ID</th>
              <th className="py-3 px-4">As-of Cutoff (T)</th>
              <th className="py-3 px-4">Version</th>
              <th className="py-3 px-4 text-right">Txn 7d</th>
              <th className="py-3 px-4 text-right">Txn 30d</th>
              <th className="py-3 px-4 text-right">Total Purchase 30d</th>
              <th className="py-3 px-4 text-right">Avg Purchase 30d</th>
              <th className="py-3 px-4 text-right">Days Since Last Txn</th>
              <th className="py-3 px-4 text-right">Refunds 30d</th>
              <th className="py-3 px-4 text-right">Refund Amt 30d</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
            {isLoading ? (
              <tr>
                <td colSpan="10" className="py-8 text-center text-slate-500 font-sans">
                  Loading feature snapshots...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="10" className="py-8 text-center text-slate-500 font-sans">
                  No feature snapshots found matching criteria.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.snapshot_id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-4 font-semibold text-blue-400 font-sans">{item.customer_id}</td>
                  <td className="py-2.5 px-4 text-slate-400">{item.as_of_time?.replace('T', ' ').substring(0, 19)}</td>
                  <td className="py-2.5 px-4">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 text-slate-300">
                      {item.feature_version}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right">{item.txn_count_7d}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-200">{item.txn_count_30d}</td>
                  <td className="py-2.5 px-4 text-right text-emerald-400">
                    ${Number(item.total_purchase_amount_30d).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-right">${Number(item.avg_purchase_amount_30d).toFixed(2)}</td>
                  <td className="py-2.5 px-4 text-right text-slate-400">
                    {item.days_since_last_txn !== null ? `${Number(item.days_since_last_txn).toFixed(1)}d` : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right text-rose-400">{item.refund_count_30d}</td>
                  <td className="py-2.5 px-4 text-right text-rose-400">
                    ${Number(item.refund_amount_30d).toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="p-3 border-t border-slate-800 bg-[#0a0f1d]/30 text-slate-500 text-[11px] flex items-center justify-between">
        <span>Showing {filtered.length} of {features.length} feature records</span>
        <span>Point-in-Time Rule: event_time &lt; T AND available_at &le; T</span>
      </div>
    </div>
  );
}
