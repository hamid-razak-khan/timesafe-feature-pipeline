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
    <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-xl overflow-hidden shadow-sm">
      {/* Table Header & Controls */}
      <div className="p-4 border-b border-[rgba(168,85,247,0.18)] bg-[#10101F] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#A1A1B5] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search Customer ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#10101F] border border-[rgba(168,85,247,0.25)] rounded-lg pl-9 pr-4 py-1.5 text-xs text-[#F8F7FF] placeholder-[#A1A1B5] focus:outline-none focus:border-[#8B5CF6] w-56"
            />
          </div>
          <select
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
            className="bg-[#10101F] border border-[rgba(168,85,247,0.25)] rounded-lg px-3 py-1.5 text-xs text-[#F8F7FF] focus:outline-none focus:border-[#8B5CF6]"
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
            className="flex items-center space-x-1.5 bg-[#8B5CF6]/15 hover:bg-[#8B5CF6]/25 text-[#D8B4FE] border border-[rgba(168,85,247,0.3)] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
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
            <tr className="border-b border-[rgba(168,85,247,0.18)] bg-[#10101F]/80 text-[#A1A1B5] font-medium">
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
          <tbody className="divide-y divide-[rgba(168,85,247,0.1)] font-mono text-[#F8F7FF]">
            {isLoading ? (
              <tr>
                <td colSpan="10" className="py-8 text-center text-[#A1A1B5] font-sans">
                  Loading feature snapshots...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="10" className="py-8 text-center text-[#A1A1B5] font-sans">
                  No feature snapshots found matching criteria.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.snapshot_id} className="hover:bg-[#211936]/40 transition-colors">
                  <td className="py-2.5 px-4 font-semibold text-[#D8B4FE] font-sans">{item.customer_id}</td>
                  <td className="py-2.5 px-4 text-[#A1A1B5]">{item.as_of_time?.replace('T', ' ').substring(0, 19)}</td>
                  <td className="py-2.5 px-4">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#211936] border border-[rgba(168,85,247,0.25)] text-[#D8B4FE]">
                      {item.feature_version}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right text-[#F8F7FF]">{item.txn_count_7d}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-[#F8F7FF]">{item.txn_count_30d}</td>
                  <td className="py-2.5 px-4 text-right text-emerald-400">
                    ${Number(item.total_purchase_amount_30d).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-[#F8F7FF]">${Number(item.avg_purchase_amount_30d).toFixed(2)}</td>
                  <td className="py-2.5 px-4 text-right text-[#A1A1B5]">
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

      <div className="p-3 border-t border-[rgba(168,85,247,0.18)] bg-[#10101F]/60 text-[#A1A1B5] text-[11px] flex items-center justify-between">
        <span>Showing {filtered.length} of {features.length} feature records</span>
        <span className="font-mono text-[#D8B4FE]">Point-in-Time Rule: event_time &lt; T AND available_at &le; T</span>
      </div>
    </div>
  );
}

