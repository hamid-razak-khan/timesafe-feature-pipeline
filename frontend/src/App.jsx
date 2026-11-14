import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import DatasetWizard from './pages/DatasetWizard';
import Results from './pages/Results';
import History from './pages/History';
import AdvancedModal from './components/AdvancedModal';
import apiClient from './services/api';

export default function App() {
  // Read initial page from URL hash if available (e.g. #/dashboard or #/home)
  const getInitialPage = () => {
    const hash = window.location.hash.replace('#/', '').replace('#', '').toLowerCase();
    if (['home', 'dashboard', 'wizard', 'results', 'history'].includes(hash)) {
      return hash;
    }
    return 'home';
  };

  const [activePage, setActivePage] = useState(getInitialPage);
  const [wizardMode, setWizardMode] = useState('upload'); // 'upload' or 'sample'
  const [latestFeatures, setLatestFeatures] = useState([]);
  const [latestSummary, setLatestSummary] = useState(null);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState(null);

  // Sync active page with URL hash for browser refresh & direct URL access
  useEffect(() => {
    window.location.hash = `#/${activePage}`;
  }, [activePage]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '').toLowerCase();
      if (['home', 'dashboard', 'wizard', 'results', 'history'].includes(hash)) {
        setActivePage(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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

  const handleNavigate = (page, mode = 'upload') => {
    if (page === 'wizard') {
      setWizardMode(mode);
    }
    setActivePage(page);
  };

  return (
    <div className="min-h-screen bg-[#080811] text-[#F8F7FF] flex flex-col font-sans selection:bg-[#8B5CF6] selection:text-white">
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
            onNavigate={handleNavigate}
          />
        )}

        {activePage === 'dashboard' && (
          <Dashboard
            onNavigate={handleNavigate}
            onOpenAdvanced={() => setIsAdvancedOpen(true)}
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

        {activePage === 'history' && (
          <History
            onOpenAdvanced={() => setIsAdvancedOpen(true)}
          />
        )}
      </main>

      {/* Expandable Advanced / Technical Details Modal */}
      <AdvancedModal
        isOpen={isAdvancedOpen}
        onClose={() => setIsAdvancedOpen(false)}
      />

      {/* Minimal Footer */}
      <footer className="border-t border-[rgba(168,85,247,0.18)] bg-[#10101F] py-4 px-6 text-center text-xs text-[#A1A1B5]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-[#A855F7] animate-pulse"></span>
            <span>TimeSafe — Point-in-Time ML Feature Store (Dual-Timestamp Anti-Leakage Engine)</span>
          </span>
          <span className="font-mono text-[11px] text-[#A1A1B5]/80">event_time &lt; T &nbsp;|&nbsp; available_at &le; T</span>
        </div>
      </footer>
    </div>
  );
}
