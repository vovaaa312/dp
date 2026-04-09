import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useJob } from '../hooks/useJob';
import { stopJob } from '../api/client';
import { MetricsChart } from '../components/charts/MetricsChart';
import { StatusBadge } from '../components/jobs/StatusBadge';

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: job, isLoading, isError } = useJob(jobId);

  const stopMutation = useMutation({
    mutationFn: () => stopJob(jobId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  if (isLoading) return <p style={styles.hint}>Loading job…</p>;
  if (isError || !job) return <p style={styles.error}>Job not found.</p>;

  const progress = job.totalEpochs > 0
    ? Math.round((job.currentEpoch / job.totalEpochs) * 100)
    : 0;

  return (
    <div>
      <button onClick={() => navigate(-1)} style={styles.back}>← Back</button>

      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.title}>{job.jobId}</h2>
          <p style={styles.subtitle}>{job.datasetName} · {job.modelName} · {job.trainerType}</p>
        </div>
        <div style={styles.actions}>
          <StatusBadge status={job.status} />
          {(job.status === 'RUNNING' || job.status === 'PENDING') && (
            <button
              style={styles.stopBtn}
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
            >
              {stopMutation.isPending ? 'Stopping…' : 'Stop'}
            </button>
          )}
        </div>
      </div>

      <div style={styles.statsRow}>
        <div style={styles.stat}>
          <div style={styles.statLabel}>Progress</div>
          <div style={styles.statValue}>{job.currentEpoch} / {job.totalEpochs} epochs ({progress}%)</div>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
        </div>

        {job.metrics && (
          <>
            <StatBox label="mAP50" value={`${(job.metrics.mAP50 * 100).toFixed(1)}%`} />
            <StatBox label="Box Loss" value={job.metrics.box_loss.toFixed(4)} />
            <StatBox label="Cls Loss" value={job.metrics.cls_loss.toFixed(4)} />
          </>
        )}
      </div>

      <h3 style={styles.sectionTitle}>Training Curves</h3>
      <MetricsChart history={job.metricsHistory ?? []} />

      {job.error && (
        <div style={styles.errorBox}>
          <strong>Error:</strong> {job.error}
        </div>
      )}

      {job.resultPath && (
        <div style={styles.resultBox}>
          <strong>Model saved:</strong>{' '}
          <code style={styles.code}>{job.resultPath}</code>
        </div>
      )}

      <div style={styles.metaBox}>
        <MetaRow label="Job ID" value={job.jobId} />
        <MetaRow label="Dataset" value={job.datasetName} />
        <MetaRow label="Model" value={job.modelName} />
        <MetaRow label="Trainer" value={job.trainerType} />
        {job.createdAt && <MetaRow label="Created" value={new Date(job.createdAt).toLocaleString()} />}
        {job.startedAt && <MetaRow label="Started" value={new Date(job.startedAt).toLocaleString()} />}
        {job.finishedAt && <MetaRow label="Finished" value={new Date(job.finishedAt).toLocaleString()} />}
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.statBox}>
      <div style={styles.statBoxLabel}>{label}</div>
      <div style={styles.statBoxValue}>{value}</div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.metaRow}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={styles.metaValue}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  back: {
    background: 'none',
    border: 'none',
    color: '#6666ff',
    cursor: 'pointer',
    fontSize: 14,
    padding: '0 0 16px',
    display: 'block',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: {
    margin: 0,
    fontSize: 22,
    color: '#c0c0ff',
    fontFamily: 'monospace',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#6060aa',
  },
  actions: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  stopBtn: {
    padding: '6px 16px',
    background: '#3a1a1a',
    border: '1px solid #6a2a2a',
    borderRadius: 6,
    color: '#ff8888',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 600,
  },
  statsRow: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap' as const,
    marginBottom: 24,
  },
  stat: {
    flex: '1 1 200px',
    background: '#1a1a2e',
    border: '1px solid #2d2d4e',
    borderRadius: 8,
    padding: '12px 16px',
  },
  statLabel: { fontSize: 11, color: '#5050aa', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' as const },
  statValue: { fontSize: 15, color: '#c0c0ff', fontWeight: 600 },
  statBox: {
    flex: '0 0 auto',
    background: '#1a1a2e',
    border: '1px solid #2d2d4e',
    borderRadius: 8,
    padding: '12px 20px',
    textAlign: 'center' as const,
  },
  statBoxLabel: { fontSize: 11, color: '#5050aa', fontWeight: 600, textTransform: 'uppercase' as const },
  statBoxValue: { fontSize: 20, color: '#88aaff', fontWeight: 700, marginTop: 4 },
  progressBar: {
    marginTop: 8,
    height: 6,
    background: '#2d2d4e',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #4444ff, #8888ff)',
    borderRadius: 3,
    transition: 'width 0.5s ease',
  },
  sectionTitle: {
    fontSize: 15,
    color: '#8080bb',
    fontWeight: 600,
    marginBottom: 12,
    marginTop: 0,
  },
  errorBox: {
    marginTop: 16,
    padding: '12px 16px',
    background: '#3a1a1a',
    border: '1px solid #6a2a2a',
    borderRadius: 8,
    color: '#ff8888',
    fontSize: 13,
  },
  resultBox: {
    marginTop: 16,
    padding: '12px 16px',
    background: '#1a3a1a',
    border: '1px solid #2a6a2a',
    borderRadius: 8,
    color: '#88ff88',
    fontSize: 13,
  },
  code: {
    fontFamily: 'monospace',
    background: '#0f0f1a',
    padding: '2px 6px',
    borderRadius: 4,
  },
  metaBox: {
    marginTop: 20,
    background: '#1a1a2e',
    border: '1px solid #2d2d4e',
    borderRadius: 8,
    padding: '12px 16px',
  },
  metaRow: {
    display: 'flex',
    gap: 12,
    padding: '4px 0',
    borderBottom: '1px solid #1d1d3e',
    fontSize: 13,
  },
  metaLabel: { flex: '0 0 100px', color: '#5050aa', fontWeight: 500 },
  metaValue: { color: '#c0c0ff', fontFamily: 'monospace' },
  hint: { color: '#5050aa', fontSize: 14 },
  error: { color: '#ff8888', fontSize: 14 },
};
