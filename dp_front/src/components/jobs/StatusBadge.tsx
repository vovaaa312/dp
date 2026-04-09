import type { JobStatus } from '../../types';

const STATUS_COLORS: Record<JobStatus, { bg: string; color: string }> = {
  PENDING:   { bg: '#2d3a2d', color: '#aaffaa' },
  RUNNING:   { bg: '#2d2d5e', color: '#88aaff' },
  COMPLETED: { bg: '#1a3a1a', color: '#44ff88' },
  FAILED:    { bg: '#3a1a1a', color: '#ff8888' },
  STOPPED:   { bg: '#3a3a1a', color: '#ffdd88' },
};

interface Props {
  status: JobStatus;
}

export function StatusBadge({ status }: Props) {
  const { bg, color } = STATUS_COLORS[status] ?? { bg: '#333', color: '#fff' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        background: bg,
        color,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
      }}
    >
      {status}
    </span>
  );
}
