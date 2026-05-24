import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.error?.message || err.message || 'Something went wrong';
    return Promise.reject(new Error(message));
  },
);

// Documents
export const uploadDocument = (file: File, force = false) => {
  const formData = new FormData();
  formData.append('file', file);
  if (force) formData.append('force', 'true');
  return api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const getDocuments = (params?: Record<string, string | number>) =>
  api.get('/documents', { params }).then((r) => r.data);

export const getDocument = (id: string) =>
  api.get(`/documents/${id}`).then((r) => r.data);

export const deleteDocument = (id: string) =>
  api.delete(`/documents/${id}`);

export const getDocumentFile = (id: string) =>
  `/api/documents/${id}/file`;

// Analysis
export const askQuestion = (id: string, question: string, topK = 5) =>
  api.post(`/documents/${id}/ask`, { question, topK }, {
    headers: { Accept: 'application/json' },
  }).then((r) => r.data);

export const regenerateSummary = (id: string, style = 'brief') =>
  api.post(`/documents/${id}/summarize`, { style }).then((r) => r.data);

export const getQAHistory = (id: string) =>
  api.get(`/documents/${id}/qa-history`).then((r) => r.data);

// Settings
export const getProviders = () =>
  api.get('/settings/providers').then((r) => r.data);

export const getModelAssignments = () =>
  api.get('/settings/models').then((r) => r.data);

export const updateModelAssignments = (assignments: Record<string, string>) =>
  api.put('/settings/models', { assignments }).then((r) => r.data);

// Health
export const getHealth = () =>
  api.get('/health/ready').then((r) => r.data);

export default api;
