import type { ComponentType } from '../../models';
import type { DesignComponent } from '../../project/types';

export type ExtendedComponentType =
  | ComponentType
  | 'image'
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

  switch (getRuntimeComponentType(component.type)) {
    case 'checkbox':
    case 'tagInput':
    case 'upload':
    case 'imageUpload':
      return [];
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
