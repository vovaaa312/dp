import { useNavigate } from 'react-router-dom';
import type { Job } from '../../types';
import { StatusBadge } from './StatusBadge';

interface Props {
  job: Job;
}

export function JobCard({ job }: Props) {
  const navigate = useNavigate();
  const displayEpoch = Math.min(job.currentEpoch, job.totalEpochs);
  const progress = job.totalEpochs > 0
    ? Math.min(100, Math.round((displayEpoch / job.totalEpochs) * 100))
    : 0;

  return (
    <div
      onClick={() => navigate(`/jobs/${job.jobId}`)}
      style={styles.card}
    >
      <div style={styles.header}>
        <div>
          <div style={styles.jobId}>{job.displayName || job.jobId}</div>
          {job.displayName && <div style={styles.jobIdSmall}>{job.jobId}</div>}
          <div style={styles.subtitle}>{job.datasetName} · {job.modelName}</div>
        </div>
        <StatusBadge status={job.status} />
      </div>

      <div style={styles.meta}>
        <span>Epochs: {displayEpoch}/{job.totalEpochs}</span>
        <span>Trainer: {job.trainerType}</span>
        {job.metrics && (
          <span>mAP50: {(job.metrics.mAP50 * 100).toFixed(1)}%</span>
        )}
      </div>

      {job.status === 'RUNNING' && (
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#1a1a2e',
    border: '1px solid #2d2d4e',
    borderRadius: 10,
    padding: '16px 20px',
    cursor: 'pointer',
    transition: 'border-color 0.15s, transform 0.1s',
    marginBottom: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  jobId: {
    fontSize: 14,
    fontWeight: 700,
    color: '#c0c0ff',
    fontFamily: 'monospace',
  },
  jobIdSmall: {
    fontSize: 10,
    color: '#4040aa',
    fontFamily: 'monospace',
    marginTop: 1,
  },
  subtitle: {
    fontSize: 12,
    color: '#6060aa',
    marginTop: 2,
  },
  meta: {
    display: 'flex',
    gap: 16,
    fontSize: 12,
    color: '#8080bb',
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    background: '#2d2d4e',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #4444ff, #8888ff)',
    borderRadius: 2,
    transition: 'width 0.5s ease',
  },
};
