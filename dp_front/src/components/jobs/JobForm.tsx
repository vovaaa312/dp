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
  const [form, setForm] = useState<CreateJobPayload>({
    datasetName: datasets[0] ?? '',
    modelName: DEFAULT_MODEL,
    epochs: 10,
    imgsz: 640,
    batch: 8,
    trainerType: 'mock',
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
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
          onChange={e => set('trainerType', e.target.value)}
        >
          <option value="mock">Mock (fast demo, no GPU)</option>
          <option value="yolo">YOLO (real training, GPU recommended)</option>
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
            min={32} max={1920} step={32}
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

      {mutation.isError && (
        <div style={styles.error}>
          {(mutation.error as Error).message}
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
