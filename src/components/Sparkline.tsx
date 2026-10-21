import React, { useId } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  /** CSS color; defaults to the M3 primary token */
  stroke?: string;
  /** Render the gradient area fill under the line */
  fill?: boolean;
  className?: string;
}

const buildPaths = (values: number[], w: number, h: number, pad: number) => {
  if (values.length === 0) return { line: '', area: '' };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (h - pad * 2) * (1 - (v - min) / range);
    return [x, y] as const;
  });
  const line = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const area = `${line} L${last[0].toFixed(2)},${h.toFixed(2)} L${first[0].toFixed(2)},${h.toFixed(2)} Z`;
  return { line, area };
};

/**
 * Dependency-free SVG sparkline for mobile KPI cards.
 * Replaces Recharts on ≤768px viewports (~0 KB vs ~110 KB gzip).
 */
export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 120,
  height = 40,
  strokeWidth = 2,
  stroke,
  fill = true,
  className = '',
}) => {
  const rawId = useId();
  const gradientId = `m3-sp-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { line, area } = buildPaths(data, width, height, 3);
  const strokeColor = stroke ?? 'var(--m3-primary)';

  if (!line) return null;

  return (
    <svg
      className={`m3-sparkline ${className}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.24" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

export default Sparkline;
