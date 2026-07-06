import React from 'react';
import {
  Button,
  Checkbox,
  ColorPicker,
  ConfigProvider,
  DatePicker,
  Input,
  InputNumber,
  Radio,
  Rate,
  Select,
  Segmented,
  Switch,
  TimePicker,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

const { RangePicker } = DatePicker;
const { TextArea } = Input;
const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';
const DEFAULT_DATETIME_FORMAT = 'YYYY-MM-DD HH:mm';
const DEFAULT_TIME_FORMAT = 'HH:mm';
const DEFAULT_TIME_WITH_SECONDS_FORMAT = 'HH:mm:ss';

export type FormOption = { label: string; value: string };
export type UploadFileValue = { name: string; size: number; type: string; url?: string };

export function toOptions(options: unknown): FormOption[] {
  if (!Array.isArray(options)) return [];
  return options.map((option) => {
    if (option && typeof option === 'object') {
      const record = option as Record<string, unknown>;
      const value = record.value ?? record.label ?? '';
      return { label: String(record.label ?? value), value: String(value) };
    }
    return { label: String(option), value: String(option) };
  });
}

function normalizeDayValue(value: unknown, kind: 'date' | 'datetime' | 'time'): Dayjs | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (kind === 'datetime') {
    const parsed = dayjs(normalized, [
      'YYYY-MM-DDTHH:mm:ss',
      'YYYY-MM-DDTHH:mm',
      'YYYY-MM-DD HH:mm:ss',
      'YYYY-MM-DD HH:mm',
      DEFAULT_DATETIME_FORMAT,
    ], true);
    return parsed.isValid() ? parsed : null;
  }
  if (kind === 'time') {
    const parsed = dayjs(normalized, [DEFAULT_TIME_WITH_SECONDS_FORMAT, DEFAULT_TIME_FORMAT], true);
    return parsed.isValid() ? parsed : null;
  }
  const parsed = dayjs(normalized, [DEFAULT_DATE_FORMAT, 'YYYY/MM/DD', 'YYYY年MM月DD日'], true);
  return parsed.isValid() ? parsed : null;
}

function formatDayValue(
  value: Dayjs | null,
  kind: 'date' | 'datetime' | 'time',
  options?: { showSeconds?: boolean; format?: string },
) {
  if (!value) return '';
  if (kind === 'datetime') {
    const format = options?.format || (options?.showSeconds ? 'YYYY-MM-DDTHH:mm:ss' : 'YYYY-MM-DDTHH:mm');
    return value.format(format);
  }
  if (kind === 'time') return value.format(options?.format || (options?.showSeconds ? DEFAULT_TIME_WITH_SECONDS_FORMAT : DEFAULT_TIME_FORMAT));
  return value.format(options?.format || DEFAULT_DATE_FORMAT);
}

function resolvePopupContainer(triggerNode: HTMLElement) {
  return (triggerNode.closest('.ff-antd-form-scope') as HTMLElement | null)
    || triggerNode.parentElement
    || document.body;
}

function resolveDateFormat(showTime?: boolean, explicitFormat?: string) {
  return explicitFormat || (showTime ? DEFAULT_DATETIME_FORMAT : DEFAULT_DATE_FORMAT);
}

function resolveTimeFormat(showSeconds?: boolean, explicitFormat?: string) {
  return explicitFormat || (showSeconds ? DEFAULT_TIME_WITH_SECONDS_FORMAT : DEFAULT_TIME_FORMAT);
}

function toUploadFileList(files: UploadFileValue[]): UploadFile[] {
  return files.map((file, index) => ({
    uid: `${file.name}-${index}`,
    name: file.name,
    status: 'done',
    size: file.size,
    type: file.type,
    url: file.url,
  }));
}

function fromUploadFileList(fileList: UploadFile[]): UploadFileValue[] {
  return fileList.map((file) => ({
    name: file.name,
    size: Number(file.size ?? 0),
    type: String(file.type ?? ''),
    url: typeof file.url === 'string'
      ? file.url
      : file.originFileObj
        ? URL.createObjectURL(file.originFileObj)
        : undefined,
  }));
}

export function FormAntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 16,
          colorPrimary: '#2563eb',
          colorBgContainer: 'rgba(255,255,255,0.94)',
          colorBorder: 'rgba(148,163,184,0.22)',
          colorTextPlaceholder: '#94a3b8',
          colorText: '#172033',
          controlHeight: 42,
          fontSize: 14,
          boxShadow: '0 10px 22px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.85)',
        },
        components: {
          Input: { activeShadow: '0 0 0 3px rgba(37,99,235,0.14)' },
          InputNumber: { activeShadow: '0 0 0 3px rgba(37,99,235,0.14)' },
          Select: { activeOutlineColor: 'rgba(37,99,235,0.14)' },
          DatePicker: { activeShadow: '0 0 0 3px rgba(37,99,235,0.14)' },
        },
      }}
    >
      <div className="ff-antd-form-scope">{children}</div>
    </ConfigProvider>
  );
}

