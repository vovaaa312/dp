import type { EpochMetrics } from '../../types';

interface Props {
  history: EpochMetrics[];
}

export function ConfusionMatrix({ history }: Props) {
  const latest = [...history].reverse().find(
    item => item.confusion_matrix?.length && item.confusion_matrix_labels?.length
  );
  if (!latest?.confusion_matrix || !latest.confusion_matrix_labels) {
    return <div style={styles.empty}>Confusion matrix will appear after the first validation epoch.</div>;
  }

  const matrix = latest.confusion_matrix;
  const labels = latest.confusion_matrix_labels;
  const max = Math.max(1, ...matrix.flat());

  return (
    <div style={styles.wrapper}>
      <div style={styles.caption}>Epoch {latest.epoch}. Rows are predicted classes; columns are actual classes.</div>
      <div style={styles.scroller}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.axis}>Predicted \ Actual</th>
              {labels.map(label => <th key={label} style={styles.header}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, rowIndex) => (
              <tr key={labels[rowIndex] ?? rowIndex}>
                <th style={styles.header}>{labels[rowIndex] ?? rowIndex}</th>
                {row.map((value, columnIndex) => {
                  const alpha = 0.12 + 0.78 * (value / max);
                  return (
                    <td
                      key={columnIndex}
                      title={(labels[rowIndex] ?? rowIndex) + ' / ' + (labels[columnIndex] ?? columnIndex) + ': ' + value}
                      style={{ ...styles.cell, background: 'rgba(90, 110, 255, ' + alpha + ')' }}
                    >
                      {Number.isInteger(value) ? value : value.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: '#1a1a2e',
    border: '1px solid #2d2d4e',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  },
  caption: { color: '#7070aa', fontSize: 12, marginBottom: 12 },
  scroller: { overflowX: 'auto' },
  table: { borderCollapse: 'collapse', minWidth: 420, color: '#e0e0ff', fontSize: 12 },
  axis: { padding: 8, color: '#8080bb', textAlign: 'right', whiteSpace: 'nowrap' },
  header: { padding: 8, color: '#a0a0dd', border: '1px solid #303050', whiteSpace: 'nowrap' },
  cell: { minWidth: 54, padding: 10, textAlign: 'center', border: '1px solid #303050', fontFamily: 'monospace' },
  empty: {
    background: '#1a1a2e',
    border: '1px solid #2d2d4e',
    borderRadius: 10,
    padding: 24,
    marginBottom: 20,
    color: '#5050aa',
    fontSize: 13,
  },
};