import type { ComponentType } from '../../models';
import type { DesignComponent } from '../../project/types';

export type ExtendedComponentType =
  | ComponentType
  | 'image'
  | 'animatedNumber'
  | 'timePicker'
  | 'dateRange'
  | 'segmented'
  | 'tagInput';

const DESIGN_TO_RUNTIME_TYPE: Record<string, ExtendedComponentType> = {
  input: 'input',
  textarea: 'textarea',
  number: 'numberInput',
  numberInput: 'numberInput',
  select: 'select',
  segmented: 'segmented',
  radio: 'radio',
  checkbox: 'checkbox',
  tagInput: 'tagInput',
  datePicker: 'datePicker',
  timePicker: 'timePicker',
  dateRange: 'dateRange',
  switch: 'switch',
  rating: 'rating',
  upload: 'upload',
  imageUpload: 'imageUpload',
  image: 'image',
  animatedNumber: 'animatedNumber',
  button: 'button',
  text: 'text',
  table: 'table',
  card: 'container',
  container: 'container',
  form: 'container',
  tabs: 'tabs',
  steps: 'steps',
  divider: 'custom',
  chart: 'custom',
  custom: 'custom',
};

const VALUE_TYPES: Partial<Record<ExtendedComponentType, string>> = {
  input: 'string',
  textarea: 'string',
  numberInput: 'number',
  select: 'string',
  segmented: 'string',
  radio: 'string',
  checkbox: 'array',
  tagInput: 'array',
  datePicker: 'date',
  timePicker: 'string',
  dateRange: 'object',
  switch: 'boolean',
  rating: 'number',
  upload: 'array',
  imageUpload: 'array',
  table: 'array',
};

const INTERACTIVE_TYPES = new Set<ExtendedComponentType>([
  'input',
  'textarea',
  'numberInput',
  'select',
  'segmented',
  'radio',
  'checkbox',
  'tagInput',
  'datePicker',
  'timePicker',
  'dateRange',
  'switch',
  'rating',
  'upload',
  'imageUpload',
  'button',
  'tabs',
  'steps',
  'image',
]);

const EDITABLE_TYPES = new Set<ExtendedComponentType>([
  'input',
  'textarea',
  'numberInput',
  'select',
  'segmented',
  'radio',
  'checkbox',
  'tagInput',
  'datePicker',
  'timePicker',
  'dateRange',
  'switch',
  'rating',
  'upload',
  'imageUpload',
]);

const CHROMELESS_TYPES = new Set<ExtendedComponentType>([
  'text',
  'image',
  'table',
  'container',
  'tabs',
  'steps',
  'custom',
  'animatedNumber',
]);

export function getRuntimeComponentType(type: string): ExtendedComponentType {
  return DESIGN_TO_RUNTIME_TYPE[type] || 'input';
}

export function getDesignValuePortType(type: string): string {
  return VALUE_TYPES[getRuntimeComponentType(type)] || 'any';
}

export function isInteractiveComponentType(type: string): boolean {
  return INTERACTIVE_TYPES.has(getRuntimeComponentType(type));
}

export function isEditableComponentType(type: string): boolean {
  return EDITABLE_TYPES.has(getRuntimeComponentType(type));
}

export function shouldShowFieldChrome(type: string): boolean {
  return !CHROMELESS_TYPES.has(getRuntimeComponentType(type));
}

export function getDefaultComponentValue(component: Pick<DesignComponent, 'type' | 'props'>): unknown {
  if (component.props.value !== undefined) return component.props.value;
  if (component.props.defaultValue !== undefined) return component.props.defaultValue;

  // 展示型文本使用 content 作为设计期默认内容。预览运行态也必须拿到同一值，
  // 否则带字段/数据绑定的文本控件会被初始化为空字符串并遮住设计内容。
  if (getRuntimeComponentType(component.type) === 'text' && component.props.content !== undefined) {
    return component.props.content;
  }

  switch (getRuntimeComponentType(component.type)) {
    case 'checkbox':
    case 'tagInput':
    case 'upload':
    case 'imageUpload':
      return [];
    case 'table':
      return component.props.changeTracking === 'dirtyRows'
        ? []
        : Array.isArray(component.props.data)
          ? component.props.data
          : [];
    case 'switch':
      return component.props.defaultValue !== false;
    case 'dateRange':
      return { start: '', end: '' };
    default:
      return '';
  }
}

export function normalizeDateTimeValue(value: unknown, mode: 'date' | 'datetime' | 'time'): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (mode === 'time') {
    const match = raw.match(/^(\d{2}:\d{2})(:\d{2})?/);
    return match ? `${match[1]}${match[2] || ''}` : '';
  }
  const localizedDate = raw.match(/^(\d{4})年(\d{2})月(\d{2})日$/);
  if (localizedDate) {
    const [, year, month, day] = localizedDate;
    return `${year}-${month}-${day}`;
  }
  const slashDate = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (slashDate) {
    const [, year, month, day] = slashDate;
    return `${year}-${month}-${day}`;
  }
  if (mode === 'date') {
    const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : '';
  }
  const normalized = raw.replace('T', ' ');
  const datetimeMatch = normalized.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(:\d{2})?$/);
  if (datetimeMatch) {
    const [, date, time, seconds] = datetimeMatch;
    return `${date} ${time}${seconds || ''}`;
  }
  return '';
}

function zoneOffsetMinutes(date: Date, timezone: string) {
  if (timezone === 'utc') return 0;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset', hour: '2-digit', minute: '2-digit' }).formatToParts(date);
  const offset = parts.find((part) => part.type === 'timeZoneName')?.value.match(/GMT([+-])(\d{2})(?::(\d{2}))?/i);
  if (!offset) return 0;
  return (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3] || 0));
}

/** Convert a wall-clock datetime in the chosen timezone to a stable UTC storage value. */
export function encodeDateTimeForStorage(value: unknown, timezone?: string, mode: 'date' | 'datetime' | 'time' = 'datetime') {
  const normalized = normalizeDateTimeValue(value, mode);
  if (!normalized || mode !== 'datetime' || !timezone || timezone === 'local') return normalized;
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return normalized;
  const [, year, month, day, hour, minute, second = '00'] = match;
  const wall = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const offset = zoneOffsetMinutes(new Date(wall), timezone);
  return new Date(wall - offset * 60_000).toISOString().replace('.000Z', 'Z');
}

/** Convert a stored ISO datetime back to the user's wall-clock value. */
export function decodeDateTimeForDisplay(value: unknown, timezone?: string, mode: 'date' | 'datetime' | 'time' = 'datetime') {
  const raw = String(value ?? '').trim();
  if (!raw || mode !== 'datetime' || !timezone || timezone === 'local' || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return normalizeDateTimeValue(raw, mode);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return normalizeDateTimeValue(raw, mode);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
