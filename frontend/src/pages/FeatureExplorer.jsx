import React, { useState, useEffect } from 'react';
import { Cpu, Search, Sparkles, AlertCircle, CheckCircle2, Clock, Info } from 'lucide-react';
import FeatureTable from '../components/FeatureTable';
import apiClient from '../services/api';

export default function FeatureExplorer() {
  const [features, setFeatures] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Real-time Preview Form State
  const [previewCustId, setPreviewCustId] = useState('CUST_0001');
  const [previewAsOf, setPreviewAsOf] = useState('2026-05-31T00:00:00Z');
  const [previewVersion, setPreviewVersion] = useState('v1');
  const [previewResult, setPreviewResult] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  const loadFeatures = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.getFeatures({ limit: 500 });
      setFeatures(data);
    } catch (err) {
      console.error('Failed to load features:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFeatures();
  }, []);

  const handlePreview = async (e) => {
    e.preventDefault();
    setIsPreviewLoading(true);
    setPreviewError(null);
    setPreviewResult(null);

    try {
      const res = await apiClient.previewFeatures({
        customer_id: previewCustId,
        as_of_time: previewAsOf,
        feature_version: previewVersion,
      });
      setPreviewResult(res);
    } catch (err) {
      setPreviewError(err.response?.data?.detail || err.message);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-100 tracking-tight">Feature Explorer & Inference Preview</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Inspect published point-in-time snapshots or test on-demand inference features with zero leakage
          </p>
        </div>
      </div>

      {/* Point-in-Time Rule Box */}
      <div className="bg-blue-950/20 border border-blue-500/30 rounded-xl p-4 text-xs text-blue-200">
        <div className="flex items-start space-x-2.5">
          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-blue-300">Point-in-Time Anti-Leakage Invariant</span>
            <p className="text-blue-200/80 leading-relaxed">
              At prediction cutoff <code className="text-blue-300 font-mono">T</code>, transactions are eligible if and only if:{' '}
              <code className="text-emerald-300 font-mono">event_time &lt; T</code> and{' '}
              <code className="text-emerald-300 font-mono">available_at &le; T</code>. Transactions occurring exactly at <code className="text-blue-300 font-mono">T</code> or late-arriving events are strictly excluded.
            </p>
          </div>
        </div>
      </div>

      {/* On-Demand Preview Sandbox */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Live Inference Feature Preview (Zero DB Mutation)</h3>
            <p className="text-xs text-slate-400">Calculate point-in-time features on-the-fly using the shared feature engine</p>
          </div>
        </div>

        <form onSubmit={handlePreview} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Customer ID</label>
            <input
              type="text"
              value={previewCustId}
              onChange={(e) => setPreviewCustId(e.target.value)}
              placeholder="e.g. CUST_0001"
              required
              className="w-full bg-[#0a0f1d] border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">As-Of Timestamp (UTC)</label>
            <input
              type="text"
              value={previewAsOf}
              onChange={(e) => setPreviewAsOf(e.target.value)}
              placeholder="YYYY-MM-DDTHH:MM:SSZ"
              required
              className="w-full bg-[#0a0f1d] border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Feature Version</label>
            <input
              type="text"
              value={previewVersion}
              onChange={(e) => setPreviewVersion(e.target.value)}
              className="w-full bg-[#0a0f1d] border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isPreviewLoading}
              className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg text-xs transition-colors disabled:opacity-50"
            >
              {isPreviewLoading ? (
                <>
                  <Clock className="w-3.5 h-3.5 animate-spin" />
                  <span>Calculating...</span>
                </>
              ) : (
                <span>Preview Features</span>
              )}
            </button>
          </div>
        </form>

        {previewError && (
          <div className="mt-4 p-3 rounded-lg text-xs flex items-center space-x-2 bg-rose-500/10 border border-rose-500/30 text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{previewError}</span>
          </div>
        )}

        {previewResult && (
          <div className="mt-4 p-4 rounded-lg bg-[#0a0f1d] border border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-semibold text-emerald-400 flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Feature Snapshot Preview for {previewResult.customer_id}</span>
              </span>
              <span className="text-[11px] font-mono text-slate-400">{previewResult.as_of_time}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
              <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Txn 7d</span>
                <p className="text-base font-bold text-slate-100 mt-0.5">{previewResult.txn_count_7d}</p>
              </div>
              <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Txn 30d</span>
                <p className="text-base font-bold text-slate-100 mt-0.5">{previewResult.txn_count_30d}</p>
              </div>
              <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Purchase Total 30d</span>
                <p className="text-base font-bold text-emerald-400 mt-0.5">
                  ${Number(previewResult.total_purchase_amount_30d).toFixed(2)}
                </p>
              </div>
              <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Avg Purchase 30d</span>
                <p className="text-base font-bold text-slate-100 mt-0.5">
                  ${Number(previewResult.avg_purchase_amount_30d).toFixed(2)}
                </p>
              </div>
              <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Days Since Txn</span>
                <p className="text-base font-bold text-slate-200 mt-0.5">
                  {previewResult.days_since_last_txn !== null
                    ? `${Number(previewResult.days_since_last_txn).toFixed(1)}d`
                    : '—'}
                </p>
              </div>
              <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Refunds 30d</span>
                <p className="text-base font-bold text-rose-400 mt-0.5">{previewResult.refund_count_30d}</p>
              </div>
              <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Refund Amt 30d</span>
                <p className="text-base font-bold text-rose-400 mt-0.5">
                  ${Number(previewResult.refund_amount_30d).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Published Feature Snapshots Table */}
      <FeatureTable features={features} isLoading={isLoading} onRefresh={loadFeatures} />
    </div>
  );
}
