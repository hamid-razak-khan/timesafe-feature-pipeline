import React, { useState, useEffect, useId } from 'react';
import {
  Calendar,
  Clock,
  Globe,
  Sparkles,
  Info,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sliders,
} from 'lucide-react';
import {
  getUserTimezone,
  utcIsoToParts,
  partsToUtcIso,
  formatUtcPreview,
  formatLocalPreview,
  pad,
} from '../services/dateUtils';

/**
 * PredictionCutoffPicker
 * 
 * Replaces raw ISO-8601 string inputs with a user-friendly calendar date picker
 * and time selector, providing seamless timezone translation, point-in-time previews,
 * and zero-leakage UTC ISO-8601 output.
 */
export default function PredictionCutoffPicker({
  value, // UTC ISO-8601 string, e.g. "2026-05-31T00:00:00Z"
  onChange, // (newUtcIsoString) => void
  onValidityChange, // optional (isValid) => void
  disabled = false,
  className = '',
}) {
  const dateInputId = useId();
  const timeInputId = useId();

  // Timezone selection mode: 'local' (user timezone) or 'utc'
  const [timezoneMode, setTimezoneMode] = useState('local');
  const userTz = getUserTimezone();

  // Internal date and time strings for the input fields
  const [datePart, setDatePart] = useState('');
  const [timePart, setTimePart] = useState('');
  const [validationError, setValidationError] = useState(null);
  const [isFutureCutoff, setIsFutureCutoff] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Sync internal form inputs whenever incoming UTC `value` changes or timezone mode toggles
  useEffect(() => {
    if (!value) {
      setDatePart('');
      setTimePart('');
      setValidationError('Date and time are required.');
      if (onValidityChange) onValidityChange(false);
      return;
    }

    const parts = utcIsoToParts(value, timezoneMode);
    if (parts.isValid) {
      setDatePart(parts.date);
      setTimePart(parts.time);
      setValidationError(null);

      const d = new Date(value);
      setIsFutureCutoff(d.getTime() > Date.now());
      if (onValidityChange) onValidityChange(true);
    } else {
      setValidationError('Invalid initial timestamp.');
      if (onValidityChange) onValidityChange(false);
    }
  }, [value, timezoneMode]);

  // Handle user date or time change
  const handlePartChange = (newDate, newTime) => {
    setDatePart(newDate);
    setTimePart(newTime);

    if (!newDate || !newTime) {
      const err = !newDate && !newTime ? 'Both date and time are required.' : !newDate ? 'Date is required.' : 'Time is required.';
      setValidationError(err);
      if (onValidityChange) onValidityChange(false);
      return;
    }

    const res = partsToUtcIso(newDate, newTime, timezoneMode);
    if (!res.isValid) {
      setValidationError(res.error);
      if (onValidityChange) onValidityChange(false);
      return;
    }

    setValidationError(null);
    setIsFutureCutoff(res.isFuture);
    if (onValidityChange) onValidityChange(true);
    if (onChange) {
      onChange(res.utcIso);
    }
  };

  // Quick Action 1: Set to Current Moment
  const handleSetCurrentTime = () => {
    const now = new Date();
    let newDate = '';
    let newTime = '';

    if (timezoneMode === 'utc') {
      newDate = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
      newTime = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;
    } else {
      newDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      newTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }

    handlePartChange(newDate, newTime);
  };

  // Quick Action 2: Set Time to Midnight (00:00)
  const handleSetMidnight = () => {
    const targetDate = datePart || (timezoneMode === 'utc' ? `${new Date().getUTCFullYear()}-01-01` : `${new Date().getFullYear()}-01-01`);
    handlePartChange(targetDate, '00:00');
  };

  // Switch between Local Timezone and UTC
  const handleTimezoneModeToggle = (mode) => {
    if (mode === timezoneMode) return;
    setTimezoneMode(mode);
    // Note: useEffect will re-decompose current UTC `value` into the new mode's datePart and timePart
  };

  return (
    <div
      className={`bg-[#16112B] border border-[rgba(168,85,247,0.22)] rounded-2xl p-5 sm:p-6 space-y-4 shadow-[0_0_20px_-5px_rgba(168,85,247,0.15)] transition-all ${className}`}
    >
      {/* Header and Explanation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[rgba(168,85,247,0.15)]">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[#D8B4FE]">
              <Calendar className="w-4 h-4 text-[#A855F7]" />
            </div>
            <h3 className="text-sm font-semibold text-[#F8F7FF] tracking-tight">
              Prediction Date & Time
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#8B5CF6]/15 text-[#D8B4FE] border border-[#8B5CF6]/30">
              Cutoff T
            </span>
          </div>
          <p className="text-xs text-[#A1A1B5] mt-1">
            Choose the date and time at which you want to generate historical features.
          </p>
        </div>

        {/* Timezone Mode Switcher */}
        <div className="flex items-center bg-[#10101F] p-1 rounded-xl border border-[rgba(168,85,247,0.25)] text-xs">
          <button
            type="button"
            onClick={() => handleTimezoneModeToggle('local')}
            disabled={disabled}
            className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center space-x-1.5 ${
              timezoneMode === 'local'
                ? 'bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] text-white shadow-[0_0_10px_-2px_rgba(168,85,247,0.5)]'
                : 'text-[#A1A1B5] hover:text-[#F8F7FF]'
            }`}
          >
            <Globe className="w-3 h-3" />
            <span>Local ({userTz.shortName || 'Local'})</span>
          </button>
          <button
            type="button"
            onClick={() => handleTimezoneModeToggle('utc')}
            disabled={disabled}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              timezoneMode === 'utc'
                ? 'bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] text-white shadow-[0_0_10px_-2px_rgba(168,85,247,0.5)]'
                : 'text-[#A1A1B5] hover:text-[#F8F7FF]'
            }`}
          >
            <span>UTC</span>
          </button>
        </div>
      </div>

      {/* Main Date & Time Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Date Selector */}
        <div>
          <label
            htmlFor={dateInputId}
            className="block text-xs font-medium text-[#D8B4FE] mb-1.5 flex items-center justify-between"
          >
            <span className="flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#A855F7]" />
              <span>Cutoff Date</span>
            </span>
            <span className="text-[11px] text-[#A1A1B5] font-normal">
              {timezoneMode === 'local' ? userTz.name : 'UTC Calendar'}
            </span>
          </label>
          <input
            id={dateInputId}
            type="date"
            value={datePart}
            onChange={(e) => handlePartChange(e.target.value, timePart)}
            disabled={disabled}
            required
            className="w-full bg-[#211936] border border-[rgba(168,85,247,0.25)] rounded-xl px-3.5 py-2.5 text-[#F8F7FF] text-sm focus:outline-none focus:border-[#A855F7] focus:ring-1 focus:ring-[#A855F7] [color-scheme:dark] transition-all cursor-pointer"
          />
        </div>

        {/* Time Selector */}
        <div>
          <label
            htmlFor={timeInputId}
            className="block text-xs font-medium text-[#D8B4FE] mb-1.5 flex items-center justify-between"
          >
            <span className="flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-[#A855F7]" />
              <span>Cutoff Time (24h)</span>
            </span>
            <span className="text-[11px] text-[#A1A1B5] font-mono">
              {timezoneMode === 'local' ? userTz.offsetString : 'UTC+00:00'}
            </span>
          </label>
          <input
            id={timeInputId}
            type="time"
            step="60"
            value={timePart}
            onChange={(e) => handlePartChange(datePart, e.target.value)}
            disabled={disabled}
            required
            className="w-full bg-[#211936] border border-[rgba(168,85,247,0.25)] rounded-xl px-3.5 py-2.5 text-[#F8F7FF] text-sm font-mono focus:outline-none focus:border-[#A855F7] focus:ring-1 focus:ring-[#A855F7] [color-scheme:dark] transition-all cursor-pointer"
          />
        </div>
      </div>

      {/* Quick Action Presets */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[11px] text-[#A1A1B5] font-medium mr-1">Presets:</span>
        <button
          type="button"
          onClick={handleSetCurrentTime}
          disabled={disabled}
          className="text-xs px-2.5 py-1 rounded-lg bg-[#211936] hover:bg-[#8B5CF6]/20 border border-[rgba(168,85,247,0.25)] hover:border-[#8B5CF6]/50 text-[#D8B4FE] transition-all flex items-center space-x-1"
        >
          <Sparkles className="w-3 h-3 text-[#A855F7]" />
          <span>Use Current Date & Time</span>
        </button>

        <button
          type="button"
          onClick={handleSetMidnight}
          disabled={disabled}
          className="text-xs px-2.5 py-1 rounded-lg bg-[#211936] hover:bg-[#8B5CF6]/20 border border-[rgba(168,85,247,0.25)] hover:border-[#8B5CF6]/50 text-[#D8B4FE] transition-all flex items-center space-x-1"
        >
          <Clock className="w-3 h-3 text-[#A855F7]" />
          <span>Set Time to Midnight</span>
        </button>
      </div>

      {/* Validation Error Message */}
      {validationError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Future Cutoff Notice */}
      {isFutureCutoff && !validationError && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300/90 text-xs flex items-start space-x-2.5">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-200">Future Cutoff Selected:</span>{' '}
            TimeSafe permits historical simulation with future dates, but observations not yet occurred or available in your dataset will naturally be excluded by anti-leakage rules.
          </div>
        </div>
      )}

      {/* Clean Cutoff Preview Card */}
      {!validationError && value && (
        <div className="bg-[#10101F]/90 border border-[rgba(168,85,247,0.2)] rounded-xl p-3.5 space-y-1.5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[#A1A1B5]">
                Prediction cutoff (UTC):{' '}
                <strong className="text-[#F8F7FF] font-mono font-semibold">
                  {formatUtcPreview(value)}
                </strong>
              </span>
            </div>

            {timezoneMode === 'local' && (
              <span className="text-[11px] text-[#A1A1B5] font-mono sm:text-right">
                Local: <span className="text-[#D8B4FE]">{formatLocalPreview(value)}</span> ({userTz.shortName || 'Local'})
              </span>
            )}
          </div>

          <p className="text-[11px] text-[#A1A1B5]/90 pl-5.5">
            TimeSafe uses only events that occurred before this date and were available by this time.
          </p>
        </div>
      )}

      {/* Collapsible Advanced Options for Power Users */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-[11px] text-[#A1A1B5] hover:text-[#D8B4FE] flex items-center space-x-1.5 transition-colors focus:outline-none"
        >
          <Sliders className="w-3 h-3 text-[#A855F7]" />
          <span>{showAdvanced ? 'Hide Advanced Cutoff Options' : 'Show Advanced Options (Raw ISO-8601)'}</span>
          {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {showAdvanced && (
          <div className="mt-2.5 p-3 rounded-xl bg-[#10101F] border border-[rgba(168,85,247,0.18)] space-y-2 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <label className="text-[11px] font-mono text-[#A1A1B5]">
                Raw ISO-8601 Payload Sent to FastAPI:
              </label>
              <span className="text-[10px] text-purple-400 font-mono">
                Field: as_of_time / cutoff_time
              </span>
            </div>
            <input
              type="text"
              value={value || ''}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (onChange) onChange(raw);
              }}
              placeholder="e.g. 2026-11-06T08:00:00Z"
              className="w-full bg-[#211936] border border-[rgba(168,85,247,0.25)] rounded-lg px-3 py-1.5 text-xs text-[#F8F7FF] font-mono focus:outline-none focus:border-[#A855F7]"
            />
            <p className="text-[10px] text-[#A1A1B5]">
              Direct editing updates the calendar date and time pickers automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

