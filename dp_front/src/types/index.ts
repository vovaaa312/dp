export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED';

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  username: string;
  role: string;
}

export interface EpochMetrics {
  epoch: number;
  box_loss: number;
  cls_loss: number;
  dfl_loss: number;
  mAP50: number;
  mAP50_95: number;
}

export interface Job {
  jobId: string;
  datasetName: string;
  modelName: string;
  totalEpochs: number;
  currentEpoch: number;
  trainerType: string;
  status: JobStatus;
  metrics: EpochMetrics | null;
  metricsHistory: EpochMetrics[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  resultPath: string | null;
}

export interface CreateJobPayload {
  datasetName: string;
  modelName: string;
  epochs: number;
  imgsz: number;
  batch: number;
  trainerType: string;
}

export interface Detection {
  class_id: number;
  class_name: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface PredictResponse {
  detections: Detection[];
  image_path: string;
  result_image_path: string | null;
  inference_time_ms: number;
  model_path: string;
}

export interface DatasetUploadResponse {
  datasetName: string;
  path: string;
  sizeBytes: number;
}
