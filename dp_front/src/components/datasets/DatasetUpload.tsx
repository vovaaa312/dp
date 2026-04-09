import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadDataset } from '../../api/client';

export function DatasetUpload() {
  const queryClient = useQueryClient();
  const [lastUploaded, setLastUploaded] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: uploadDataset,
    onSuccess: (data) => {
      setLastUploaded(data.datasetName);
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
    },
  });

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) mutation.mutate(accepted[0]);
    },
    [mutation]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/zip': ['.zip'],
      'application/x-tar': ['.tar', '.gz'],
    },
    maxFiles: 1,
  });

  return (
    <div>
      <div {...getRootProps()} style={{ ...styles.dropzone, ...(isDragActive ? styles.active : {}) }}>
        <input {...getInputProps()} />
        {mutation.isPending ? (
          <p style={styles.hint}>Uploading…</p>
        ) : isDragActive ? (
          <p style={styles.hint}>Drop the file here…</p>
        ) : (
          <>
            <p style={styles.hint}>Drag & drop a dataset archive here</p>
            <p style={styles.sub}>or click to select a .zip / .tar.gz file</p>
          </>
        )}
      </div>

      {mutation.isSuccess && (
        <div style={styles.success}>
          Dataset <strong>{lastUploaded}</strong> uploaded successfully.
        </div>
      )}

      {mutation.isError && (
        <div style={styles.error}>
          Upload failed: {(mutation.error as Error).message}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  dropzone: {
    border: '2px dashed #3d3d6e',
    borderRadius: 10,
    padding: '32px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.2s, background 0.2s',
    background: '#1a1a2e',
  },
  active: {
    borderColor: '#6666ff',
    background: '#1e1e3e',
  },
  hint: {
    color: '#9090bb',
    fontSize: 14,
    margin: 0,
  },
  sub: {
    color: '#5050aa',
    fontSize: 12,
    marginTop: 6,
  },
  success: {
    marginTop: 12,
    padding: '10px 14px',
    background: '#1a3a1a',
    border: '1px solid #2a6a2a',
    borderRadius: 6,
    color: '#88ff88',
    fontSize: 13,
  },
  error: {
    marginTop: 12,
    padding: '10px 14px',
    background: '#3a1a1a',
    border: '1px solid #6a2a2a',
    borderRadius: 6,
    color: '#ff8888',
    fontSize: 13,
  },
};
