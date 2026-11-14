import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import DataIngestion from './pages/DataIngestion';
import FeatureExplorer from './pages/FeatureExplorer';
import DataQuality from './pages/DataQuality';
import PipelineRuns from './pages/PipelineRuns';
import apiClient from './services/api';

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
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

  return (
    <div className="flex h-screen bg-[#0a0f1d] text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        healthStatus={healthStatus}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-800 bg-[#0f172a]/60 backdrop-blur-md px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400">
              ML Feature Store
            </span>
            <span className="text-xs text-slate-500 font-mono">
              Domain: E-Commerce Transactional
            </span>
          </div>

          <div className="flex items-center space-x-4 text-xs text-slate-400">
            <span className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="text-slate-300 font-medium">Point-in-Time Correct</span>
            </span>
            <span className="text-slate-700">|</span>
            <span className="text-slate-400">TimeSafe Architecture</span>
          </div>
        </header>

        {/* Dynamic Page Container */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            {activePage === 'dashboard' && <Dashboard onNavigate={setActivePage} />}
            {activePage === 'ingestion' && <DataIngestion />}
            {activePage === 'features' && <FeatureExplorer />}
            {activePage === 'quality' && <DataQuality />}
            {activePage === 'runs' && <PipelineRuns />}
          </div>
        </div>
      </main>
    </div>
  );
}

