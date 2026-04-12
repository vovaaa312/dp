import { useState, useMemo } from 'react';
import { useJobs } from '../hooks/useJobs';
import { useDatasets } from '../hooks/useDatasets';
import { JobCard } from '../components/jobs/JobCard';
import { JobForm } from '../components/jobs/JobForm';
import type { JobStatus } from '../types';

const STATUS_FILTERS: { label: string; value: JobStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Running', value: 'RUNNING' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Stopped', value: 'STOPPED' },
  { label: 'Failed', value: 'FAILED' },
];

export function JobsPage() {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'ALL'>('ALL');
  const [minEpochs, setMinEpochs] = useState('');

  const { data: jobs, isLoading: jobsLoading } = useJobs();
  const { data: datasets } = useDatasets();

  const filtered = useMemo(() => {
    if (!jobs) return [];
    const q = search.trim().toLowerCase();
    const min = minEpochs === '' ? 0 : parseInt(minEpochs, 10);
    return jobs.filter(job => {
      if (statusFilter !== 'ALL' && job.status !== statusFilter) return false;
      if (!isNaN(min) && min > 0 && job.totalEpochs < min) return false;
      if (q) {
        const name = (job.displayName || job.jobId).toLowerCase();
        if (!name.includes(q) && !job.jobId.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [jobs, search, statusFilter, minEpochs]);

  return (
    <div>
      {/* ── Top bar: search + new job ── */}
      <div style={styles.topBar}>
        <input
          style={styles.searchInput}
          placeholder="Search by name or ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <input
          style={styles.epochInput}
          type="number"
          min={0}
          placeholder="Min epochs"
          value={minEpochs}
          onChange={e => setMinEpochs(e.target.value)}
        />
        <button style={styles.newBtn} onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ New Job'}
        </button>
      </div>

      {/* ── Status pills ── */}
      <div style={styles.statusRow}>
        {STATUS_FILTERS.map(f => {
          const count = f.value !== 'ALL' && jobs
            ? jobs.filter(j => j.status === f.value).length
            : null;
          return (
            <button
              key={f.value}
              style={{ ...styles.pill, ...(statusFilter === f.value ? styles.pillActive : {}) }}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
              {count !== null && count > 0 && (
                <span style={styles.pillCount}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Title ── */}
      <h2 style={styles.title}>Training Jobs</h2>

      {showForm && (
        <JobForm datasets={datasets ?? []} onCreated={() => setShowForm(false)} />
      )}

      {jobsLoading && <p style={styles.hint}>Loading jobs…</p>}

      {!jobsLoading && filtered.length === 0 && (
        <div style={styles.empty}>
          {!jobs || jobs.length === 0
            ? 'No training jobs yet. Create one above.'
            : 'No jobs match the current filters.'}
        </div>
      )}

      {filtered.map(job => (
        <JobCard key={job.jobId} job={job} />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  topBar: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
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
  newBtn: {
    padding: '8px 20px',
    background: 'linear-gradient(135deg, #4444cc, #6666ff)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  statusRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap' as const,
    marginBottom: 16,
  },
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
  title: {
    margin: '0 0 16px',
    color: '#c0c0ff',
    fontSize: 22,
    fontWeight: 700,
  },
  hint: { color: '#5050aa', fontSize: 14 },
  empty: {
    padding: 40,
    textAlign: 'center' as const,
    color: '#4040aa',
    border: '1px dashed #2d2d4e',
    borderRadius: 10,
    fontSize: 14,
  },
};
