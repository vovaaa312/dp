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

export function MetricsChart({ history }: Props) {
  if (history.length === 0) {
    return (
      <div style={styles.empty}>
        Waiting for training metrics…
      </div>
    );
  }

  const data = history.map(m => ({
    epoch: m.epoch,
    'mAP50 (%)': parseFloat((m.mAP50 * 100).toFixed(2)),
    'Box Loss': parseFloat(m.box_loss.toFixed(4)),
    'Cls Loss': parseFloat(m.cls_loss.toFixed(4)),
  }));

  return (
    <div style={styles.wrapper}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d2d4e" />
          <XAxis
            dataKey="epoch"
            stroke="#5050aa"
            tick={{ fill: '#7070bb', fontSize: 11 }}
            label={{ value: 'Epoch', position: 'insideBottom', offset: -2, fill: '#5050aa', fontSize: 11 }}
          />
          <YAxis stroke="#5050aa" tick={{ fill: '#7070bb', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #3d3d6e', borderRadius: 6 }}
            labelStyle={{ color: '#c0c0ff' }}
            itemStyle={{ color: '#e0e0ff' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#9090bb' }} />
          <Line
            type="monotone"
            dataKey="mAP50 (%)"
            stroke="#66aaff"
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="Box Loss"
            stroke="#ff8866"
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="Cls Loss"
            stroke="#88ff88"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: '#1a1a2e',
    border: '1px solid #2d2d4e',
    borderRadius: 10,
    padding: '16px 8px 8px',
  },
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
