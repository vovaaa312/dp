import { useState } from 'react';
import { useJobs } from '../hooks/useJobs';
import { useDatasets } from '../hooks/useDatasets';
import { JobCard } from '../components/jobs/JobCard';
import { JobForm } from '../components/jobs/JobForm';

export function JobsPage() {
  const [showForm, setShowForm] = useState(false);
  const { data: jobs, isLoading: jobsLoading } = useJobs();
  const { data: datasets } = useDatasets();

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.title}>Training Jobs</h2>
        <button
          style={styles.newBtn}
          onClick={() => setShowForm(v => !v)}
        >
          {showForm ? 'Cancel' : '+ New Job'}
        </button>
      </div>

      {showForm && (
        <JobForm
          datasets={datasets ?? []}
          onCreated={() => setShowForm(false)}
        />
      )}

      {jobsLoading && <p style={styles.hint}>Loading jobs…</p>}

      {!jobsLoading && (!jobs || jobs.length === 0) && (
        <div style={styles.empty}>
          No training jobs yet. Create one above.
        </div>
      )}

      {jobs?.map(job => (
        <JobCard key={job.jobId} job={job} />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    margin: 0,
    color: '#c0c0ff',
    fontSize: 22,
    fontWeight: 700,
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
  },
  hint: {
    color: '#5050aa',
    fontSize: 14,
  },
  empty: {
    padding: 40,
    textAlign: 'center',
    color: '#4040aa',
    border: '1px dashed #2d2d4e',
    borderRadius: 10,
    fontSize: 14,
  },
};
