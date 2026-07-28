import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import type {
  DateBusinessDayConfig,
  DateConstraintBoundaryConfig,
  DateConstraintConfig,
  DateDefaultValueConfig,
  DateRangeLinkagePolicy,
} from '../../project/types';

dayjs.extend(isoWeek);

export type DateConvenienceKind = 'datePicker' | 'timePicker' | 'dateRange';

export interface DateConstraintState {
  min?: string;
  max?: string;
  mode: 'date' | 'datetime' | 'time';
  weekdaysOnly: boolean;
  conflict?: string;
}

export interface DateConvenienceDiagnostics {
  defaultSource: string;
  constraintSummary: string[];
  cleared?: boolean;
  reason?: string;
}

function isRangeValue(value: unknown): value is { start?: unknown; end?: unknown } {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isEmptyDateValue(value: unknown, kind: DateConvenienceKind) {
  if (kind === 'dateRange') {
    if (!isRangeValue(value)) return true;
    return !String(value.start ?? '').trim() && !String(value.end ?? '').trim();
  }
  return !String(value ?? '').trim();
}

export function normalizeDateLike(value: unknown, mode: 'date' | 'datetime' | 'time'): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (mode === 'time') {
    const parsed = dayjs(raw, ['HH:mm:ss', 'HH:mm'], true);
    return parsed.isValid() ? parsed.format(raw.includes(':') && raw.split(':').length === 3 ? 'HH:mm:ss' : 'HH:mm') : '';
  }
  const patterns = mode === 'datetime'
    ? ['YYYY-MM-DDTHH:mm:ss', 'YYYY-MM-DDTHH:mm', 'YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm']
    : ['YYYY-MM-DD', 'YYYY/MM/DD', 'YYYY年MM月DD日'];
  const parsed = dayjs(raw, patterns, true);
  if (!parsed.isValid()) return '';
  return parsed.format(mode === 'datetime' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD');
}

function parseValue(value: unknown, mode: 'date' | 'datetime' | 'time') {
  const normalized = normalizeDateLike(value, mode);
  if (!normalized) return null;
  const parsed = dayjs(normalized, mode === 'time' ? ['HH:mm:ss', 'HH:mm'] : mode === 'datetime' ? ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm'] : ['YYYY-MM-DD'], true);
  return parsed.isValid() ? parsed : null;
}

function applyOffset(base: dayjs.Dayjs, amount = 0, unit: dayjs.ManipulateType = 'day') {
  return amount ? base.add(amount, unit) : base;
}

function formatResolvedValue(value: dayjs.Dayjs, mode: 'date' | 'datetime' | 'time', storageFormat?: string) {
  const fallback = mode === 'date' ? 'YYYY-MM-DD' : mode === 'datetime' ? 'YYYY-MM-DD HH:mm:ss' : 'HH:mm:ss';
  return value.format(storageFormat || fallback);
}

export function resolveDateDefaultValue(
  config: DateDefaultValueConfig | undefined,
  values: Record<string, unknown>,
  mode: 'date' | 'datetime' | 'time',
  storageFormat?: string,
): string | { start: string; end: string } | '' {
  if (!config || config.mode === 'none') return '';
  const now = dayjs();
  const resolveSingle = () => {
    switch (config.mode) {
      case 'today':
        return formatResolvedValue(now.startOf('day'), mode === 'time' ? 'time' : 'date', storageFormat);
      case 'now':
        return formatResolvedValue(now, mode, storageFormat);
      case 'offsetFromNow':
        return formatResolvedValue(
          applyOffset(now, Number(config.offset ?? 0), (config.unit || 'day') as dayjs.ManipulateType),
          mode,
          storageFormat,
        );
      case 'startOfWeek':
        return formatResolvedValue(now.startOf('isoWeek'), mode === 'time' ? 'time' : 'date', storageFormat);
      case 'endOfWeek':
        return formatResolvedValue(now.endOf('isoWeek'), mode === 'time' ? 'time' : 'date', storageFormat);
      case 'startOfMonth':
        return formatResolvedValue(now.startOf('month'), mode === 'time' ? 'time' : 'date', storageFormat);
      case 'endOfMonth':
        return formatResolvedValue(now.endOf('month'), mode === 'time' ? 'time' : 'date', storageFormat);
      case 'fromField': {
        const fieldValue = values[String(config.field || '')];
        const parsed = parseValue(fieldValue, mode);
        if (!parsed) return '';
        return formatResolvedValue(
          applyOffset(parsed, Number(config.offset ?? 0), (config.unit || 'day') as dayjs.ManipulateType),
          mode,
          storageFormat,
        );
      }
      default:
        return '';
    }
  };
  if (config.mode === 'rangePreset') {
    if (config.preset === 'thisWeek') {
      return {
        start: formatResolvedValue(now.startOf('isoWeek'), 'date', storageFormat),
        end: formatResolvedValue(now.endOf('isoWeek'), 'date', storageFormat),
      };
    }
    if (config.preset === 'thisMonth') {
      return {
        start: formatResolvedValue(now.startOf('month'), 'date', storageFormat),
        end: formatResolvedValue(now.endOf('month'), 'date', storageFormat),
      };
    }
  }
  return resolveSingle();
}

function resolveBoundary(
  boundary: DateConstraintBoundaryConfig | undefined,
  values: Record<string, unknown>,
  mode: 'date' | 'datetime' | 'time',
) {
  if (!boundary || boundary.mode === 'none') return '';
  const now = dayjs();
  switch (boundary.mode) {
    case 'fixed':
      return normalizeDateLike(boundary.value, mode);
    case 'today':
      return formatResolvedValue(now.startOf('day'), mode === 'time' ? 'time' : 'date');
    case 'now':
      return formatResolvedValue(now, mode);
    case 'field': {
      const parsed = parseValue(values[String(boundary.field || '')], mode);
      return parsed ? formatResolvedValue(parsed, mode) : '';
    }
    case 'fieldOffset': {
      const parsed = parseValue(values[String(boundary.field || '')], mode);
      return parsed ? formatResolvedValue(applyOffset(parsed, Number(boundary.offset ?? 0), (boundary.unit || 'day') as dayjs.ManipulateType), mode) : '';
    }
    default:
      return '';
  }
}

export function resolveDateConstraintState(
  config: DateConstraintConfig | undefined,
  values: Record<string, unknown>,
  mode: 'date' | 'datetime' | 'time',
  businessDayConfig?: DateBusinessDayConfig,
  legacy?: { minDate?: unknown; maxDate?: unknown },
): DateConstraintState {
  const min = resolveBoundary(config?.min, values, mode) || normalizeDateLike(legacy?.minDate, mode);
  const max = resolveBoundary(config?.max, values, mode) || normalizeDateLike(legacy?.maxDate, mode);
  const state: DateConstraintState = {
    min: min || undefined,
    max: max || undefined,
    mode,
    weekdaysOnly: (businessDayConfig?.mode || 'allDays') === 'weekdaysOnly',
  };
  const minDay = min ? parseValue(min, mode) : null;
  const maxDay = max ? parseValue(max, mode) : null;
  if (minDay && maxDay && minDay.isAfter(maxDay)) {
    state.conflict = '最小限制晚于最大限制';
  }
  return state;
}

function isWeekendValue(value: unknown, mode: 'date' | 'datetime' | 'time') {
  if (mode === 'time') return false;
  const parsed = parseValue(value, mode);
  if (!parsed) return false;
  const day = parsed.day();
  return day === 0 || day === 6;
}

export function syncDateValue(
  value: unknown,
  kind: DateConvenienceKind,
  constraints: DateConstraintState,
  policy: DateRangeLinkagePolicy = 'clearInvalid',
) {
  if (kind === 'dateRange') {
    const next = isRangeValue(value) ? { start: String(value.start ?? ''), end: String(value.end ?? '') } : { start: '', end: '' };
    if (!next.start && !next.end) return { value: next, changed: false, reason: '' };
    const start = parseValue(next.start, 'date');
    const end = parseValue(next.end, 'date');
    const min = constraints.min ? parseValue(constraints.min, 'date') : null;
    const max = constraints.max ? parseValue(constraints.max, 'date') : null;
    const invalid = !start || !end
      || end.isBefore(start)
      || (min ? start.isBefore(min) || end.isBefore(min) : false)
      || (max ? start.isAfter(max) || end.isAfter(max) : false)
      || (constraints.weekdaysOnly && (isWeekendValue(next.start, 'date') || isWeekendValue(next.end, 'date')));
    if (!invalid) return { value: next, changed: false, reason: '' };
    return {
      value: { start: '', end: '' },
      changed: policy === 'clearInvalid',
      reason: '日期范围已失效',
    };
  }
  const mode = kind === 'timePicker' ? 'time' : constraints.mode;
  const raw = String(value ?? '').trim();
  if (!raw) return { value: '', changed: false, reason: '' };
  const parsed = parseValue(raw, mode);
  if (!parsed) return { value: '', changed: true, reason: '日期格式无效' };
  const min = constraints.min ? parseValue(constraints.min, mode) : null;
  const max = constraints.max ? parseValue(constraints.max, mode) : null;
  const invalid = (min && parsed.isBefore(min)) || (max && parsed.isAfter(max)) || (constraints.weekdaysOnly && isWeekendValue(raw, mode));
  if (!invalid) return { value: raw, changed: false, reason: '' };
  return { value: '', changed: true, reason: '日期已超出限制' };
}

export function describeDateDefaultSource(config: DateDefaultValueConfig | undefined) {
  const unitLabel: Record<string, string> = { day: '天', week: '周', month: '个月', hour: '小时', minute: '分钟' };
  if (!config || config.mode === 'none') return '不预填';
  switch (config.mode) {
    case 'today': return '今天';
    case 'now': return '当前时间';
    case 'offsetFromNow': return `当前时间${Number(config.offset || 0) >= 0 ? '后' : '前'} ${Math.abs(Number(config.offset || 0))}${unitLabel[String(config.unit || 'day')] || '天'}`;
    case 'startOfWeek': return '本周开始';
    case 'endOfWeek': return '本周结束';
    case 'startOfMonth': return '本月开始';
    case 'endOfMonth': return '本月结束';
    case 'fromField': return `跟随字段 ${config.field || '未选择'}`;
    case 'rangePreset': return config.preset === 'thisMonth' ? '本月区间' : '本周区间';
    default: return '不预填';
  }
}

export function describeDateConstraints(constraints: DateConstraintState) {
  const parts: string[] = [];
  if (constraints.min) parts.push(`最小值 ${constraints.min}`);
  if (constraints.max) parts.push(`最大值 ${constraints.max}`);
  if (constraints.weekdaysOnly) parts.push('仅工作日');
  if (constraints.conflict) parts.push(constraints.conflict);
  return parts;
}
