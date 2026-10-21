import React from 'react';
import './M3Skeleton.css';

interface M3SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  circle?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const M3Skeleton: React.FC<M3SkeletonProps> = ({
  width = '100%',
  height = 16,
  radius,
  circle,
  className = '',
  style,
}) => (
  <span
    className={`m3-skeleton ${className}`}
    style={{
      width,
      height,
      borderRadius: circle ? '50%' : radius ?? 'var(--m3-radius-xs)',
      ...style,
    }}
  />
);

interface M3SkeletonCardProps {
  lines?: number;
  className?: string;
}

export const M3SkeletonCard: React.FC<M3SkeletonCardProps> = ({ lines = 2, className = '' }) => (
  <div className={`m3-skeleton-card ${className}`}>
    <div className="m3-skeleton-card-head">
      <M3Skeleton circle width={40} height={40} />
      <div className="m3-skeleton-card-head-lines">
        <M3Skeleton width="55%" height={14} />
        <M3Skeleton width="35%" height={12} />
      </div>
      <M3Skeleton width={64} height={24} radius="var(--m3-radius-full)" />
    </div>
    {Array.from({ length: lines }).map((_, i) => (
      <M3Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} height={12} />
    ))}
  </div>
);

interface M3SkeletonListProps {
  count?: number;
  lines?: number;
  className?: string;
}

export const M3SkeletonList: React.FC<M3SkeletonListProps> = ({ count = 5, lines = 2, className = '' }) => (
  <div className={`m3-skeleton-list ${className}`} role="status" aria-live="polite" aria-busy="true">
    <span className="m3-sr-only">Loading…</span>
    {Array.from({ length: count }).map((_, i) => (
      <M3SkeletonCard key={i} lines={lines} />
    ))}
  </div>
);

export default M3Skeleton;
