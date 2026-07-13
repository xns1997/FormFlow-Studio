import React, { useEffect, useMemo, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: unknown;
  fallback?: unknown;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  useGrouping?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clampDuration(duration: unknown): number {
  const ms = Number(duration);
  if (!Number.isFinite(ms)) return 1200;
  return Math.max(0, Math.min(6000, ms));
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

function formatNumber(value: number, decimals: number, useGrouping: boolean): string {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping,
  }).format(value);
}

export default function AnimatedNumber({
  value,
  fallback = '--',
  duration = 1200,
  decimals = 0,
  prefix = '',
  suffix = '',
  useGrouping = true,
  className,
  style,
}: AnimatedNumberProps) {
  const safeDuration = clampDuration(duration);
  const safeDecimals = Math.max(0, Math.min(6, Number(decimals) || 0));
  const target = useMemo(() => toFiniteNumber(value), [value]);
  const [displayValue, setDisplayValue] = useState<number | null>(target);
  const previousTargetRef = useRef<number>(target ?? 0);

  useEffect(() => {
    if (target == null) {
      setDisplayValue(null);
      return;
    }

    const from = previousTargetRef.current;
    previousTargetRef.current = target;

    if (safeDuration === 0 || from === target) {
      setDisplayValue(target);
      return;
    }

    let frameId = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / safeDuration);
      const eased = easeOutCubic(progress);
      setDisplayValue(from + (target - from) * eased);
      if (progress < 1) frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [safeDuration, target]);

  const rendered = displayValue == null
    ? String(value ?? fallback)
    : `${prefix}${formatNumber(displayValue, safeDecimals, !!useGrouping)}${suffix}`;

  return (
    <span className={className} style={style}>
      {rendered}
    </span>
  );
}
