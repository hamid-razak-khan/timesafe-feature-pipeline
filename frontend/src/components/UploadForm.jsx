import React, { useState } from 'react';
import { UploadCloud, Sparkles, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import apiClient from '../services/api';

export default function UploadForm({ onActionComplete }) {
  // Synthetic Data Form State
  const [customersCount, setCustomersCount] = useState(20);
  const [transactionsCount, setTransactionsCount] = useState(100);
  const [predictionsCount, setPredictionsCount] = useState(15);
  const [seed, setSeed] = useState(42);
  const [includeInvalid, setIncludeInvalid] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState(null);

  // File Upload State
  const [selectedFileType, setSelectedFileType] = useState('transactions');
  const [fileToUpload, setFileToUpload] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setIsGenerating(true);
    setGenerateMsg(null);
    try {
      const res = await apiClient.generateData({
        customers: parseInt(customersCount, 10),
        transactions: parseInt(transactionsCount, 10),
        predictions: parseInt(predictionsCount, 10),
        seed: parseInt(seed, 10),
        include_invalid: includeInvalid,
      });
      setGenerateMsg({ type: 'success', text: `Generated ${res.transactions_count} transactions across ${res.customers_count} customers (Seed: ${seed}).` });
      if (onActionComplete) onActionComplete();
    } catch (err) {
      setGenerateMsg({ type: 'error', text: err.response?.data?.detail || err.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setIsUploading(true);
    setUploadMsg(null);
    try {
      const res = await apiClient.ingestFile(selectedFileType, fileToUpload);
      setUploadMsg({
        type: 'success',
        text: `Ingested ${res.input_rows} rows: ${res.inserted_rows} inserted, ${res.noop_rows} no-ops, ${res.rejected_rows} quarantined.`,
      });
      setFileToUpload(null);
      if (onActionComplete) onActionComplete();
    } catch (err) {
      setUploadMsg({ type: 'error', text: err.response?.data?.detail || err.message });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 1. Deterministic Synthetic Generator */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">Deterministic Data Generator</h3>
            <p className="text-xs text-slate-400">Generate reproducible e-commerce datasets with seed 42</p>
          </div>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Customers Count</label>
              <input
                type="number"
                min="1"
                max="5000"
                value={customersCount}
                onChange={(e) => setCustomersCount(e.target.value)}
                className="w-full bg-[#0a0f1d] border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Transactions Count</label>
              <input
                type="number"
                min="1"
                max="500000"
                value={transactionsCount}
                onChange={(e) => setTransactionsCount(e.target.value)}
                className="w-full bg-[#0a0f1d] border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Prediction Cutoffs</label>
              <input
                type="number"
                min="1"
                max="1000"
                value={predictionsCount}
                onChange={(e) => setPredictionsCount(e.target.value)}
                className="w-full bg-[#0a0f1d] border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Random Seed</label>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className="w-full bg-[#0a0f1d] border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="include_invalid"
              checked={includeInvalid}
              onChange={(e) => setIncludeInvalid(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0"
            />
            <label htmlFor="include_invalid" className="text-xs text-slate-300">
              Include intentional invalid test rows (foreign key, negative amount, corrupt timestamp)
            </label>
          </div>

          {generateMsg && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center space-x-2 border ${
                generateMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              {generateMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{generateMsg.text}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isGenerating}
            className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Generating Deterministic Dataset...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Generate Synthetic Dataset</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* 2. Direct Ingest / Custom CSV Upload */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">CSV Data Ingestion</h3>
            <p className="text-xs text-slate-400">Ingest existing data/raw files or upload new CSV manifests</p>
          </div>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Target Entity Type</label>
            <select
              value={selectedFileType}
              onChange={(e) => setSelectedFileType(e.target.value)}
              className="w-full bg-[#0a0f1d] border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="customers">Customers (customers.csv)</option>
              <option value="transactions">Transactions (transactions.csv)</option>
              <option value="predictions">Prediction Requests (prediction_requests.csv)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Optional Custom CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFileToUpload(e.target.files[0] || null)}
              className="w-full bg-[#0a0f1d] border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-400 file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Leave empty to ingest directly from the default <code className="text-slate-400">data/raw/</code> folder.
            </p>
          </div>

          {uploadMsg && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center space-x-2 border ${
                uploadMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              {uploadMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{uploadMsg.text}</span>
            </div>
          )}

          <div className="pt-7">
            <button
              type="submit"
              disabled={isUploading}
              className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium py-2.5 px-4 rounded-lg text-sm border border-slate-700 transition-colors disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Validating & Ingesting Stream...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4 text-emerald-400" />
                  <span>Execute Ingestion & Validation</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

