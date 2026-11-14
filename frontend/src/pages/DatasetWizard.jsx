import React, { useState, useEffect } from 'react';
import { 
  UploadCloud, 
  Sparkles, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Download, 
  RefreshCw, 
  Sliders, 
  ShieldCheck, 
  Info,
  Calendar,
  Layers
} from 'lucide-react';
import apiClient from '../services/api';

export default function DatasetWizard({ initialMode, onComplete }) {
  // Wizard active step: 1 = Upload, 2 = Configure, 3 = Results
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Upload state
  const [uploadedFile, setUploadedFile] = useState(null);
  const [fileStats, setFileStats] = useState(null);
  const [dataPreview, setDataPreview] = useState([]);
  const [columns, setColumns] = useState([]);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Step 2: Mapping & Features State
  const [columnMapping, setColumnMapping] = useState({
    event_id: '',
    entity_id: '',
    event_time: '',
    available_at: '',
    amount: '',
    event_type: '',
  });
  const [assumeAvailableAtEventTime, setAssumeAvailableAtEventTime] = useState(false);
  const [cutoffTime, setCutoffTime] = useState('2026-05-31T00:00:00Z');
  const [selectedFeatures, setSelectedFeatures] = useState([
    'count_7d',
    'count_30d',
    'total_amount_30d',
    'avg_amount_30d',
    'days_since_last',
  ]);

  // Step 3: Execution & Results State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationSummary, setGenerationSummary] = useState(null);
  const [generatedFeatures, setGeneratedFeatures] = useState([]);

  // Automatically trigger sample data load if initialMode is 'sample'
  useEffect(() => {
    if (initialMode === 'sample' && !fileStats) {
      handleLoadSample();
    }
  }, [initialMode]);

  // Load sample dataset
  const handleLoadSample = async () => {
    setIsLoadingFile(true);
    setUploadError(null);
    try {
      const res = await apiClient.uploadPreview(null, true);
      setFileStats({
        filename: res.filename,
        totalRows: res.total_rows,
        totalCols: res.columns.length,
      });
      setColumns(res.columns);
      setDataPreview(res.preview);
      setUploadedFile(null);

      // Pre-fill suggested mappings
      if (res.suggested_mapping) {
        setColumnMapping({
          event_id: res.suggested_mapping.event_id || '',
          entity_id: res.suggested_mapping.entity_id || '',
          event_time: res.suggested_mapping.event_time || '',
          available_at: res.suggested_mapping.available_at || '',
          amount: res.suggested_mapping.amount || '',
          event_type: res.suggested_mapping.event_type || '',
        });
      }
      if (res.suggested_cutoff) {
        setCutoffTime(res.suggested_cutoff);
      }
    } catch (err) {
      setUploadError(err.response?.data?.detail || err.message);
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Handle custom file upload
  const handleFileUpload = async (file) => {
    if (!file) return;
    setIsLoadingFile(true);
    setUploadError(null);
    try {
      const res = await apiClient.uploadPreview(file, false);
      setUploadedFile(file);
      setFileStats({
        filename: file.name,
        sizeKb: Math.round(file.size / 1024),
        totalRows: res.total_rows,
        totalCols: res.columns.length,
      });
      setColumns(res.columns);
      setDataPreview(res.preview);

      // Pre-fill suggested mappings
      if (res.suggested_mapping) {
        setColumnMapping({
          event_id: res.suggested_mapping.event_id || '',
          entity_id: res.suggested_mapping.entity_id || '',
          event_time: res.suggested_mapping.event_time || '',
          available_at: res.suggested_mapping.available_at || '',
          amount: res.suggested_mapping.amount || '',
          event_type: res.suggested_mapping.event_type || '',
        });
      }
      if (res.suggested_cutoff) {
        setCutoffTime(res.suggested_cutoff);
      }
    } catch (err) {
      setUploadError(err.response?.data?.detail || err.message);
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Toggle feature selection
  const toggleFeature = (featKey) => {
    setSelectedFeatures((prev) =>
      prev.includes(featKey) ? prev.filter((k) => k !== featKey) : [...prev, featKey]
    );
  };

  // Step 3 Execution: Generate Features
  const handleGenerateFeatures = async () => {
    setIsGenerating(true);
    try {
      const payload = {
        filename: fileStats?.filename,
        column_mapping: columnMapping,
        cutoff_time: cutoffTime,
        feature_options: selectedFeatures,
        assume_available_at_event_time: assumeAvailableAtEventTime,
        feature_version: 'v1',
      };
      const res = await apiClient.generateGenericFeatures(payload);
      setGenerationSummary(res);
      setGeneratedFeatures(res.all_features || []);
      setCurrentStep(3);
      if (onComplete) {
        onComplete(res.all_features || [], res);
      }
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Download client-side CSV of generated features
  const handleDownloadCsv = () => {
    if (!generatedFeatures || generatedFeatures.length === 0) return;
    const headers = Object.keys(generatedFeatures[0]);
    const csvRows = [headers.join(',')];
    generatedFeatures.forEach((row) => {
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
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4">
      {/* Wizard Progress Stepper */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div className="flex items-center space-x-3">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              currentStep === 1
                ? 'bg-blue-600 text-white'
                : currentStep > 1
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {currentStep > 1 ? '✓' : '1'}
          </div>
          <span className={`text-sm font-semibold ${currentStep === 1 ? 'text-slate-100' : 'text-slate-400'}`}>
            Upload Dataset
          </span>
        </div>

        <div className="w-12 h-0.5 bg-slate-800 hidden sm:block"></div>

        <div className="flex items-center space-x-3">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              currentStep === 2
                ? 'bg-blue-600 text-white'
                : currentStep > 2
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {currentStep > 2 ? '✓' : '2'}
          </div>
          <span className={`text-sm font-semibold ${currentStep === 2 ? 'text-slate-100' : 'text-slate-400'}`}>
            Configure Features
          </span>
        </div>

        <div className="w-12 h-0.5 bg-slate-800 hidden sm:block"></div>

        <div className="flex items-center space-x-3">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              currentStep === 3 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            3
          </div>
          <span className={`text-sm font-semibold ${currentStep === 3 ? 'text-slate-100' : 'text-slate-400'}`}>
            Results & Download
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: UPLOAD DATASET */}
      {/* ========================================================================= */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Step 1 — Upload Historical Data</h2>
            <p className="text-xs text-slate-400">
              Upload your timestamped transactional CSV (banking, e-commerce, retail, subscriptions, or logistics).
            </p>
          </div>

          {/* Drag & Drop Upload Zone */}
          <div className="bg-[#0f172a] border-2 border-dashed border-slate-700/80 hover:border-blue-500/80 rounded-2xl p-8 text-center space-y-4 transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
              <UploadCloud className="w-6 h-6" />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-200">Drag & drop your CSV file here</p>
              <p className="text-xs text-slate-400 mt-1">or browse from your local computer</p>
            </div>

            <div className="flex items-center justify-center gap-3">
              <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-xl text-xs transition-colors shadow-sm">
                Browse CSV File
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files[0])}
                />
              </label>

              <button
                type="button"
                onClick={handleLoadSample}
                disabled={isLoadingFile}
                className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 py-2 px-4 rounded-xl text-xs font-medium transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Try with Sample Data</span>
              </button>
            </div>

            {isLoadingFile && (
              <div className="flex items-center justify-center space-x-2 text-xs text-blue-400 pt-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Validating and inspecting CSV structure...</span>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Uploaded File Summary & Preview */}
          {fileStats && (
            <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2.5">
                  <FileText className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200">{fileStats.filename}</h4>
                    <p className="text-[11px] text-slate-500">
                      {fileStats.totalRows.toLocaleString()} rows detected • {fileStats.totalCols} columns
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                  Ready to Configure
                </span>
              </div>

              {/* Data Preview Grid */}
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Dataset Preview (First {dataPreview.length} Rows)
                </p>
                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0a0f1d]">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400 font-medium">
                        {columns.map((col) => (
                          <th key={col} className="py-2.5 px-3">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                      {dataPreview.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          {columns.map((col) => (
                            <td key={col} className="py-2 px-3 text-slate-300">
                              {String(row[col] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Next Step Action */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-6 rounded-xl text-xs transition-all shadow-md shadow-blue-600/20"
                >
                  <span>Next: Configure Features</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: CONFIGURE FEATURES & COLUMN MAPPING */}
      {/* ========================================================================= */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Step 2 — Configure Features & Cutoff</h2>
            <p className="text-xs text-slate-400">
              Map your columns and select feature options. Zero code or complex database queries required.
            </p>
          </div>

          {/* Point-in-Time Anti-Leakage Guarantee Banner */}
          <div className="bg-blue-950/20 border border-blue-500/30 rounded-xl p-4 text-xs text-blue-200 flex items-start space-x-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-blue-300">TimeSafe Anti-Leakage Guarantee</span>
              <p className="text-blue-200/80 leading-relaxed">
                Transactions with timestamps after your chosen cutoff time (<code className="text-blue-300 font-mono">T</code>)
                or transactions not yet available by <code className="text-blue-300 font-mono">T</code> are mathematically excluded.
              </p>
            </div>
          </div>

          {/* Section A: Column Mapping */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 space-y-5">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-blue-400" />
              <span>Column Mapping</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Which column identifies the individual event? <span className="text-slate-500">(Optional)</span>
                </label>
                <select
                  value={columnMapping.event_id}
                  onChange={(e) => setColumnMapping({ ...columnMapping, event_id: e.target.value })}
                  className="w-full bg-[#0a0f1d] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Select event identifier (optional) --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">E.g., event_id, transaction_id, order_id, shipment_id</p>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Which column identifies the entity? <span className="text-rose-400">*</span>
                </label>
                <select
                  value={columnMapping.entity_id}
                  onChange={(e) => setColumnMapping({ ...columnMapping, entity_id: e.target.value })}
                  className="w-full bg-[#0a0f1d] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Select entity column --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">E.g., customer_id, account_id, user_id, vehicle_id (groups multiple events)</p>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Which column contains the event timestamp? <span className="text-rose-400">*</span>
                </label>
                <select
                  value={columnMapping.event_time}
                  onChange={(e) => setColumnMapping({ ...columnMapping, event_time: e.target.value })}
                  className="w-full bg-[#0a0f1d] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Select timestamp column --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">E.g., event_time, timestamp, created_at (UTC)</p>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  When did this event become available?
                </label>
                <select
                  disabled={assumeAvailableAtEventTime}
                  value={columnMapping.available_at}
                  onChange={(e) => setColumnMapping({ ...columnMapping, available_at: e.target.value })}
                  className="w-full bg-[#0a0f1d] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                >
                  <option value="">-- Select availability timestamp (optional) --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <div className="flex items-center space-x-2 mt-2">
                  <input
                    type="checkbox"
                    id="assume_avail"
                    checked={assumeAvailableAtEventTime}
                    onChange={(e) => setAssumeAvailableAtEventTime(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <label htmlFor="assume_avail" className="text-[11px] text-slate-400">
                    Assume data was available at event time
                  </label>
                </div>

                {assumeAvailableAtEventTime && (
                  <p className="text-[11px] text-amber-400/90 mt-1 bg-amber-500/10 border border-amber-500/20 p-2 rounded">
                    Warning: Accurate historical leakage prevention cannot be fully guaranteed without true availability timestamps.
                  </p>
                )}
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Which column contains the numerical amount? (Optional)
                </label>
                <select
                  value={columnMapping.amount}
                  onChange={(e) => setColumnMapping({ ...columnMapping, amount: e.target.value })}
                  className="w-full bg-[#0a0f1d] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- None / Count Only --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">E.g., amount, balance, value, price</p>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Which column describes the event type? (Optional)
                </label>
                <select
                  value={columnMapping.event_type}
                  onChange={(e) => setColumnMapping({ ...columnMapping, event_type: e.target.value })}
                  className="w-full bg-[#0a0f1d] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- None / All Events --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">E.g., transaction_type, event_type, action</p>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  What prediction cutoff should be used? (Cutoff T)
                </label>
                <input
                  type="text"
                  value={cutoffTime}
                  onChange={(e) => setCutoffTime(e.target.value)}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  className="w-full bg-[#0a0f1d] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">All features will be constructed as of this exact UTC moment</p>
              </div>
            </div>
          </div>

          {/* Section B: Feature Options Selection */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <span>Select Features to Generate</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label
                onClick={() => toggleFeature('count_7d')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedFeatures.includes('count_7d')
                    ? 'bg-blue-600/10 border-blue-500/40 text-slate-200'
                    : 'bg-[#0a0f1d] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={selectedFeatures.includes('count_7d')}
                    onChange={() => {}}
                    className="rounded bg-slate-900 border-slate-700 text-blue-600"
                  />
                  <span>Number of events in last 7 days</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 pl-6">
                  Counts events occurring strictly in [T - 7 days, T).
                </p>
              </label>

              <label
                onClick={() => toggleFeature('count_30d')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedFeatures.includes('count_30d')
                    ? 'bg-blue-600/10 border-blue-500/40 text-slate-200'
                    : 'bg-[#0a0f1d] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={selectedFeatures.includes('count_30d')}
                    onChange={() => {}}
                    className="rounded bg-slate-900 border-slate-700 text-blue-600"
                  />
                  <span>Number of events in last 30 days</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 pl-6">
                  Counts events occurring strictly in [T - 30 days, T).
                </p>
              </label>

              <label
                onClick={() => toggleFeature('total_amount_30d')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedFeatures.includes('total_amount_30d')
                    ? 'bg-blue-600/10 border-blue-500/40 text-slate-200'
                    : 'bg-[#0a0f1d] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={selectedFeatures.includes('total_amount_30d')}
                    onChange={() => {}}
                    className="rounded bg-slate-900 border-slate-700 text-blue-600"
                  />
                  <span>Total numerical value in last 30 days</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 pl-6">
                  Sums eligible numerical amounts before cutoff. Defaults to 0.00.
                </p>
              </label>

              <label
                onClick={() => toggleFeature('avg_amount_30d')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedFeatures.includes('avg_amount_30d')
                    ? 'bg-blue-600/10 border-blue-500/40 text-slate-200'
                    : 'bg-[#0a0f1d] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={selectedFeatures.includes('avg_amount_30d')}
                    onChange={() => {}}
                    className="rounded bg-slate-900 border-slate-700 text-blue-600"
                  />
                  <span>Average numerical value in last 30 days</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 pl-6">
                  Mean amount of eligible events in [T - 30 days, T).
                </p>
              </label>

              <label
                onClick={() => toggleFeature('days_since_last')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedFeatures.includes('days_since_last')
                    ? 'bg-blue-600/10 border-blue-500/40 text-slate-200'
                    : 'bg-[#0a0f1d] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={selectedFeatures.includes('days_since_last')}
                    onChange={() => {}}
                    className="rounded bg-slate-900 border-slate-700 text-blue-600"
                  />
                  <span>Days since last event</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 pl-6">
                  Elapsed days between cutoff T and most recent eligible event.
                </p>
              </label>

              <label
                onClick={() => toggleFeature('type_counts')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedFeatures.includes('type_counts')
                    ? 'bg-blue-600/10 border-blue-500/40 text-slate-200'
                    : 'bg-[#0a0f1d] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={selectedFeatures.includes('type_counts')}
                    onChange={() => {}}
                    className="rounded bg-slate-900 border-slate-700 text-blue-600"
                  />
                  <span>Count and sum by event type</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 pl-6">
                  Calculates event-type breakdowns (e.g. refunds vs purchases).
                </p>
              </label>
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep(1)}
              className="flex items-center space-x-2 text-slate-400 hover:text-slate-200 text-xs font-medium py-2.5 px-4 rounded-xl border border-slate-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Upload</span>
            </button>

            <button
              onClick={handleGenerateFeatures}
              disabled={isGenerating || !columnMapping.entity_id || !columnMapping.event_time}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-6 rounded-xl text-xs transition-all shadow-md shadow-blue-600/20 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Computing Point-in-Time Features...</span>
                </>
              ) : (
                <>
                  <span>Generate Features</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: RESULTS & DOWNLOAD */}
      {/* ========================================================================= */}
      {currentStep === 3 && generationSummary && (
        <div className="space-y-6">
          <div className="text-center space-y-1">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Step 3 — Features Generated Successfully</h2>
            <p className="text-xs text-slate-400">
              Your dataset has been transformed into point-in-time feature vectors.
            </p>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase font-medium">Unique Entities</span>
              <p className="text-xl font-bold text-slate-100 mt-1">{generationSummary.total_entities}</p>
            </div>
            <div className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase font-medium">Eligible Events</span>
              <p className="text-xl font-bold text-emerald-400 mt-1">
                {generationSummary.eligible_events} / {generationSummary.total_events}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase font-medium">Calculation Time</span>
              <p className="text-xl font-bold text-blue-400 mt-1">{generationSummary.duration_seconds}s</p>
            </div>
            <div className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase font-medium">Filtering Mode</span>
              <p className="text-xs font-semibold text-emerald-400 mt-1 truncate">
                {generationSummary?.has_availability_warning ? "Event-Time Mode" : "Dual-Timestamp Gate"}
              </p>
            </div>
          </div>

          {/* Download Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-blue-600/10 border border-blue-500/30">
            <div>
              <h4 className="text-sm font-semibold text-blue-300">Ready for Machine Learning Training or Inference</h4>
              <p className="text-xs text-blue-200/80">Export as clean CSV for XGBoost, LightGBM, or Scikit-Learn.</p>
            </div>
            <button
              onClick={handleDownloadCsv}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-5 rounded-xl text-xs transition-all shadow-md shadow-blue-600/20"
            >
              <Download className="w-4 h-4" />
              <span>Download ML-Ready CSV</span>
            </button>
          </div>

          {/* Generated Features Preview Grid */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Resulting Features Preview (First {Math.min(10, generatedFeatures.length)} Entities)
            </h4>

            <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0a0f1d]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400 font-medium">
                    {generatedFeatures[0] &&
                      Object.keys(generatedFeatures[0]).map((k) => (
                        <th key={k} className="py-2.5 px-3">
                          {k}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                  {generatedFeatures.slice(0, 10).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      {Object.keys(generatedFeatures[0]).map((k) => (
                        <td key={k} className="py-2 px-3 text-slate-300">
                          {row[k] === null ? '—' : String(row[k])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep(2)}
              className="flex items-center space-x-1.5 text-slate-400 hover:text-slate-200 text-xs font-medium py-2 px-4 rounded-xl border border-slate-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Modify Configuration</span>
            </button>

            <button
              onClick={() => {
                setCurrentStep(1);
                setUploadedFile(null);
                setFileStats(null);
                setDataPreview([]);
              }}
              className="flex items-center space-x-1.5 text-blue-400 hover:text-blue-300 text-xs font-medium py-2 px-4 transition-colors"
            >
              <span>Upload Another Dataset</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
