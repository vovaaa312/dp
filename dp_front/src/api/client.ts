import axios from 'axios';
import type { AuthResponse, CreateJobPayload, DatasetUploadResponse, Job, LoginPayload, PredictResponse, RegisterPayload } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token from localStorage to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to /login on 401
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (payload: LoginPayload): Promise<AuthResponse> =>
  api.post<AuthResponse>('/auth/login', payload).then(r => r.data);

export const register = (payload: RegisterPayload): Promise<AuthResponse> =>
  api.post<AuthResponse>('/auth/register', payload).then(r => r.data);

// Jobs
export const getJobs = (): Promise<Job[]> =>
  api.get<Job[]>('/jobs').then(r => r.data);

export const getJob = (jobId: string): Promise<Job> =>
  api.get<Job>(`/jobs/${jobId}`).then(r => r.data);

export const createJob = (payload: CreateJobPayload): Promise<Job> =>
  api.post<Job>('/jobs', payload).then(r => r.data);

export const stopJob = (jobId: string): Promise<Job> =>
  api.delete<Job>(`/jobs/${jobId}`).then(r => r.data);

// Datasets
export const getDatasets = (): Promise<string[]> =>
  api.get<string[]>('/datasets').then(r => r.data);

export const uploadDataset = (file: File): Promise<DatasetUploadResponse> => {
  const form = new FormData();
  form.append('file', file);
  return api
    .post<DatasetUploadResponse>('/datasets/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then(r => r.data);
};

// Inference
export const runInference = (
  file: File,
  modelPath: string,
  conf: number
): Promise<PredictResponse> => {
  const form = new FormData();
  form.append('file', file);
  form.append('modelPath', modelPath);
  form.append('conf', String(conf));
  return api
    .post<PredictResponse>('/inference', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then(r => r.data);
};

export default api;
