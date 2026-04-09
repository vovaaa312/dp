import { useDatasets } from '../hooks/useDatasets';
import { DatasetUpload } from '../components/datasets/DatasetUpload';

export function DatasetsPage() {
  const { data: datasets, isLoading, refetch } = useDatasets();

  return (
    <div>
      <h2 style={styles.title}>Datasets</h2>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Upload Dataset</h3>
        <DatasetUpload />
        <p style={styles.note}>
          Upload a .zip archive of your dataset. The archive name becomes the dataset name.
          After upload the dataset will appear in the list below.
        </p>
      </div>

      <div style={styles.section}>
        <div style={styles.listHeader}>
          <h3 style={styles.sectionTitle}>Available Datasets</h3>
          <button style={styles.refreshBtn} onClick={() => refetch()}>Refresh</button>
        </div>

        {isLoading && <p style={styles.hint}>Loading…</p>}

        {!isLoading && (!datasets || datasets.length === 0) && (
          <div style={styles.empty}>No datasets uploaded yet.</div>
        )}

        {datasets && datasets.length > 0 && (
          <ul style={styles.list}>
            {datasets.map(name => (
              <li key={name} style={styles.listItem}>
                <span style={styles.datasetIcon}>📁</span>
                <span style={styles.datasetName}>{name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 22, color: '#c0c0ff', fontWeight: 700, marginBottom: 24, marginTop: 0 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 15, color: '#8080bb', fontWeight: 600, marginBottom: 12, marginTop: 0 },
  note: { marginTop: 10, fontSize: 12, color: '#5050aa' },
  listHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  refreshBtn: {
    padding: '4px 12px',
    background: '#1a1a2e',
    border: '1px solid #3d3d6e',
    borderRadius: 6,
    color: '#8080bb',
    cursor: 'pointer',
    fontSize: 12,
  },
  hint: { color: '#5050aa', fontSize: 14 },
  empty: {
    padding: '24px',
    textAlign: 'center',
    color: '#4040aa',
    border: '1px dashed #2d2d4e',
    borderRadius: 8,
    fontSize: 14,
  },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: '#1a1a2e',
    border: '1px solid #2d2d4e',
    borderRadius: 8,
    marginBottom: 8,
  },
  datasetIcon: { fontSize: 16 },
  datasetName: { fontSize: 14, color: '#c0c0ff', fontFamily: 'monospace' },
};
