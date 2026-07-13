export interface SpacingValue { top?: number; right?: number; bottom?: number; left?: number }

export function normalizeSpacing(value: unknown, fallback = 0): Required<SpacingValue> {
  if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)))) {
    const number = Number(value); return { top: number, right: number, bottom: number, left: number };
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const all = Number(record.all ?? fallback);
    return {
      top: Number(record.top ?? all), right: Number(record.right ?? all),
      bottom: Number(record.bottom ?? all), left: Number(record.left ?? all),
    };
  }
  return { top: fallback, right: fallback, bottom: fallback, left: fallback };
}

export function spacingToCss(value: unknown, fallback = 0) {
  const spacing = normalizeSpacing(value, fallback);
  return `${spacing.top}px ${spacing.right}px ${spacing.bottom}px ${spacing.left}px`;
}