export function AntdTextInput(props: {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  style?: React.CSSProperties;
  autoFocus?: boolean;
  onChange?: (value: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onClick?: React.MouseEventHandler<HTMLInputElement>;
  onBlur?: () => void;
  onFocus?: () => void;
}) {
  return (
    <Input
      className="ff-antd-control"
      value={props.value}
      placeholder={props.placeholder}
      disabled={props.disabled}
      readOnly={props.readOnly}
      style={props.style}
      autoFocus={props.autoFocus}
      onChange={(event) => props.onChange?.(event.target.value)}
      onKeyDown={props.onKeyDown}
      onClick={props.onClick}
      onBlur={props.onBlur}
      onFocus={props.onFocus}
    />
  );
}

export function AntdTextAreaInput(props: {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  rows?: number;
  autoSize?: boolean | { minRows?: number; maxRows?: number };
  style?: React.CSSProperties;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
}) {
  return (
    <TextArea
      className="ff-antd-control ff-antd-textarea"
      value={props.value}
      placeholder={props.placeholder}
      disabled={props.disabled}
      readOnly={props.readOnly}
      rows={props.rows}
      autoSize={props.autoSize}
      style={props.style}
      onChange={(event) => props.onChange?.(event.target.value)}
      onBlur={props.onBlur}
      onFocus={props.onFocus}
    />
  );
}

export function AntdNumberInput(props: {
  value: number | string | null;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  min?: number;
  max?: number;
  step?: number;
  style?: React.CSSProperties;
  onChange?: (value: number | string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
}) {
  return (
    <InputNumber
      className="ff-antd-control ff-antd-number"
      value={props.value === '' ? null : props.value}
      placeholder={props.placeholder}
      disabled={props.disabled}
      readOnly={props.readOnly}
      min={props.min}
      max={props.max}
      step={props.step}
      style={props.style}
      changeOnWheel
      onChange={(value) => props.onChange?.(value == null ? '' : value)}
      onBlur={props.onBlur}
      onFocus={props.onFocus}
    />
  );
}

export function AntdColorInput(props: {
  value: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <ColorPicker
      className="ff-antd-color"
      value={props.value || '#000000'}
      disabled={props.disabled}
      format="hex"
      showText
      onChange={(_, hex) => props.onChange?.(hex)}
    />
  );
}

export function AntdSelectInput(props: {
  value: string | string[] | undefined;
  placeholder?: string;
  disabled?: boolean;
  options: FormOption[];
  multiple?: boolean;
  style?: React.CSSProperties;
  onChange?: (value: string | string[]) => void;
  onBlur?: () => void;
  onFocus?: () => void;
}) {
  return (
    <Select
      className="ff-antd-control ff-antd-select"
      value={props.value}
      placeholder={props.placeholder}
      disabled={props.disabled}
      mode={props.multiple ? 'multiple' : undefined}
      options={props.options}
      style={props.style}
      onChange={(value) => props.onChange?.(value as string | string[])}
      onBlur={props.onBlur}
      onFocus={props.onFocus}
    />
  );
}

export function AntdSegmentedInput(props: {
  value: string;
  disabled?: boolean;
  options: FormOption[];
  block?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <Segmented
      className="ff-antd-control ff-antd-segmented"
      value={props.value}
      disabled={props.disabled}
      options={props.options}
      block={props.block}
      onChange={(value) => props.onChange?.(String(value))}
    />
  );
}

export function AntdRadioInput(props: {
  value: string;
  disabled?: boolean;
  options: FormOption[];
  direction?: 'vertical' | 'horizontal';
  onChange?: (value: string) => void;
}) {
  return (
    <Radio.Group
      className={`ff-antd-radio-group ${props.direction === 'horizontal' ? 'horizontal' : 'vertical'}`}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange?.(String(event.target.value))}
    >
      {props.options.map((option) => <Radio key={option.value} value={option.value}>{option.label}</Radio>)}
    </Radio.Group>
  );
}

export function AntdCheckboxInput(props: {
  value: string[];
  disabled?: boolean;
  options: FormOption[];
  direction?: 'vertical' | 'horizontal';
  onChange?: (value: string[]) => void;
}) {
  return (
    <Checkbox.Group
      className={`ff-antd-checkbox-group ${props.direction === 'horizontal' ? 'horizontal' : 'vertical'}`}
      value={props.value}
      disabled={props.disabled}
      options={props.options}
      onChange={(values) => props.onChange?.(values.map(String))}
    />
  );
}

export function AntdDateInput(props: {
  value: string;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  showTime?: boolean;
  format?: string;
  min?: string;
  max?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
}) {
  const format = resolveDateFormat(props.showTime, props.format);
  const timeFormat = format.includes('ss') ? DEFAULT_TIME_WITH_SECONDS_FORMAT : DEFAULT_TIME_FORMAT;
  return (
    <DatePicker
      className="ff-antd-control ff-antd-picker"
      value={normalizeDayValue(props.value, props.showTime ? 'datetime' : 'date')}
      disabled={props.disabled}
      placeholder={props.placeholder}
      showTime={props.showTime ? { format: timeFormat } : false}
      minDate={normalizeDayValue(props.min, props.showTime ? 'datetime' : 'date') || undefined}
      maxDate={normalizeDayValue(props.max, props.showTime ? 'datetime' : 'date') || undefined}
      style={{ width: '100%' }}
      inputReadOnly={props.readOnly}
      format={format}
      allowClear
      getPopupContainer={resolvePopupContainer}
      onChange={(value) => props.onChange?.(formatDayValue(value, props.showTime ? 'datetime' : 'date', { format }))}
      onBlur={props.onBlur}
      onFocus={props.onFocus}
    />
  );
}

export function AntdTimeInput(props: {
  value: string;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  showSeconds?: boolean;
  format?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
}) {
  const format = resolveTimeFormat(props.showSeconds, props.format);
  return (
    <TimePicker
      className="ff-antd-control ff-antd-picker"
      value={normalizeDayValue(props.value, 'time')}
      disabled={props.disabled}
      placeholder={props.placeholder}
      style={{ width: '100%' }}
      inputReadOnly={props.readOnly}
      format={format}
      allowClear
      needConfirm={false}
      getPopupContainer={resolvePopupContainer}
      onChange={(value) => props.onChange?.(formatDayValue(value, 'time', { showSeconds: props.showSeconds, format }))}
      onBlur={props.onBlur}
      onFocus={props.onFocus}
    />
  );
}

export function AntdDateRangeInput(props: {
  value: { start: string; end: string };
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: [string, string];
  format?: string;
  onChange?: (value: { start: string; end: string }) => void;
  onBlur?: () => void;
  onFocus?: () => void;
}) {
  const format = props.format || DEFAULT_DATE_FORMAT;
  return (
    <RangePicker
      className="ff-antd-control ff-antd-picker ff-antd-range"
      value={[
        normalizeDayValue(props.value.start, 'date'),
        normalizeDayValue(props.value.end, 'date'),
      ]}
      disabled={props.disabled}
      inputReadOnly={props.readOnly}
      placeholder={props.placeholder}
      format={format}
      style={{ width: '100%' }}
      allowClear
      getPopupContainer={resolvePopupContainer}
      onChange={(values) => props.onChange?.({
        start: formatDayValue(values?.[0] || null, 'date', { format }),
        end: formatDayValue(values?.[1] || null, 'date', { format }),
      })}
      onBlur={props.onBlur}
      onFocus={props.onFocus}
    />
  );
}

export function AntdSwitchInput(props: {
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return <Switch className="ff-antd-switch" checked={props.checked} disabled={props.disabled} onChange={props.onChange} />;
}

export function AntdRateInput(props: {
  value: number;
  disabled?: boolean;
  count?: number;
  onChange?: (value: number) => void;
}) {
  return <Rate className="ff-antd-rate" value={props.value} disabled={props.disabled} count={props.count} onChange={props.onChange} />;
}

export function AntdTagInput(props: {
  value: string[];
  disabled?: boolean;
  placeholder?: string;
  onChange?: (value: string[]) => void;
  onBlur?: () => void;
  onFocus?: () => void;
}) {
  return (
    <Select
      className="ff-antd-control ff-antd-select"
      mode="tags"
      value={props.value}
      disabled={props.disabled}
      placeholder={props.placeholder}
      style={{ width: '100%' }}
      tokenSeparators={[',']}
      open={false}
      onChange={(value) => props.onChange?.(value.map(String))}
      onBlur={props.onBlur}
      onFocus={props.onFocus}
    />
  );
}

export function AntdUploadInput(props: {
  files: UploadFileValue[];
  disabled?: boolean;
  imageOnly?: boolean;
  onChange?: (files: UploadFileValue[]) => void;
}) {
  return (
    <Upload.Dragger
      className="ff-antd-upload"
      disabled={props.disabled}
      accept={props.imageOnly ? 'image/*' : undefined}
      multiple={!props.imageOnly}
      fileList={toUploadFileList(props.files)}
      beforeUpload={() => false}
      listType={props.imageOnly ? 'picture-card' : 'text'}
      onChange={({ fileList }) => props.onChange?.(fromUploadFileList(fileList))}
    >
      <p className="ant-upload-text">{props.imageOnly ? '点击或拖拽上传图片' : '点击或拖拽上传文件'}</p>
      <p className="ant-upload-hint">{props.imageOnly ? '支持预览缩略图' : '仅保存前端元信息'}</p>
    </Upload.Dragger>
  );
}

export function AntdActionButton(props: {
  label: string;
  disabled?: boolean;
  variant?: 'solid' | 'outline' | 'ghost';
  onClick?: () => void;
}) {
  return (
    <Button
      className="ff-antd-button"
      type={props.variant === 'outline' ? 'default' : 'primary'}
      ghost={props.variant === 'ghost'}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  );
}
