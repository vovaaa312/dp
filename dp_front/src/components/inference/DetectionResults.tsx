import { useEffect, useRef } from 'react';
import type { Detection } from '../../types';

interface Props {
  imageFile: File;
  detections: Detection[];
  inferenceTimeMs: number;
}

const COLORS = [
  '#ff6666', '#66aaff', '#66ff88', '#ffaa44',
  '#cc66ff', '#ff66cc', '#44ffee', '#ffff44',
];

export function DetectionResults({ imageFile, detections, inferenceTimeMs }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    const img = new Image();
    img.src = url;
    imgRef.current = img;

    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const maxW = 700;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      detections.forEach((det, i) => {
        const color = COLORS[i % COLORS.length];
        const [x1, y1, x2, y2] = det.bbox.map(v => v * scale);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        const label = `${det.class_name} ${(det.confidence * 100).toFixed(0)}%`;
        ctx.font = 'bold 12px monospace';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = color;
        ctx.fillRect(x1, y1 - 18, tw + 8, 18);
        ctx.fillStyle = '#000';
        ctx.fillText(label, x1 + 4, y1 - 4);
      });
    };

    return () => URL.revokeObjectURL(url);
  }, [imageFile, detections]);

  return (
    <div>
      <div style={styles.meta}>
        <span>{detections.length} detections</span>
        <span>Inference: {inferenceTimeMs.toFixed(1)} ms</span>
      </div>

      <canvas ref={canvasRef} style={styles.canvas} />

      {detections.length > 0 && (
        <table style={styles.table}>
          <thead>
            <tr>
              {['#', 'Class', 'Confidence', 'Bounding Box'].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detections.map((det, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #2d2d4e' }}>
                <td style={styles.td}>{i + 1}</td>
                <td style={styles.td}>{det.class_name}</td>
                <td style={styles.td}>{(det.confidence * 100).toFixed(1)}%</td>
                <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: 11 }}>
                  [{det.bbox.map(v => v.toFixed(0)).join(', ')}]
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  meta: {
    display: 'flex',
    gap: 24,
    marginBottom: 12,
    fontSize: 13,
    color: '#8080bb',
  },
  canvas: {
    maxWidth: '100%',
    borderRadius: 8,
    border: '1px solid #2d2d4e',
    display: 'block',
    marginBottom: 16,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '6px 10px',
    color: '#7070aa',
    borderBottom: '1px solid #3d3d6e',
    fontWeight: 500,
    fontSize: 12,
  },
  td: {
    padding: '6px 10px',
    color: '#c0c0ee',
  },
};
