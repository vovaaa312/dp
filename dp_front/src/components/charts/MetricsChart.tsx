import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { EpochMetrics } from '../../types';

interface Props {
  history: EpochMetrics[];
}

const percent = (value: number | undefined) =>
  Number((((value ?? 0) * 100)).toFixed(2));

export function MetricsChart({ history }: Props) {
  if (history.length === 0) {
    return <div style={styles.empty}>Waiting for training metrics...</div>;
  }

  const qualityData = history.map(m => ({
    epoch: m.epoch,
    'Accuracy (%)': percent(m.accuracy),
    'Precision (%)': percent(m.precision),
    'Recall (%)': percent(m.recall),
    'F1 (%)': percent(m.f1),
    'mAP@50 (%)': percent(m.mAP50),
    'mAP@50-95 (%)': percent(m.mAP50_95),
  }));
  const lossData = history.map(m => ({
    epoch: m.epoch,
    'Box loss': Number(m.box_loss.toFixed(4)),
    'Class loss': Number(m.cls_loss.toFixed(4)),
    'DFL loss': Number(m.dfl_loss.toFixed(4)),
  }));

  return (
    <div style={styles.grid}>
      <MetricChart title="Detection quality by epoch" data={qualityData} percentAxis>
        <Line type="monotone" dataKey="Accuracy (%)" stroke="#f7c65c" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="Precision (%)" stroke="#66aaff" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="Recall (%)" stroke="#88ff88" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="F1 (%)" stroke="#cc88ff" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="mAP@50 (%)" stroke="#ff8866" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="mAP@50-95 (%)" stroke="#ff66aa" dot={false} strokeWidth={2} />
      </MetricChart>
      <MetricChart title="Training losses by epoch" data={lossData}>
        <Line type="monotone" dataKey="Box loss" stroke="#ff8866" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="Class loss" stroke="#88ff88" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="DFL loss" stroke="#66aaff" dot={false} strokeWidth={2} />
      </MetricChart>
    </div>
  );
}

function MetricChart({
  title,
  data,
  percentAxis = false,
  children,
}: {
  title: string;
  data: Record<string, number>[];
  percentAxis?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.wrapper}>
      <div style={styles.title}>{title}</div>
      <ResponsiveContainer width="100%" height={310}>
        <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d2d4e" />
          <XAxis dataKey="epoch" stroke="#5050aa" tick={{ fill: '#7070bb', fontSize: 11 }} />
          <YAxis
            stroke="#5050aa"
            domain={percentAxis ? [0, 100] : ['auto', 'auto']}
            tick={{ fill: '#7070bb', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #3d3d6e', borderRadius: 6 }}
            labelStyle={{ color: '#c0c0ff' }}
            itemStyle={{ color: '#e0e0ff' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#9090bb' }} />
          {children}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: { display: 'grid', gap: 16, marginBottom: 20 },
  wrapper: {
    background: '#1a1a2e',
    border: '1px solid #2d2d4e',
    borderRadius: 10,
    padding: '14px 8px 8px',
  },
  title: { color: '#a0a0dd', fontSize: 13, fontWeight: 600, padding: '0 10px 8px' },
  empty: {
    background: '#1a1a2e',
    border: '1px solid #2d2d4e',
    borderRadius: 10,
    padding: 32,
    textAlign: 'center',
    color: '#5050aa',
    fontSize: 14,
  },
};