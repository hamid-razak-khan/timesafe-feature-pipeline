import React, { useState, useEffect } from 'react';
import { 
  X, 
  History, 
  ShieldAlert, 
  FileCheck, 
  Sliders, 
  Activity, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import PipelineRuns from '../pages/PipelineRuns';
import DataQuality from '../pages/DataQuality';
import apiClient from '../services/api';

export default function AdvancedModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('runs');
  const [reconReport, setReconReport] = useState(null);
  const [isLoadingRecon, setIsLoadingRecon] = useState(false);

  useEffect(() => {
    if (isOpen && activeTab === 'recon') {
      loadReconciliation();
    }
  }, [isOpen, activeTab]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const loadReconciliation = async () => {
    setIsLoadingRecon(true);
    try {
      const data = await apiClient.getReconciliationReport();
      setReconReport(data);
    } catch (err) {
      console.error('Failed to load reconciliation report:', err);
    } finally {
      setIsLoadingRecon(false);
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'runs', label: 'Pipeline Runs & Telemetry', icon: History },
    { id: 'quality', label: 'Quarantine Store & Rejects', icon: ShieldAlert },
    { id: 'recon', label: 'Mathematical Reconciliation', icon: FileCheck },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div 
        className="bg-[#16112B] border border-[rgba(168,85,247,0.25)] rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl shadow-[#8B5CF6]/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[rgba(168,85,247,0.18)] bg-[#10101F] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 flex items-center justify-center text-[#D8B4FE]">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-[#F8F7FF]">Advanced Operational & Audit Controls</h2>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-[#211936] text-[#D8B4FE] border border-[rgba(168,85,247,0.25)]">
                  Engineer Console
                </span>
              </div>
              <p className="text-xs text-[#A1A1B5]">
                Idempotency logs, quarantine inspection, and strict mathematical data accounting
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#211936] hover:bg-[#2c2247] text-[#A1A1B5] hover:text-[#F8F7FF] flex items-center justify-center transition-colors border border-[rgba(168,85,247,0.2)]"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 border-b border-[rgba(168,85,247,0.18)] bg-[#10101F]/80 flex space-x-2 shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 ${
                  isActive
                    ? 'border-[#8B5CF6] text-[#D8B4FE] bg-[#8B5CF6]/10'
                    : 'border-transparent text-[#A1A1B5] hover:text-[#F8F7FF] hover:bg-[#211936]/40'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body / Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#080811]">
          {activeTab === 'runs' && (
            <div className="max-w-5xl mx-auto">
              <PipelineRuns />
            </div>
          )}

          {activeTab === 'quality' && (
            <div className="max-w-5xl mx-auto">
              <DataQuality />
            </div>
          )}

          {activeTab === 'recon' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(168,85,247,0.18)]">
                <div>
                  <h3 className="text-base font-bold text-[#F8F7FF]">Mathematical Reconciliation Audit</h3>
                  <p className="text-xs text-[#A1A1B5] mt-0.5">
                    Formal audit verification: Every row ingested equals accepted plus rejected. Zero orphaned records.
                  </p>
                </div>
                <button
                  onClick={loadReconciliation}
                  disabled={isLoadingRecon}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#211936] hover:bg-[#2c2247] text-[#F8F7FF] text-xs border border-[rgba(168,85,247,0.25)] transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRecon ? 'animate-spin text-[#8B5CF6]' : ''}`} />
                  <span>Refresh Audit</span>
                </button>
              </div>

              {/* Mathematical Proof Card */}
              <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-xl p-5 space-y-3">
                <div className="text-xs font-semibold text-[#D8B4FE] uppercase tracking-wider">
                  Reconciliation Invariant Rule
                </div>
                <div className="p-4 rounded-lg bg-[#10101F] border border-[#8B5CF6]/30 font-mono text-sm text-[#D8B4FE] text-center shadow-inner">
                  Total Ingested = Valid Inserted + Duplicates Skipped + Quarantined Rejections
                </div>
                <p className="text-xs text-[#A1A1B5] leading-relaxed">
                  Every pipeline run checks this invariant. If any record is unaccounted for or orphaned, the run is flagged as failed.
                </p>
              </div>

              {/* Report Contents */}
              {reconReport ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.18)]">
                      <div className="text-xs text-[#A1A1B5]">Total Runs Evaluated</div>
                      <div className="text-2xl font-bold text-[#F8F7FF] mt-1">
                        {reconReport.total_runs_evaluated ?? reconReport.run_audits?.length ?? 0}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.18)]">
                      <div className="text-xs text-[#A1A1B5]">Overall Audit Status</div>
                      <div className={`text-xl font-bold mt-1 flex items-center space-x-1.5 ${
                        reconReport.overall_status === 'PASSED' ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {reconReport.overall_status === 'PASSED' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-400" />
                        )}
                        <span>{reconReport.overall_status || 'PENDING'}</span>
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-[#16112B] border border-[rgba(168,85,247,0.18)]">
                      <div className="text-xs text-[#A1A1B5]">Generated At</div>
                      <div className="text-xs font-mono text-[#D8B4FE] mt-2">
                        {reconReport.generated_at ? new Date(reconReport.generated_at).toLocaleString() : 'Recent'}
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-xl p-4">
                    <h4 className="text-xs font-semibold text-[#D8B4FE] mb-2 uppercase tracking-wider">
                      Audit JSON Report Payload
                    </h4>
                    <pre className="p-3 rounded-lg bg-[#10101F] border border-[rgba(168,85,247,0.18)] font-mono text-xs text-[#F8F7FF] overflow-x-auto max-h-72">
                      {JSON.stringify(reconReport, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-[#A1A1B5] bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-xl">
                  {isLoadingRecon ? 'Loading reconciliation report...' : 'No reconciliation report generated yet.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

