import React, { useState, useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  RefreshCw, 
  Send, 
  Save, 
  Info,
  Clock,
  ArrowRight,
  FileCode2
} from 'lucide-react';
import apiClient from '../services/api';

export default function CorrectionModal({ isOpen, onClose, rejectRecord, onReprocessSuccess }) {
  if (!isOpen || !rejectRecord) return null;

  // Parse raw original payload
  let parsedRaw = {};
  try {
    if (typeof rejectRecord.raw_record === 'string') {
      parsedRaw = JSON.parse(rejectRecord.raw_record);
    } else if (rejectRecord.raw_record) {
      parsedRaw = rejectRecord.raw_record;
    }
  } catch (err) {
    parsedRaw = { raw: rejectRecord.raw_record };
  }

  // Form state
  const [formData, setFormData] = useState({
    customer_id: parsedRaw.customer_id || parsedRaw.entity_id || rejectRecord.entity_id || '',
    transaction_id: parsedRaw.transaction_id || parsedRaw.record_id || rejectRecord.record_id || '',
    amount: parsedRaw.amount !== undefined ? parsedRaw.amount : (rejectRecord.amount || ''),
    event_time: parsedRaw.event_time || parsedRaw.timestamp || rejectRecord.event_time || '',
    available_at: parsedRaw.available_at || rejectRecord.available_at || '',
    transaction_type: parsedRaw.transaction_type || parsedRaw.event_type || rejectRecord.event_type || 'purchase',
    correction_reason: '',
  });

  const [validationResult, setValidationResult] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  // Auto-validate on mount
  useEffect(() => {
    handleValidate();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setValidationResult(null);
    setSubmitError(null);
  };

  const handleValidate = async () => {
    setIsValidating(true);
    setSubmitError(null);
    try {
      const payload = {
        customer_id: formData.customer_id,
        transaction_id: formData.transaction_id,
        amount: formData.amount,
        event_time: formData.event_time,
        available_at: formData.available_at || undefined,
        transaction_type: formData.transaction_type,
      };
      const res = await apiClient.validateCorrection(rejectRecord.reject_id || 'preview', payload);
      setValidationResult(res);
    } catch (err) {
      setSubmitError(err.response?.data?.detail || 'Validation probe failed.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    setSubmitError(null);
    try {
      await apiClient.saveCorrection(rejectRecord.reject_id, {
        corrected_payload: {
          customer_id: formData.customer_id,
          transaction_id: formData.transaction_id,
          amount: formData.amount,
          event_time: formData.event_time,
          available_at: formData.available_at,
          transaction_type: formData.transaction_type,
        },
        correction_reason: formData.correction_reason || 'Saved draft from UI',
      });
      setSubmitSuccess('Correction draft successfully saved.');
      setTimeout(() => setSubmitSuccess(null), 3500);
    } catch (err) {
      setSubmitError(err.response?.data?.detail || 'Failed to save correction draft.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleReprocess = async () => {
    setIsReprocessing(true);
    setSubmitError(null);
    try {
      const res = await apiClient.reprocessReject(rejectRecord.reject_id, {
        corrected_payload: {
          customer_id: formData.customer_id,
          transaction_id: formData.transaction_id,
          amount: formData.amount,
          event_time: formData.event_time,
          available_at: formData.available_at,
          transaction_type: formData.transaction_type,
        },
        correction_reason: formData.correction_reason || 'Approved and reprocessed by operator',
      });

      setSubmitSuccess(res.message || 'Record successfully reprocessed into operational storage!');
      if (onReprocessSuccess) {
        onReprocessSuccess(res);
      }
      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (err) {
      setSubmitError(err.response?.data?.detail || 'Failed to reprocess record.');
    } finally {
      setIsReprocessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0f172a] border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#0a0f1d]">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-100">Review & Fix Quarantined Record</h3>
                <span className="text-[11px] font-mono bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded">
                  {rejectRecord.reject_id}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Source: <span className="text-slate-300">{rejectRecord.source_file}</span> (Row {rejectRecord.source_row_number})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Rejection Diagnostic Banner */}
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-1.5">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                {rejectRecord.rejection_title || 'Rejection Diagnostic'}
              </span>
            </div>
            <p className="text-xs text-rose-200 leading-relaxed font-mono">
              {rejectRecord.rejection_reason}
            </p>
          </div>

          {/* Dual Panel: Original Raw vs Editable */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left: Original Read-Only Payload */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <FileCode2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Original Raw Input</span>
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-mono">
                  Immutable
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-[#070b14] border border-slate-800 font-mono text-xs text-slate-300 max-h-60 overflow-y-auto leading-relaxed">
                <pre className="whitespace-pre-wrap">{JSON.stringify(parsedRaw, null, 2)}</pre>
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                Original raw records are permanently preserved in the quarantine audit log.
              </p>
            </div>

            {/* Right: Editable Form */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                  <span>Corrected Values</span>
                </span>
                <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
                  Editable
                </span>
              </div>

              <div className="space-y-3">
                {/* Customer ID */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Entity / Customer ID *
                  </label>
                  <input
                    type="text"
                    name="customer_id"
                    value={formData.customer_id}
                    onChange={handleChange}
                    className={`w-full bg-[#070b14] border rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none transition-colors ${
                      validationResult?.errors?.entity_id
                        ? 'border-rose-500/70 focus:border-rose-500'
                        : 'border-slate-800 focus:border-blue-500'
                    }`}
                    placeholder="e.g. CUST_001"
                  />
                  {validationResult?.errors?.entity_id && (
                    <span className="text-[11px] text-rose-400 mt-0.5 block">{validationResult.errors.entity_id}</span>
                  )}
                </div>

                {/* Transaction ID */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Record / Transaction ID *
                  </label>
                  <input
                    type="text"
                    name="transaction_id"
                    value={formData.transaction_id}
                    onChange={handleChange}
                    className={`w-full bg-[#070b14] border rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none transition-colors ${
                      validationResult?.errors?.transaction_id
                        ? 'border-rose-500/70 focus:border-rose-500'
                        : 'border-slate-800 focus:border-blue-500'
                    }`}
                    placeholder="e.g. TX_1002"
                  />
                  {validationResult?.errors?.transaction_id && (
                    <span className="text-[11px] text-rose-400 mt-0.5 block">{validationResult.errors.transaction_id}</span>
                  )}
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Amount (Positive Decimal) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="amount"
                    value={formData.amount}
                    onChange={handleChange}
                    className={`w-full bg-[#070b14] border rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none transition-colors ${
                      validationResult?.errors?.amount
                        ? 'border-rose-500/70 focus:border-rose-500'
                        : 'border-slate-800 focus:border-blue-500'
                    }`}
                    placeholder="e.g. 85.50"
                  />
                  {validationResult?.errors?.amount && (
                    <span className="text-[11px] text-rose-400 mt-0.5 block">{validationResult.errors.amount}</span>
                  )}
                </div>

                {/* Event Time */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Event Time (ISO-8601 UTC) *
                  </label>
                  <input
                    type="text"
                    name="event_time"
                    value={formData.event_time}
                    onChange={handleChange}
                    className={`w-full bg-[#070b14] border rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none transition-colors ${
                      validationResult?.errors?.event_time
                        ? 'border-rose-500/70 focus:border-rose-500'
                        : 'border-slate-800 focus:border-blue-500'
                    }`}
                    placeholder="2026-03-01T14:30:00Z"
                  />
                  {validationResult?.errors?.event_time && (
                    <span className="text-[11px] text-rose-400 mt-0.5 block">{validationResult.errors.event_time}</span>
                  )}
                </div>

                {/* Available At */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Available At (Optional / Defaults to Event Time)
                  </label>
                  <input
                    type="text"
                    name="available_at"
                    value={formData.available_at}
                    onChange={handleChange}
                    className={`w-full bg-[#070b14] border rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none transition-colors ${
                      validationResult?.errors?.available_at
                        ? 'border-rose-500/70 focus:border-rose-500'
                        : 'border-slate-800 focus:border-blue-500'
                    }`}
                    placeholder="2026-03-01T14:35:00Z"
                  />
                  {validationResult?.errors?.available_at && (
                    <span className="text-[11px] text-rose-400 mt-0.5 block">{validationResult.errors.available_at}</span>
                  )}
                </div>

                {/* Transaction Type */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Transaction Type
                  </label>
                  <select
                    name="transaction_type"
                    value={formData.transaction_type}
                    onChange={handleChange}
                    className="w-full bg-[#070b14] border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="purchase">purchase</option>
                    <option value="refund">refund</option>
                    <option value="transfer">transfer</option>
                    <option value="payment">payment</option>
                  </select>
                </div>

                {/* Reason for Correction */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Correction Reason / Note (Audit Log)
                  </label>
                  <input
                    type="text"
                    name="correction_reason"
                    value={formData.correction_reason}
                    onChange={handleChange}
                    className="w-full bg-[#070b14] border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                    placeholder="e.g. Corrected negative sign and clarified timestamp"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Validation Feedback Strip */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="flex items-center space-x-2 text-xs">
              {validationResult ? (
                validationResult.is_valid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-emerald-300 font-medium">
                      All validation checks passed. Ready to reprocess.
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="text-rose-300 font-medium">
                      {validationResult.plain_english_summary}
                    </span>
                  </>
                )
              ) : (
                <>
                  <Info className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="text-slate-400">Click Validate Again to run rule checks.</span>
                </>
              )}
            </div>

            <button
              onClick={handleValidate}
              disabled={isValidating}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center space-x-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin text-blue-400' : ''}`} />
              <span>Validate Again</span>
            </button>
          </div>

          {/* Anti-Leakage Guarantee Notice */}
          <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-slate-300 flex items-start space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-blue-300">Point-in-Time Anti-Leakage Guarantee:</span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Reprocessing sets{' '}
                <span className="font-mono text-blue-300">effective_available_at = max(available_at, current_utc_time)</span>.
                This ensures that past feature snapshots remain strictly reproducible and never retroactively leak newly corrected data.
              </p>
            </div>
          </div>

          {/* Submission Alerts */}
          {submitError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {submitSuccess && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{submitSuccess}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-[#0a0f1d] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isReprocessing}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center space-x-1.5 transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingDraft ? 'Saving Draft...' : 'Save Draft'}</span>
            </button>

            <button
              onClick={handleReprocess}
              disabled={isReprocessing || !validationResult?.is_valid}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center space-x-1.5 transition-colors disabled:opacity-50 shadow-md shadow-blue-600/20"
            >
              {isReprocessing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Reprocessing...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Reprocess Record</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
