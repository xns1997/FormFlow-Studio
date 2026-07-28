export interface SequenceRule {
  start: number;
  step: number;
  formatter: string;
  onlyWhenEmpty?: boolean;
}

const DEFAULT_FORMATTER = '{n}';
const SEQUENCE_TOKEN = /\{(?:n|num)(?::\d+)?\}/;
const DATE_TOKEN = /\{(yyyyMMdd|yyyyMM|yyyy|yy|MM|dd)\}/g;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeSequenceRule(rule?: Partial<SequenceRule> | null): SequenceRule {
  const formatter = String(rule?.formatter || DEFAULT_FORMATTER).trim();
  return {
    start: Number.isFinite(Number(rule?.start)) ? Number(rule?.start) : 1,
    step: Number.isFinite(Number(rule?.step)) && Number(rule?.step) > 0 ? Number(rule?.step) : 1,
    formatter: SEQUENCE_TOKEN.test(formatter) ? formatter : `${formatter || ''}${DEFAULT_FORMATTER}`,
    onlyWhenEmpty: rule?.onlyWhenEmpty !== false,
  };
}

function pad(value: number, width = 2) {
  return String(value).padStart(width, '0');
}

export function resolveSequenceDateTokens(formatter: string, now: Date = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return formatter.replace(DATE_TOKEN, (_match, token: string) => {
    switch (token) {
      case 'yyyyMMdd':
        return `${year}${pad(month)}${pad(day)}`;
      case 'yyyyMM':
        return `${year}${pad(month)}`;
      case 'yyyy':
        return String(year);
      case 'yy':
        return String(year).slice(-2);
      case 'MM':
        return pad(month);
      case 'dd':
        return pad(day);
      default:
        return '';
    }
  });
}

export function formatSequenceValue(value: number, formatter?: string, now?: Date) {
  const template = normalizeSequenceRule({ formatter }).formatter;
  return resolveSequenceDateTokens(template, now).replace(/\{(?:n|num)(?::(\d+))?\}/g, (_match, width) => {
    const digits = typeof width === 'string' && width ? String(value).padStart(Number(width), '0') : String(value);
    return digits;
  });
}

export function parseSequenceValue(raw: unknown, formatter?: string, now?: Date): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw == null || raw === '') return null;
  const template = resolveSequenceDateTokens(normalizeSequenceRule({ formatter }).formatter, now);
  const token = /\{(?:n|num)(?::(\d+))?\}/;
  const match = template.match(token);
  if (!match) {
    const numeric = Number(String(raw).trim());
    return Number.isFinite(numeric) ? numeric : null;
  }
  const prefix = template.slice(0, match.index || 0);
  const suffix = template.slice((match.index || 0) + match[0].length);
  const regex = new RegExp(`^${escapeRegex(prefix)}(\\d+)${escapeRegex(suffix)}$`);
  const captured = String(raw).trim().match(regex);
  if (!captured) return null;
  const numeric = Number(captured[1]);
  return Number.isFinite(numeric) ? numeric : null;
}

export function getNextSequenceNumber(
  rows: Array<Record<string, unknown>>,
  field: string,
  rule?: Partial<SequenceRule> | null,
  now?: Date,
) {
  const normalized = normalizeSequenceRule(rule);
  let maxValue: number | null = null;
  for (const row of rows) {
    const numeric = parseSequenceValue(row[field], normalized.formatter, now);
    if (numeric == null) continue;
    maxValue = maxValue == null ? numeric : Math.max(maxValue, numeric);
  }
  return maxValue == null ? normalized.start : maxValue + normalized.step;
}
