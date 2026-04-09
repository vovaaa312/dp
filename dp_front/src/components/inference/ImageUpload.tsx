import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function ImageUpload({ onFile, disabled }: Props) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) onFile(accepted[0]);
    },
    [onFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.bmp', '.webp'] },
    maxFiles: 1,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      style={{
        ...styles.zone,
        ...(isDragActive ? styles.active : {}),
        ...(disabled ? styles.disabled : {}),
      }}
    >
      <input {...getInputProps()} />
      {isDragActive
        ? <p style={styles.hint}>Drop the image here…</p>
        : <p style={styles.hint}>Drop an image or click to select (jpg, png, bmp)</p>
      }
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  zone: {
    border: '2px dashed #3d3d6e',
    borderRadius: 10,
    padding: '28px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    background: '#1a1a2e',
    transition: 'border-color 0.2s, background 0.2s',
  },
  active: {
    borderColor: '#6666ff',
    background: '#1e1e3e',
  },
  disabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  hint: {
    margin: 0,
    color: '#9090bb',
    fontSize: 14,
  },
};
