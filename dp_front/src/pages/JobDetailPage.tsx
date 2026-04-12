import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useJob } from '../hooks/useJob';
import { stopJob, resumeJob, deleteModel, renameJob, getJobLogs } from '../api/client';
import { MetricsChart } from '../components/charts/MetricsChart';
import { StatusBadge } from '../components/jobs/StatusBadge';

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: job, isLoading, isError } = useJob(jobId);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const isTerminal = job?.status === 'COMPLETED' || job?.status === 'FAILED' || job?.status === 'STOPPED';
  const { data: logs } = useQuery({
    queryKey: ['job-logs', jobId],
    queryFn: () => getJobLogs(jobId!),
    enabled: !!jobId && !!job,
    refetchInterval: isTerminal ? false : 3000,
    retry: false,
  });

  const logBoxRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [logs]);

  const stopMutation = useMutation({
    mutationFn: () => stopJob(jobId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeJob(jobId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteModel(jobId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      navigate('/', { replace: true });
    },
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => renameJob(jobId!, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setEditingName(false);
    },
  });

  if (isLoading) return <p style={styles.hint}>Loading job…</p>;
  if (isError || !job) return <p style={styles.error}>Job not found.</p>;

  const displayEpoch = Math.min(job.currentEpoch, job.totalEpochs);
  const progress = job.totalEpochs > 0
    ? Math.min(100, Math.round((displayEpoch / job.totalEpochs) * 100))
    : 0;

  const label = job.displayName || job.jobId;

  const startEditing = () => {
    setNameInput(job.displayName || '');
    setEditingName(true);
  };

  return (
    <div>
      <button onClick={() => navigate(-1)} style={styles.back}>← Back</button>

      <div style={styles.headerRow}>
        <div>
          {editingName ? (
            <div style={styles.renameRow}>
              <input
                autoFocus
                style={styles.renameInput}
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') renameMutation.mutate(nameInput);
                  if (e.key === 'Escape') setEditingName(false);
                }}
                placeholder="Enter display name"
              />
              <button style={styles.saveName} onClick={() => renameMutation.mutate(nameInput)}
                disabled={renameMutation.isPending}>
                {renameMutation.isPending ? '...' : 'Save'}
              </button>
              <button style={styles.cancelName} onClick={() => setEditingName(false)}>Cancel</button>
            </div>
          ) : (
            <div style={styles.titleRow}>
              <h2 style={styles.title}>{label}</h2>
              <button style={styles.editNameBtn} onClick={startEditing} title="Rename">✏️</button>
            </div>
          )}
          <p style={styles.subtitle}>{job.datasetName} · {job.modelName} · {job.trainerType}</p>
          {job.displayName && <p style={styles.jobIdSmall}>{job.jobId}</p>}
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
          {(job.status === 'STOPPED' || job.status === 'FAILED') && (
            <button
              style={styles.resumeBtn}
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
            >
              {resumeMutation.isPending ? 'Resuming…' : 'Resume'}
            </button>
          )}
          {(job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'STOPPED') && (
            <button
              style={styles.deleteBtn}
              onClick={() => {
                if (window.confirm('Delete this job and its model files?')) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>
      </div>

      <div style={styles.statsRow}>
        <div style={styles.stat}>
          <div style={styles.statLabel}>Progress</div>
          <div style={styles.statValue}>{displayEpoch} / {job.totalEpochs} epochs ({progress}%)</div>
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

      <h3 style={styles.sectionTitle}>Training Log</h3>
      <pre ref={logBoxRef} style={styles.logBox}>
        {logs
          ? logs
          : isTerminal
            ? <span style={styles.logHint}>No log file for this job.</span>
            : <span style={styles.logHint}>⏳ Waiting for training to start…</span>}
      </pre>

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
  back: { background: 'none', border: 'none', color: '#6666ff', cursor: 'pointer', fontSize: 14, padding: '0 0 16px', display: 'block' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  titleRow: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { margin: 0, fontSize: 22, color: '#c0c0ff', fontFamily: 'monospace' },
  jobIdSmall: { margin: '2px 0 0', fontSize: 11, color: '#4040aa', fontFamily: 'monospace' },
  editNameBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px', opacity: 0.6 },
  renameRow: { display: 'flex', alignItems: 'center', gap: 8 },
  renameInput: { background: '#0f0f1a', border: '1px solid #4444aa', borderRadius: 6, padding: '6px 10px', color: '#c0c0ff', fontSize: 16, fontFamily: 'monospace', width: 260 },
  saveName: { padding: '5px 12px', background: '#4444ff', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  cancelName: { padding: '5px 12px', background: 'transparent', border: '1px solid #2d2d4e', borderRadius: 6, color: '#8080bb', fontSize: 12, cursor: 'pointer' },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6060aa' },
  actions: { display: 'flex', gap: 12, alignItems: 'center' },
  stopBtn: { padding: '6px 16px', background: '#3a1a1a', border: '1px solid #6a2a2a', borderRadius: 6, color: '#ff8888', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  resumeBtn: { padding: '6px 16px', background: '#1a2a3a', border: '1px solid #2a4a6a', borderRadius: 6, color: '#88bbff', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  deleteBtn: { padding: '6px 16px', background: '#3a1a1a', border: '1px solid #6a2a2a', borderRadius: 6, color: '#ff8888', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  statsRow: { display: 'flex', gap: 16, flexWrap: 'wrap' as const, marginBottom: 24 },
  stat: { flex: '1 1 200px', background: '#1a1a2e', border: '1px solid #2d2d4e', borderRadius: 8, padding: '12px 16px' },
  statLabel: { fontSize: 11, color: '#5050aa', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' as const },
  statValue: { fontSize: 15, color: '#c0c0ff', fontWeight: 600 },
  statBox: { flex: '0 0 auto', background: '#1a1a2e', border: '1px solid #2d2d4e', borderRadius: 8, padding: '12px 20px', textAlign: 'center' as const },
  statBoxLabel: { fontSize: 11, color: '#5050aa', fontWeight: 600, textTransform: 'uppercase' as const },
  statBoxValue: { fontSize: 20, color: '#88aaff', fontWeight: 700, marginTop: 4 },
  progressBar: { marginTop: 8, height: 6, background: '#2d2d4e', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #4444ff, #8888ff)', borderRadius: 3, transition: 'width 0.5s ease' },
  sectionTitle: { fontSize: 15, color: '#8080bb', fontWeight: 600, marginBottom: 12, marginTop: 0 },
  errorBox: { marginTop: 16, padding: '12px 16px', background: '#3a1a1a', border: '1px solid #6a2a2a', borderRadius: 8, color: '#ff8888', fontSize: 13 },
  resultBox: { marginTop: 16, padding: '12px 16px', background: '#1a3a1a', border: '1px solid #2a6a2a', borderRadius: 8, color: '#88ff88', fontSize: 13 },
  code: { fontFamily: 'monospace', background: '#0f0f1a', padding: '2px 6px', borderRadius: 4 },
  metaBox: { marginTop: 20, background: '#1a1a2e', border: '1px solid #2d2d4e', borderRadius: 8, padding: '12px 16px' },
  metaRow: { display: 'flex', gap: 12, padding: '4px 0', borderBottom: '1px solid #1d1d3e', fontSize: 13 },
  metaLabel: { flex: '0 0 100px', color: '#5050aa', fontWeight: 500 },
  metaValue: { color: '#c0c0ff', fontFamily: 'monospace' },
  hint: { color: '#5050aa', fontSize: 14 },
  error: { color: '#ff8888', fontSize: 14 },
  logBox: {
    background: '#07070f',
    border: '1px solid #2d2d4e',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#a0c0ff',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    minHeight: 80,
    maxHeight: 380,
    overflowY: 'auto' as const,
    marginBottom: 20,
    lineHeight: 1.7,
  },
  logHint: { color: '#5050aa', fontStyle: 'italic' as const },
};
