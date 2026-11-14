import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import DatasetWizard from './pages/DatasetWizard';
import Results from './pages/Results';
import AdvancedModal from './components/AdvancedModal';
import apiClient from './services/api';

export default function App() {
  const [activePage, setActivePage] = useState('home');
  const [wizardMode, setWizardMode] = useState('upload'); // 'upload' or 'sample'
  const [latestFeatures, setLatestFeatures] = useState([]);
  const [latestSummary, setLatestSummary] = useState(null);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState(null);

  const checkHealth = async () => {
    try {
      const data = await apiClient.getHealth();
      setHealthStatus(data);
    } catch (err) {
      setHealthStatus({ status: 'offline', error: err.message });
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleStartUpload = () => {
    setWizardMode('upload');
    setActivePage('wizard');
  };

  const handleStartSample = () => {
    setWizardMode('sample');
    setActivePage('wizard');
  };

  const handleFeaturesGenerated = (features, summary) => {
    setLatestFeatures(features);
    setLatestSummary(summary);
  };

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Primary Simplified Navbar */}
      <Navbar
        activePage={activePage}
        setActivePage={setActivePage}
        onOpenAdvanced={() => setIsAdvancedOpen(true)}
        healthStatus={healthStatus}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
        {activePage === 'home' && (
          <Home
            onStartUpload={handleStartUpload}
            onStartSample={handleStartSample}
          />
        )}

        {activePage === 'wizard' && (
          <DatasetWizard
            key={wizardMode}
            initialMode={wizardMode}
            onComplete={handleFeaturesGenerated}
          />
        )}

        {activePage === 'results' && (
          <Results
            initialFeatures={latestFeatures}
            initialSummary={latestSummary}
            onNavigateToWizard={handleStartUpload}
          />
        )}
      </main>

      {/* Expandable Advanced / Technical Details Modal */}
      <AdvancedModal
        isOpen={isAdvancedOpen}
        onClose={() => setIsAdvancedOpen(false)}
      />

      {/* Minimal Footer */}
      <footer className="border-t border-slate-900 bg-[#070b14] py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>TimeSafe — Point-in-Time ML Feature Store (Dual-Timestamp Anti-Leakage Engine)</span>
          <span className="font-mono text-[11px] text-slate-600">event_time &lt; T &nbsp;|&nbsp; available_at &le; T</span>
        </div>
      </footer>
    </div>
  );
}
