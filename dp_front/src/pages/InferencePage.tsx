import { useState, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useJobs } from '../hooks/useJobs';
import { runInference } from '../api/client';
import { ImageUpload } from '../components/inference/ImageUpload';
import { DetectionResults } from '../components/inference/DetectionResults';
import type { PredictResponse } from '../types';

export function InferencePage() {
  const { data: jobs } = useJobs();
  const completedJobs = jobs?.filter(j => j.status === 'COMPLETED' && j.resultPath) ?? [];

  const [modelSearch, setModelSearch] = useState('');
  const [datasetFilter, setDatasetFilter] = useState<string>('ALL');
  const [minEpochs, setMinEpochs] = useState('');
  const [selectedModelPath, setSelectedModelPath] = useState('yolov8n.pt');
  const [conf, setConf] = useState(0.25);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [result, setResult] = useState<PredictResponse | null>(null);

  const datasetNames = useMemo(() => {
    const set = new Set(completedJobs.map(j => j.datasetName));
    return Array.from(set).sort();
  }, [completedJobs]);

  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    const min = minEpochs === '' ? 0 : parseInt(minEpochs, 10);
    return completedJobs.filter(j => {
      if (datasetFilter !== 'ALL' && j.datasetName !== datasetFilter) return false;
      if (!isNaN(min) && min > 0 && j.totalEpochs < min) return false;
      if (q) {
        const name = (j.displayName || j.jobId).toLowerCase();
        if (!name.includes(q) && !j.jobId.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [completedJobs, modelSearch, datasetFilter, minEpochs]);

  const selectedLabel = selectedModelPath === 'yolov8n.pt'
    ? 'yolov8n.pt (pretrained)'
    : (() => {
        const j = completedJobs.find(j => j.resultPath === selectedModelPath);
        return j ? `${j.displayName || j.jobId} — ${j.modelName}` : selectedModelPath;
      })();

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

      {/* ── Model picker with filters ── */}
      <div style={styles.modelSection}>
        <label style={styles.sectionLabel}>Model</label>
        <div style={styles.filterRow}>
          <input
            style={styles.searchInput}
            placeholder="Search by name or ID…"
            value={modelSearch}
            onChange={e => setModelSearch(e.target.value)}
          />
          <input
            style={styles.epochInput}
            type="number"
            min={0}
            placeholder="Min epochs"
            value={minEpochs}
            onChange={e => setMinEpochs(e.target.value)}
          />
        </div>
        <div style={styles.pillRow}>
          <button
            style={{ ...styles.pill, ...(datasetFilter === 'ALL' ? styles.pillActive : {}) }}
            onClick={() => setDatasetFilter('ALL')}
          >
            All
          </button>
          {datasetNames.map(ds => (
            <button
              key={ds}
              style={{ ...styles.pill, ...(datasetFilter === ds ? styles.pillActive : {}) }}
              onClick={() => setDatasetFilter(ds)}
            >
              {ds}
              <span style={styles.pillCount}>
                {completedJobs.filter(j => j.datasetName === ds).length}
              </span>
            </button>
          ))}
        </div>
        <div style={styles.modelList}>
          <div
            style={{
              ...styles.modelItem,
              ...(selectedModelPath === 'yolov8n.pt' ? styles.modelItemActive : {}),
            }}
            onClick={() => setSelectedModelPath('yolov8n.pt')}
          >
            <div style={styles.modelName}>yolov8n.pt</div>
            <div style={styles.modelSub}>pretrained · COCO</div>
          </div>
          {filteredModels.map(j => (
            <div
              key={j.jobId}
              style={{
                ...styles.modelItem,
                ...(selectedModelPath === j.resultPath ? styles.modelItemActive : {}),
              }}
              onClick={() => setSelectedModelPath(j.resultPath!)}
            >
              <div style={styles.modelName}>{j.displayName || j.jobId}</div>
              <div style={styles.modelSub}>
                {j.datasetName} · {j.modelName} · {j.totalEpochs} ep
                {j.metrics ? ` · mAP50 ${(j.metrics.mAP50 * 100).toFixed(1)}%` : ''}
              </div>
            </div>
          ))}
          {filteredModels.length === 0 && completedJobs.length > 0 && (
            <div style={styles.modelEmpty}>No models match the search.</div>
          )}
          {completedJobs.length === 0 && (
            <div style={styles.modelEmpty}>No trained models yet.</div>
          )}
        </div>
        <div style={styles.selectedLabel}>Selected: <strong>{selectedLabel}</strong></div>
      </div>

      {/* ── Config row ── */}
      <div style={styles.configRow}>
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
        <div style={styles.field}>
          <label style={styles.label}>Upload Image</label>
          <ImageUpload onFile={f => { setImageFile(f); setResult(null); }} disabled={mutation.isPending} />
          {imageFile && <p style={styles.filename}>{imageFile.name}</p>}
        </div>
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
  title: { fontSize: 22, color: '#c0c0ff', fontWeight: 700, marginBottom: 20, marginTop: 0 },
  modelSection: { marginBottom: 20 },
  sectionLabel: { display: 'block', fontSize: 13, color: '#7070aa', marginBottom: 8, fontWeight: 600 },
  filterRow: { display: 'flex', gap: 10, marginBottom: 8 },
  searchInput: {
    flex: 1,
    background: '#0f0f1a',
    border: '1px solid #2d2d4e',
    borderRadius: 8,
    padding: '8px 14px',
    color: '#c0c0ff',
    fontSize: 13,
    fontFamily: 'monospace',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  epochInput: {
    width: 120,
    background: '#0f0f1a',
    border: '1px solid #2d2d4e',
    borderRadius: 8,
    padding: '8px 12px',
    color: '#c0c0ff',
    fontSize: 13,
    outline: 'none',
  },
  pillRow: { display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 8 },
  pill: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 14px',
    background: '#1a1a2e',
    border: '1px solid #2d2d4e',
    borderRadius: 20,
    color: '#6060aa',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  pillActive: {
    background: '#2a2a5e',
    border: '1px solid #5555cc',
    color: '#c0c0ff',
  },
  pillCount: {
    background: '#3a3a6e',
    borderRadius: 10,
    padding: '1px 6px',
    fontSize: 10,
    color: '#9090dd',
  },
  modelList: {
    maxHeight: 180,
    overflowY: 'auto' as const,
    border: '1px solid #2d2d4e',
    borderRadius: 8,
    background: '#0f0f1a',
  },
  modelItem: {
    padding: '8px 14px',
    cursor: 'pointer',
    borderBottom: '1px solid #1d1d3e',
    transition: 'background 0.1s',
  },
  modelItemActive: {
    background: '#2a2a5e',
    borderLeft: '3px solid #6666ff',
  },
  modelName: { fontSize: 13, color: '#c0c0ff', fontWeight: 600, fontFamily: 'monospace' },
  modelSub: { fontSize: 11, color: '#5050aa', marginTop: 2 },
  modelEmpty: { padding: '12px 14px', fontSize: 12, color: '#4040aa', textAlign: 'center' as const },
  selectedLabel: { marginTop: 6, fontSize: 12, color: '#6060aa' },
  configRow: { display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' as const, alignItems: 'flex-start' },
  field: { flex: '1 1 200px' },
  label: { display: 'block', fontSize: 12, color: '#7070aa', marginBottom: 4, fontWeight: 500 },
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
