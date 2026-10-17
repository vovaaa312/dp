import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createJob } from '../../api/client';
import type { CreateJobPayload } from '../../types';

interface Props {
  datasets: string[];
  onCreated?: () => void;
}

const DEFAULT_MODEL = 'yolov8n.pt';

export function JobForm({ datasets, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [learningRateInput, setLearningRateInput] = useState('0.001');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateJobPayload>({
    datasetName: datasets[0] ?? '',
    modelName: DEFAULT_MODEL,
    epochs: 10,
    imgsz: 640,
    batch: 8,
    trainerType: 'yolo',
    learningRate: 0.001,
    patience: 10,
    seed: 42,
    devicePreference: 'auto',
  });

  const mutation = useMutation({
    mutationFn: createJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      onCreated?.();
    },
  });

  const set = <K extends keyof CreateJobPayload>(key: K, value: CreateJobPayload[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const setTrainer = (trainerType: string) => {
    const defaults: Record<string, { modelName: string; imgsz: number; batch: number }> = {
      yolo: { modelName: 'yolov8n.pt', imgsz: 640, batch: 8 },
      ssd: { modelName: 'ssd300_vgg16', imgsz: 300, batch: 4 },
      faster_rcnn: { modelName: 'fasterrcnn_resnet50_fpn', imgsz: 320, batch: 2 },
      mock: { modelName: 'mock', imgsz: 320, batch: 8 },
    };
    setForm(prev => ({ ...prev, trainerType, ...defaults[trainerType] }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const learningRate = Number(learningRateInput.trim().replace(',', '.'));
    if (!Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 1) {
      setValidationError('Learning rate must be greater than 0 and at most 1 (for example 0.001 or 0,001).');
      return;
    }
    setValidationError(null);
    mutation.mutate({ ...form, learningRate });
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h3 style={styles.title}>New Training Job</h3>

      <div style={styles.row}>
        <label style={styles.label}>Dataset</label>
        <select
          style={styles.select}
          value={form.datasetName}
          onChange={e => set('datasetName', e.target.value)}
          required
        >
          {datasets.length === 0
            ? <option value="">— upload a dataset first —</option>
            : datasets.map(d => <option key={d} value={d}>{d}</option>)
          }
        </select>
      </div>

      <div style={styles.row}>
        <label style={styles.label}>Model</label>
        <input
          style={styles.input}
          value={form.modelName}
          onChange={e => set('modelName', e.target.value)}
          placeholder="yolov8n.pt"
          required
        />
      </div>

      <div style={styles.row}>
        <label style={styles.label}>Trainer</label>
        <select
          style={styles.select}
          value={form.trainerType}
          onChange={e => setTrainer(e.target.value)}
        >
          <option value="mock">Mock (fast demo, no GPU)</option>
          <option value="yolo">YOLOv8n (GPU with automatic CPU fallback)</option>
          <option value="ssd">SSD300 VGG16</option>
          <option value="faster_rcnn">Faster R-CNN ResNet50 FPN</option>
        </select>
      </div>

      <div style={styles.tripleRow}>
        <div>
          <label style={styles.label}>Epochs</label>
          <input
            style={styles.input}
            type="number"
            min={1} max={1000}
            value={form.epochs}
            onChange={e => set('epochs', Number(e.target.value))}
          />
        </div>
        <div>
          <label style={styles.label}>Image size</label>
          <input
            style={styles.input}
            type="number"
            min={32} max={1920} step={1}
            value={form.imgsz}
            onChange={e => set('imgsz', Number(e.target.value))}
          />
        </div>
        <div>
          <label style={styles.label}>Batch size</label>
          <input
            style={styles.input}
            type="number"
            min={1} max={256}
            value={form.batch}
            onChange={e => set('batch', Number(e.target.value))}
          />
        </div>
      </div>

      <div style={styles.quadRow}>
        <div>
          <label style={styles.label}>Learning rate</label>
          <input
            style={styles.input}
            type="text"
            inputMode="decimal"
            value={learningRateInput}
            onChange={e => {
              setLearningRateInput(e.target.value);
              setValidationError(null);
            }}
            placeholder="0.001 or 0,001"
            title="Use a dot or comma as the decimal separator"
          />
        </div>
        <div>
          <label style={styles.label}>Early stopping patience (0 = off)</label>
          <input
            style={styles.input}
            type="number"
            min={0} max={1000}
            value={form.patience}
            onChange={e => set('patience', Number(e.target.value))}
          />
        </div>
        <div>
          <label style={styles.label}>Random seed</label>
          <input
            style={styles.input}
            type="number"
            min={0}
            value={form.seed}
            onChange={e => set('seed', Number(e.target.value))}
          />
        </div>
        <div>
          <label style={styles.label}>Device</label>
          <select
            style={styles.select}
            value={form.devicePreference}
            onChange={e => set('devicePreference', e.target.value as CreateJobPayload['devicePreference'])}
          >
            <option value="auto">Auto (prefer GPU)</option>
            <option value="gpu">GPU (CPU fallback on error)</option>
            <option value="cpu">CPU only</option>
          </select>
        </div>
      </div>

      {(validationError || mutation.isError) && (
        <div style={styles.error}>
          {validationError ?? (mutation.error as Error).message}
        </div>
      )}

      <button
        type="submit"
        style={styles.button}
        disabled={mutation.isPending || !form.datasetName}
      >
        {mutation.isPending ? 'Starting…' : 'Start Training'}
      </button>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    background: '#1a1a2e',
    border: '1px solid #2d2d4e',
    borderRadius: 10,
    padding: '20px 24px',
    marginBottom: 24,
  },
  title: {
    margin: '0 0 16px',
    fontSize: 16,
    color: '#c0c0ff',
    fontWeight: 600,
  },
  row: {
    marginBottom: 12,
  },
  tripleRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 12,
    marginBottom: 12,
  },
  quadRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 12,
    marginBottom: 12,
  },
  label: {
    display: 'block',
    fontSize: 12,
    color: '#7070aa',
    marginBottom: 4,
    fontWeight: 500,
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    background: '#0f0f1a',
    border: '1px solid #3d3d6e',
    borderRadius: 6,
    color: '#e0e0ff',
    fontSize: 13,
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '8px 10px',
    background: '#0f0f1a',
    border: '1px solid #3d3d6e',
    borderRadius: 6,
    color: '#e0e0ff',
    fontSize: 13,
  },
  button: {
    marginTop: 8,
    padding: '10px 24px',
    background: 'linear-gradient(135deg, #4444cc, #6666ff)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    marginBottom: 8,
    padding: '8px 12px',
    background: '#3a1a1a',
    border: '1px solid #6a1a1a',
    borderRadius: 6,
    color: '#ffaaaa',
    fontSize: 13,
  },
};
