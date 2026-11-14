import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
});

export const apiClient = {
  // Health & Metrics
  getHealth: async () => {
    const res = await api.get('/health');
    return res.data;
  },
  getMetrics: async () => {
    const res = await api.get('/metrics');
    return res.data;
  },
  getReconciliationReport: async () => {
    const res = await api.get('/reports/reconciliation');
    return res.data;
  },

  // Pipeline Runs
  getPipelineRuns: async (limit = 50) => {
    const res = await api.get(`/pipeline/runs?limit=${limit}`);
    return res.data;
  },
  getPipelineRun: async (runId) => {
    const res = await api.get(`/pipeline/runs/${runId}`);
    return res.data;
  },
  triggerPipeline: async (payload = {}) => {
    const res = await api.post('/pipeline/run', payload);
    return res.data;
  },

  // Data Generation & Ingestion
  generateData: async (payload) => {
    const res = await api.post('/generate-data', payload);
    return res.data;
  },
  ingestFile: async (fileType, file = null) => {
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/ingest?file_type=${fileType}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    }
    const res = await api.post(`/ingest?file_type=${fileType}`);
    return res.data;
  },

  // Features
  getFeatures: async (params = {}) => {
    const res = await api.get('/features', { params });
    return res.data;
  },
  previewFeatures: async (payload) => {
    const res = await api.post('/features/preview', payload);
    return res.data;
  },
  getExportFeaturesUrl: (version = 'v1') => {
    return `/api/export/features?feature_version=${version}`;
  },

  // Quality & Rejects
  getRejects: async (params = {}) => {
    const res = await api.get('/rejects', { params });
    return res.data;
  },
};

export default apiClient;
