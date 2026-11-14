import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, CheckCircle2, Play, RefreshCw, Layers } from 'lucide-react';
import UploadForm from '../components/UploadForm';
import apiClient from '../services/api';

export default function DataIngestion() {
  const [metrics, setMetrics] = useState(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [pipelineResult, setPipelineResult] = useState(null);

  const loadData = async () => {
    try {
      const m = await apiClient.getMetrics();
      setMetrics(m);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTrigger = async () => {
    setIsTriggering(true);
    setPipelineResult(null);
    try {
      const res = await apiClient.triggerPipeline();
      setPipelineResult({
        type: 'success',
        runId: res.run_id,
        duration: res.duration_seconds,
        featuresCount: res.feature_snapshots_count,
        labelsCount: res.training_labels_count,
        overallStatus: res.overall_status,
      });
      loadData();
    } catch (err) {
      setPipelineResult({
        type: 'error',
        message: err.response?.data?.detail || 'Pipeline trigger failed.',
      });
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-100 tracking-tight">Data Ingestion & Synthesis</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Ingest raw transaction streams, generate deterministic benchmarks, and execute pipelines
          </p>
        </div>

        <button
          onClick={handleTrigger}
          disabled={isTriggering}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg text-xs transition-colors disabled:opacity-50 shadow-sm"
        >
          {isTriggering ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Executing Pipeline...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>Run Pipeline Now</span>
            </>
          )}
        </button>
      </div>

      {pipelineResult && (
        <div
          className={`p-4 rounded-xl border ${
            pipelineResult.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {pipelineResult.type === 'success' ? (
            <div className="space-y-1 text-xs">
              <div className="flex items-center space-x-2 font-semibold text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Pipeline Run Successful ({pipelineResult.runId})</span>
              </div>
              <p className="text-slate-300">
                Execution took <span className="font-mono">{pipelineResult.duration.toFixed(2)}s</span>. Published{' '}
                <span className="font-mono">{pipelineResult.featuresCount}</span> point-in-time feature snapshots and{' '}
                <span className="font-mono">{pipelineResult.labelsCount}</span> training labels.
              </p>
              <p className="text-[11px] text-emerald-400/80">
                Reconciliation Audit Status: <strong>{pipelineResult.overallStatus}</strong>
              </p>
            </div>
          ) : (
            <div className="text-xs text-rose-400">{pipelineResult.message}</div>
          )}
        </div>
      )}

      {/* Synthetic Generator and Ingest Forms */}
      <UploadForm onActionComplete={loadData} />

      {/* Source Manifest & Validation Rules Reference */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 shadow-sm lg:col-span-1">
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
            Source Data Manifest
          </h3>
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-[#0a0f1d] border border-slate-800/80">
              <div className="flex items-center justify-between text-slate-300 font-medium mb-1">
                <span className="flex items-center space-x-2">
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  <span>customers.csv</span>
                </span>
                <span className="font-mono text-slate-400">{metrics?.total_customers ?? 0} loaded</span>
              </div>
              <p className="text-[11px] text-slate-500">Key: customer_id, created_at, customer_segment</p>
            </div>

            <div className="p-3 rounded-lg bg-[#0a0f1d] border border-slate-800/80">
              <div className="flex items-center justify-between text-slate-300 font-medium mb-1">
                <span className="flex items-center space-x-2">
                  <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  <span>transactions.csv</span>
                </span>
                <span className="font-mono text-slate-400">{metrics?.total_transactions ?? 0} loaded</span>
              </div>
              <p className="text-[11px] text-slate-500">Dual Timestamps: event_time, available_at, amount, type</p>
            </div>

            <div className="p-3 rounded-lg bg-[#0a0f1d] border border-slate-800/80">
              <div className="flex items-center justify-between text-slate-300 font-medium mb-1">
                <span className="flex items-center space-x-2">
                  <FileText className="w-3.5 h-3.5 text-purple-400" />
                  <span>prediction_requests.csv</span>
                </span>
                <span className="font-mono text-slate-400">Cutoffs</span>
              </div>
              <p className="text-[11px] text-slate-500">Cutoff specification: customer_id, as_of_time (T)</p>
            </div>
          </div>
        </div>

        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 shadow-sm lg:col-span-2">
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
            Deterministic Validation Rules Engine
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
            <div className="p-3 rounded-lg bg-[#0a0f1d] border border-slate-800/80">
              <h4 className="font-medium text-slate-200 mb-1">1. Referential Integrity</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Transactions must reference an existing customer ID. Customer creation date must precede or equal transaction event time.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[#0a0f1d] border border-slate-800/80">
              <h4 className="font-medium text-slate-200 mb-1">2. Chronological Feasibility</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Availability timestamp (<code className="text-blue-400">available_at</code>) cannot predate the occurrence time (<code className="text-blue-400">event_time</code>).
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[#0a0f1d] border border-slate-800/80">
              <h4 className="font-medium text-slate-200 mb-1">3. Decimal & Type Checks</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Monetary amounts must be strictly non-negative decimal numbers. Transaction types are restricted to <code className="text-emerald-400">purchase</code> or <code className="text-rose-400">refund</code>.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[#0a0f1d] border border-slate-800/80">
              <h4 className="font-medium text-slate-200 mb-1">4. Idempotent Deduplication</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Repeated identical records result in safe NO-OPs. Conflicting records with identical IDs but differing payloads are routed to quarantine.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

