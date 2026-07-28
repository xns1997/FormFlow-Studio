import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  count?: number;
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 6,
  count = 1,
  className = '',
}: SkeletonProps) {
  const style: React.CSSProperties = {
    width,
    height,
    borderRadius,
    background: 'linear-gradient(90deg, var(--surface-subtle) 25%, var(--panel-soft) 50%, var(--surface-subtle) 75%)',
    backgroundSize: '200% 100%',
    animation: 'skeleton-pulse 1.5s ease-in-out infinite',
  };

  return (
    <div className={`skeleton-container ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-line" style={style} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`skeleton-card ${className}`}>
      <Skeleton width={40} height={40} borderRadius="50%" />
      <div className="skeleton-card-content">
        <Skeleton width="60%" height={14} />
        <Skeleton width="80%" height={12} />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="skeleton-table">
      <div className="skeleton-table-header">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} width={80} height={12} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="skeleton-table-row">
          {Array.from({ length: cols }, (_, col) => (
            <Skeleton key={col} width={60 + Math.random() * 40} height={10} />
          ))}
        </div>
      ))}
    </div>
  );
}
