import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useJobs } from '../hooks/useJobs';
import { runInference } from '../api/client';
import { ImageUpload } from '../components/inference/ImageUpload';
import { DetectionResults } from '../components/inference/DetectionResults';
import type { PredictResponse } from '../types';

export function InferencePage() {
  const { data: jobs } = useJobs();
  const completedJobs = jobs?.filter(j => j.status === 'COMPLETED' && j.resultPath) ?? [];

  const [selectedModelPath, setSelectedModelPath] = useState('yolov8n.pt');
  const [conf, setConf] = useState(0.25);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [result, setResult] = useState<PredictResponse | null>(null);

  const mutation = useMutation({
    mutationFn: ({ file, modelPath, conf }: { file: File; modelPath: string; conf: number }) =>
      runInference(file, modelPath, conf),
    onSuccess: data => setResult(data),
  });

  const handleRun = () => {
    if (!imageFile) return;
    setResult(null);
    mutation.mutate({ file: imageFile, modelPath: selectedModelPath, conf });
  };

  return (
    <div>
      <h2 style={styles.title}>Inference</h2>

      <div style={styles.configRow}>
        <div style={styles.field}>
          <label style={styles.label}>Model</label>
          <select
            style={styles.select}
            value={selectedModelPath}
            onChange={e => setSelectedModelPath(e.target.value)}
          >
            <option value="yolov8n.pt">yolov8n.pt (pretrained)</option>
            {completedJobs.map(j => (
              <option key={j.jobId} value={j.resultPath!}>
                {j.jobId} — {j.modelName}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Confidence threshold</label>
          <input
            style={styles.input}
            type="number"
            min={0.01} max={1.0} step={0.05}
            value={conf}
            onChange={e => setConf(parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div style={styles.section}>
        <label style={styles.sectionLabel}>Upload Image</label>
        <ImageUpload onFile={f => { setImageFile(f); setResult(null); }} disabled={mutation.isPending} />
        {imageFile && <p style={styles.filename}>{imageFile.name}</p>}
      </div>

      <button
        style={styles.runBtn}
        onClick={handleRun}
        disabled={!imageFile || mutation.isPending}
      >
        {mutation.isPending ? 'Running inference…' : 'Run Inference'}
      </button>

      {mutation.isError && (
        <div style={styles.errorBox}>
          Inference failed: {(mutation.error as Error).message}
        </div>
      )}

      {result && imageFile && (
        <div style={styles.resultsSection}>
          <h3 style={styles.sectionLabel}>Detection Results</h3>
          <DetectionResults
            imageFile={imageFile}
            detections={result.detections}
            inferenceTimeMs={result.inference_time_ms}
          />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 22, color: '#c0c0ff', fontWeight: 700, marginBottom: 24, marginTop: 0 },
  configRow: { display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' as const },
  field: { flex: '1 1 200px' },
  label: { display: 'block', fontSize: 12, color: '#7070aa', marginBottom: 4, fontWeight: 500 },
  sectionLabel: { display: 'block', fontSize: 13, color: '#7070aa', marginBottom: 8, fontWeight: 600 },
  select: {
    width: '100%',
    padding: '8px 10px',
    background: '#0f0f1a',
    border: '1px solid #3d3d6e',
    borderRadius: 6,
    color: '#e0e0ff',
    fontSize: 13,
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    background: '#0f0f1a',
    border: '1px solid #3d3d6e',
    borderRadius: 6,
    color: '#e0e0ff',
    fontSize: 13,
    boxSizing: 'border-box' as const,
  },
  section: { marginBottom: 16 },
  filename: { margin: '8px 0 0', fontSize: 12, color: '#6060aa' },
  runBtn: {
    padding: '10px 28px',
    background: 'linear-gradient(135deg, #4444cc, #6666ff)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: 24,
  },
  errorBox: {
    marginTop: 12,
    padding: '10px 14px',
    background: '#3a1a1a',
    border: '1px solid #6a2a2a',
    borderRadius: 6,
    color: '#ff8888',
    fontSize: 13,
  },
  resultsSection: { marginTop: 8 },
};
