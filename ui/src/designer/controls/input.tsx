import React from 'react';
import { registerControl } from '../registry';
import type { DesignComponent } from '../../project/types';
import { controlText, ios, requiredMark } from './styles';
import type { PreviewControlRuntime } from '../types';
import {
  AntdActionButton,
  AntdDateInput,
  AntdDateRangeInput,
  AntdNumberInput,
  AntdRateInput,
  AntdSwitchInput,
  AntdTagInput,
  AntdTextAreaInput,
  AntdTextInput,
  AntdTimeInput,
  AntdUploadInput,
  FormAntdProvider,
} from '../../components/AntdFormControls';
import { normalizeDateTimeValue } from '../../services/config/controlTypes';

const renderLabel = (label: string, required?: boolean) => (
  <>
    {label}
    {required && <span style={requiredMark}>*</span>}
  </>
);

const withAntdField = (content: React.ReactNode) => <FormAntdProvider>{content}</FormAntdProvider>;

function normalizeFileList(value: unknown) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object').map((item) => {
    const record = item as Record<string, unknown>;
    return {
      name: String(record.name ?? '未命名文件'),
      size: Number(record.size ?? 0),
      type: String(record.type ?? ''),
      url: typeof record.url === 'string' ? record.url : '',
    };
  }) : [];
}

function TagInputPreview({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) {
  const tags = Array.isArray(runtime?.value) ? runtime.value.map(String) : [];
  return withAntdField(
    <div style={ios.field}>
      <label style={ios.label}>{renderLabel(component.props.label || '标签', component.props.required)}</label>
      <AntdTagInput
        value={tags}
        placeholder={component.props.placeholder || '输入后回车'}
        disabled={mode !== 'preview' || !!component.props.disabled}
        onChange={(next) => runtime?.emit('onChange', next)}
        onBlur={() => runtime?.emit('onBlur')}
        onFocus={() => runtime?.emit('onFocus')}
      />
    </div>
  );
}

function UploadPreview({ component, mode, runtime, imageOnly = false }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime; imageOnly?: boolean }) {
  const files = normalizeFileList(runtime?.value);
  return withAntdField(
    <div style={ios.field}>
      <label style={ios.label}>{renderLabel(component.props.label || (imageOnly ? '图片上传' : '文件上传'), component.props.required)}</label>
      <AntdUploadInput
        files={files}
        imageOnly={imageOnly}
        constraints={{
          accept: String(component.props.accept || (imageOnly ? 'image/*' : '')),
          maxFileSizeMb: Number(component.props.maxFileSizeMb || 0),
          maxCount: Number(component.props.maxCount || 0),
          minImageWidth: Number(component.props.minImageWidth || 0), maxImageWidth: Number(component.props.maxImageWidth || 0),
          minImageHeight: Number(component.props.minImageHeight || 0), maxImageHeight: Number(component.props.maxImageHeight || 0),
        }}
        disabled={mode !== 'preview' || !!component.props.disabled}
        onChange={(next) => runtime?.emit('onChange', next)}
      />
    </div>
  );
}

function DatePickerPreview({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) {
  const isDateTime = !!component.props.showTime;
  const value = normalizeDateTimeValue(runtime?.value, isDateTime ? 'datetime' : 'date');
  return withAntdField(
    <div style={ios.field}>
      <label style={ios.label}>{renderLabel(component.props.label || '日期', component.props.required)}</label>
      <AntdDateInput
        value={value}
        placeholder={component.props.placeholder || (isDateTime ? '选择日期时间' : '选择日期')}
        showTime={isDateTime}
        format={String(component.props.format || (isDateTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'))}
        readOnly={!!component.props.readonly}
        disabled={mode !== 'preview' || !!component.props.disabled}
        min={normalizeDateTimeValue(component.props.minDate, isDateTime ? 'datetime' : 'date') || undefined}
        max={normalizeDateTimeValue(component.props.maxDate, isDateTime ? 'datetime' : 'date') || undefined}
        onChange={(next) => runtime?.emit('onChange', next)}
        onBlur={() => runtime?.emit('onBlur')}
        onFocus={() => runtime?.emit('onFocus')}
      />
    </div>
  );
}

registerControl({
  type: 'input', label: '文本输入', category: 'basic', icon: '✏️',
  defaultProps: {
    label: 'Label', placeholder: '请输入', name: '', required: false, readonly: false, disabled: false,
    fontSize: 15, fontWeight: '400', color: '#1c1c1e', textAlign: 'left',
    minLength: 0, maxLength: 0, pattern: '', patternMessage: '',
    validator: 'none', customMessage: '', validationRules: [],
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name', help: '可选择已有字段，也可直接输入新的字段名。' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '只读', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { key: 'validator', label: '校验器', type: 'select', group: '校验', options: [
      { label: '无', value: 'none' }, { label: '邮箱', value: 'email' }, { label: '手机号', value: 'phone' },
      { label: 'URL', value: 'url' }, { label: '身份证', value: 'idcard' }, { label: '自定义正则', value: 'pattern' },
    ]},
    { key: 'pattern', label: '正则表达式', type: 'string', editor: 'regex', group: '校验', placeholder: '^\\d+$', visibleWhen: { key: 'validator', value: 'pattern' }, help: '提供范例、语法检查和隔离 Worker 测试。', assistantCapability: { capability: 'regex.generate-or-repair', contextKeys: ['label', 'placeholder'], resultType: 'value' } },
    { key: 'patternMessage', label: '校验提示', type: 'string', group: '校验', placeholder: '格式不正确' },
    { key: 'minLength', label: '最小长度', type: 'number', group: '校验', min: 0 },
    { key: 'maxLength', label: '最大长度', type: 'number', group: '校验', min: 0 },
    { key: 'customMessage', label: '自定义错误提示', type: 'string', group: '校验' },
    { key: 'validationRules', label: '组合校验规则', type: 'json', editor: 'validation-rules', group: '校验', help: '可组合必填、范围、格式与跨字段比较规则，并按顺序执行。' },
    { kind: 'composite', key: 'typography', keys: ['fontFamily', 'fontSize', 'fontWeight', 'color', 'lineHeight', 'letterSpacing', 'textAlign'], label: '字体与排版', editor: 'typography', group: '文本样式', help: '集中配置字体、字号、字重、颜色、行高、字间距与对齐。' },
    { key: 'valueExpression', label: '计算值', type: 'string', editor: 'expression', group: '表达式', help: '值变化时使用受限 DSL 重新计算。', assistantCapability: { capability: 'expression.generate-or-repair', contextKeys: ['name', 'label'], resultType: 'value' } },
    { key: 'visibleExpression', label: '可见条件', type: 'string', editor: 'expression', group: '表达式' },
    { key: 'disabledExpression', label: '禁用条件', type: 'string', editor: 'expression', group: '表达式' },
    { key: 'requiredExpression', label: '必填条件', type: 'string', editor: 'expression', group: '表达式' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 240, h: 72 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => withAntdField(
    <div style={ios.field}>
      <label style={ios.label}>{renderLabel(component.props.label || 'Label', component.props.required)}</label>
      <AntdTextInput
        value={String(runtime?.value ?? '')}
        placeholder={component.props.placeholder || ''}
        readOnly={!!component.props.readonly}
        disabled={mode !== 'preview' || !!component.props.disabled}
        style={{ fontFamily: component.props.fontFamily || undefined, fontSize: component.props.fontSize || 14, fontWeight: component.props.fontWeight || '400', color: component.props.color || '#1c1c1e', lineHeight: component.props.lineHeight || undefined, letterSpacing: `${Number(component.props.letterSpacing) || 0}px`, textAlign: component.props.textAlign || 'left' }}
        onChange={(next) => runtime?.emit('onChange', next)}
        onBlur={() => runtime?.emit('onBlur')}
        onFocus={() => runtime?.emit('onFocus')}
      />
    </div>
  ),
});

registerControl({
  type: 'textarea', label: '多行文本', category: 'basic', icon: '📝',
  defaultProps: {
    label: 'Label', placeholder: '请输入', name: '', rows: 3, required: false, readonly: false, disabled: false,
    maxLength: 0, showCount: false, autoResize: false,
    fontSize: 15, fontWeight: '400', color: '#1c1c1e', lineHeight: 1.5,
    minLength: 0, pattern: '', patternMessage: '', customMessage: '', validationRules: [],
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'rows', label: '行数', type: 'number', group: '基础', min: 1, max: 20 },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '只读', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { key: 'maxLength', label: '最大字数', type: 'number', group: '校验', min: 0 },
    { key: 'showCount', label: '显示字数统计', type: 'boolean', group: '校验' },
    { key: 'autoResize', label: '自动调整高度', type: 'boolean', group: '高级', level: 'advanced' },
    { key: 'minLength', label: '最小长度', type: 'number', group: '校验', min: 0 },
    { key: 'pattern', label: '正则校验', type: 'string', editor: 'regex', group: '校验' },
    { key: 'customMessage', label: '自定义错误提示', type: 'string', group: '校验' },
    { key: 'validationRules', label: '组合校验规则', type: 'json', editor: 'validation-rules', group: '校验' },
    { key: 'fontSize', label: '字号', type: 'number', group: '文本样式', min: 10, max: 48 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '文本样式', options: [
      { label: '细体', value: '300' }, { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '粗体', value: '700' },
    ]},
    { key: 'color', label: '文字颜色', type: 'color', group: '文本样式' },
    { key: 'lineHeight', label: '行高', type: 'number', group: '文本样式', min: 1, max: 3, step: 0.1 },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 280, h: 132 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => withAntdField(
    <div style={ios.field}>
      <label style={ios.label}>{renderLabel(component.props.label || 'Label', component.props.required)}</label>
      <AntdTextAreaInput
        value={String(runtime?.value ?? '')}
        placeholder={component.props.placeholder || ''}
        readOnly={!!component.props.readonly}
        disabled={mode !== 'preview' || !!component.props.disabled}
        rows={Number(component.props.rows) || 3}
        autoSize={component.props.autoResize ? { minRows: Number(component.props.rows) || 3, maxRows: 8 } : false}
        maxLength={Number(component.props.maxLength) || undefined}
        showCount={!!component.props.showCount}
        style={{ fontSize: component.props.fontSize || 14, fontWeight: component.props.fontWeight || '400', color: component.props.color || '#1c1c1e', lineHeight: component.props.lineHeight || 1.5 }}
        onChange={(next) => runtime?.emit('onChange', next)}
        onBlur={() => runtime?.emit('onBlur')}
        onFocus={() => runtime?.emit('onFocus')}
      />
    </div>
  ),
});

registerControl({
  type: 'number', label: '数字输入', category: 'basic', icon: '🔢',
  defaultProps: {
    label: 'Label', placeholder: '0', name: '', required: false, readonly: false, disabled: false,
    min: 0, max: 100, step: 1, precision: 0, prefix: '', suffix: '',
    fontSize: 15, fontWeight: '400', color: '#1c1c1e', textAlign: 'left',
    integer: false, positive: false, customMessage: '',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '只读', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { key: 'integer', label: '仅整数', type: 'boolean', group: '校验' },
    { key: 'positive', label: '仅正数', type: 'boolean', group: '校验' },
    { key: 'customMessage', label: '自定义错误提示', type: 'string', group: '校验' },
    { kind: 'composite', key: 'numberRange', keys: ['min', 'max'], label: '数值范围', editor: 'number-range', group: '数值范围' },
    { key: 'step', label: '步长', type: 'number', group: '数值范围', min: 0 },
    { key: 'precision', label: '小数位数', type: 'number', group: '数值范围', min: 0, max: 10 },
    { key: 'prefix', label: '前缀', type: 'string', group: '数值范围', placeholder: '¥' },
    { key: 'suffix', label: '后缀', type: 'string', group: '数值范围', placeholder: '元' },
    { key: 'fontSize', label: '字号', type: 'number', group: '文本样式', min: 10, max: 48 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '文本样式', options: [
      { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '粗体', value: '700' },
    ]},
    { key: 'color', label: '文字颜色', type: 'color', group: '文本样式' },
    { key: 'textAlign', label: '对齐', type: 'select', group: '文本样式', options: [
      { label: '左对齐', value: 'left' }, { label: '居中', value: 'center' }, { label: '右对齐', value: 'right' },
    ]},
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 220, h: 72 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => withAntdField(
    <div style={ios.field}>
      <label style={ios.label}>{renderLabel(component.props.label || 'Label', component.props.required)}</label>
      <AntdNumberInput
        value={runtime?.value === '' ? '' : Number(runtime?.value ?? '')}
        placeholder={component.props.placeholder || ''}
        readOnly={!!component.props.readonly}
        disabled={mode !== 'preview' || !!component.props.disabled}
        min={component.props.min}
        max={component.props.max}
        step={component.props.step}
        precision={Number.isFinite(Number(component.props.precision)) ? Number(component.props.precision) : undefined}
        prefix={component.props.prefix || undefined}
        suffix={component.props.suffix || undefined}
        style={{ fontSize: component.props.fontSize || 14, fontWeight: component.props.fontWeight || '400', color: component.props.color || '#1c1c1e', textAlign: component.props.textAlign || 'left', width: '100%' }}
        onChange={(next) => runtime?.emit('onChange', next === '' ? '' : Number(next))}
        onBlur={() => runtime?.emit('onBlur')}
        onFocus={() => runtime?.emit('onFocus')}
      />
    </div>
  ),
});

registerControl({
  type: 'datePicker', label: '日期选择', category: 'basic', icon: '📅',
  defaultProps: {
    label: '日期', name: '', placeholder: '选择日期', required: false, readonly: false, disabled: false,
    format: 'YYYY-MM-DD', minDate: '', maxDate: '', showTime: false,
    fontSize: 15, fontWeight: '400', color: '#1c1c1e',
    customMessage: '',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '只读', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { kind: 'composite', key: 'dateRange', keys: ['minDate', 'maxDate'], label: '日期范围', editor: 'date-range', group: '校验' },
    { key: 'customMessage', label: '自定义错误提示', type: 'string', group: '校验' },
    { key: 'format', label: '日期格式', type: 'select', group: '样式', options: [
      { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' }, { label: 'YYYY/MM/DD', value: 'YYYY/MM/DD' },
      { label: 'DD/MM/YYYY', value: 'DD/MM/YYYY' }, { label: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
      { label: 'YYYY年MM月DD日', value: 'YYYY年MM月DD日' },
      { label: 'YYYY-MM-DD HH:mm', value: 'YYYY-MM-DD HH:mm' },
      { label: 'YYYY-MM-DD HH:mm:ss', value: 'YYYY-MM-DD HH:mm:ss' },
    ]},
    { key: 'showTime', label: '显示时间', type: 'boolean', group: '样式' },
    { key: 'fontSize', label: '字号', type: 'number', group: '样式', min: 10, max: 48 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '样式', options: [
      { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '粗体', value: '700' },
    ]},
    { key: 'color', label: '文字颜色', type: 'color', group: '样式' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 220, h: 72 },
  render: DatePickerPreview,
});

registerControl({
  type: 'timePicker', label: '时间选择', category: 'basic', icon: '⏰',
  defaultProps: {
    label: '时间', name: '', placeholder: '选择时间', required: false, readonly: false, disabled: false,
    showSeconds: false, format: 'HH:mm', rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '只读', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { key: 'showSeconds', label: '显示秒', type: 'boolean', group: '样式' },
    { key: 'format', label: '时间格式', type: 'select', group: '样式', options: [
      { label: 'HH:mm', value: 'HH:mm' },
      { label: 'HH:mm:ss', value: 'HH:mm:ss' },
    ]},
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 220, h: 72 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => withAntdField(
    <div style={ios.field}>
      <label style={ios.label}>{renderLabel(component.props.label || '时间', component.props.required)}</label>
      <AntdTimeInput
        value={normalizeDateTimeValue(runtime?.value, 'time')}
        readOnly={!!component.props.readonly}
        placeholder={component.props.placeholder || '选择时间'}
        disabled={mode !== 'preview' || !!component.props.disabled}
        format={component.props.format || (component.props.showSeconds ? 'HH:mm:ss' : 'HH:mm')}
        showSeconds={!!component.props.showSeconds}
        onChange={(next) => runtime?.emit('onChange', next)}
        onBlur={() => runtime?.emit('onBlur')}
        onFocus={() => runtime?.emit('onFocus')}
      />
    </div>
  ),
});

registerControl({
  type: 'dateRange', label: '日期范围', category: 'basic', icon: '🗓️',
  defaultProps: {
    label: '日期范围', name: '', required: false, readonly: false, disabled: false,
    format: 'YYYY-MM-DD', startPlaceholder: '开始日期', endPlaceholder: '结束日期',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '只读', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { key: 'startPlaceholder', label: '开始占位符', type: 'string', group: '基础' },
    { key: 'endPlaceholder', label: '结束占位符', type: 'string', group: '基础' },
    { key: 'format', label: '日期格式', type: 'select', group: '样式', options: [
      { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
      { label: 'YYYY/MM/DD', value: 'YYYY/MM/DD' },
      { label: 'YYYY年MM月DD日', value: 'YYYY年MM月DD日' },
    ]},
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 280, h: 72 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const rangeValue = runtime?.value && typeof runtime.value === 'object' ? runtime.value as Record<string, unknown> : {};
    return withAntdField(
      <div style={ios.field}>
        <label style={ios.label}>{renderLabel(component.props.label || '日期范围', component.props.required)}</label>
        <AntdDateRangeInput
          value={{ start: normalizeDateTimeValue(rangeValue.start, 'date'), end: normalizeDateTimeValue(rangeValue.end, 'date') }}
          readOnly={!!component.props.readonly}
          disabled={mode !== 'preview' || !!component.props.disabled}
          placeholder={[String(component.props.startPlaceholder || '开始日期'), String(component.props.endPlaceholder || '结束日期')]}
          format={String(component.props.format || 'YYYY-MM-DD')}
          onChange={(next) => runtime?.emit('onChange', next)}
          onBlur={() => runtime?.emit('onBlur')}
          onFocus={() => runtime?.emit('onFocus')}
        />
      </div>
    );
  },
});

registerControl({
  type: 'switch', label: '开关', category: 'basic', icon: '🔘',
  defaultProps: {
    label: '启用', name: '', disabled: false, defaultValue: true,
    size: 'default', activeColor: '#34c759', inactiveColor: 'rgba(118,118,128,0.18)',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '基础' },
    { key: 'defaultValue', label: '默认开启', type: 'boolean', group: '基础' },
    { key: 'size', label: '尺寸', type: 'select', group: '样式', options: [
      { label: '小', value: 'small' }, { label: '默认', value: 'default' }, { label: '大', value: 'large' },
    ]},
    { key: 'activeColor', label: '开启颜色', type: 'color', group: '样式' },
    { key: 'inactiveColor', label: '关闭颜色', type: 'color', group: '样式' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }],
  defaultSize: { w: 180, h: 52 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const checked = runtime ? !!runtime.value : component.props.defaultValue !== false;
    return withAntdField(
      <div style={{ ...ios.naturalPanel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', gap: 10 }}>
        <span style={ios.label}>{component.props.label || '启用'}</span>
        <AntdSwitchInput
          checked={checked}
          disabled={mode !== 'preview' || !!component.props.disabled}
          size={component.props.size || 'default'}
          activeColor={component.props.activeColor}
          inactiveColor={component.props.inactiveColor}
          onChange={(next) => runtime?.emit('onChange', next)}
        />
      </div>
    );
  },
});

registerControl({
  type: 'rating', label: '评分', category: 'basic', icon: '⭐',
  defaultProps: {
    label: '评分', name: '', max: 5, defaultValue: 3, disabled: false, required: false,
    size: 'default', activeColor: '#ff9500', inactiveColor: '#e5e5ea', allowHalf: false, showText: false,
    customMessage: '',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'max', label: '最大值', type: 'number', group: '基础', min: 1, max: 10 },
    { key: 'defaultValue', label: '默认值', type: 'number', group: '基础', min: 0 },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'customMessage', label: '自定义错误提示', type: 'string', group: '校验' },
    { key: 'size', label: '尺寸', type: 'select', group: '样式', options: [
      { label: '小', value: 'small' }, { label: '默认', value: 'default' }, { label: '大', value: 'large' },
    ]},
    { key: 'activeColor', label: '激活颜色', type: 'color', group: '样式' },
    { key: 'inactiveColor', label: '未激活颜色', type: 'color', group: '样式' },
    { key: 'allowHalf', label: '允许半星', type: 'boolean', group: '样式' },
    { key: 'showText', label: '显示分值', type: 'boolean', group: '样式' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }],
  defaultSize: { w: 220, h: 52 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const max = component.props.max || 5;
    const val = Number(runtime?.value ?? component.props.defaultValue ?? 0);
    return withAntdField(
      <div style={{ ...ios.naturalPanel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', gap: 8 }}>
        <span style={ios.label}>{renderLabel(component.props.label || '评分', component.props.required)}</span>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0, alignItems: 'center' }}>
          <AntdRateInput
            count={max}
            value={val}
            disabled={mode !== 'preview' || !!component.props.disabled}
            size={component.props.size || 'default'}
            color={component.props.activeColor}
            inactiveColor={component.props.inactiveColor}
            allowHalf={!!component.props.allowHalf}
            onChange={(next) => runtime?.emit('onChange', next)}
          />
          {component.props.showText && <span style={{ fontSize: 12, color: '#8e8e93', marginLeft: 4 }}>{val}/{max}</span>}
        </div>
      </div>
    );
  },
});

registerControl({
  type: 'tagInput', label: '标签输入', category: 'basic', icon: '🏷️',
  defaultProps: {
    label: '标签', name: '', placeholder: '输入后回车', required: false, disabled: false, rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 280, h: 84 },
  render: TagInputPreview,
});

registerControl({
  type: 'upload', label: '文件上传', category: 'basic', icon: '📎',
  defaultProps: {
    label: '文件上传', name: '', placeholder: '点击选择文件', required: false, disabled: false,
    accept: '', maxFileSizeMb: 0, maxCount: 0, rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { kind: 'composite', key: 'uploadConstraints', keys: ['accept', 'maxFileSizeMb', 'maxCount'], label: '上传限制', editor: 'upload-constraints', group: '校验' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '文件改变时触发' }],
  defaultSize: { w: 280, h: 112 },
  render: ({ component, mode, runtime }) => <UploadPreview component={component} mode={mode} runtime={runtime} />,
});

registerControl({
  type: 'imageUpload', label: '图片上传', category: 'basic', icon: '🖼️',
  defaultProps: {
    label: '图片上传', name: '', placeholder: '点击选择图片', required: false, disabled: false,
    accept: 'image/*', maxFileSizeMb: 0, maxCount: 1, minImageWidth: 0, maxImageWidth: 0, minImageHeight: 0, maxImageHeight: 0, rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { kind: 'composite', key: 'uploadConstraints', keys: ['accept', 'maxFileSizeMb', 'maxCount', 'minImageWidth', 'maxImageWidth', 'minImageHeight', 'maxImageHeight'], label: '上传与尺寸限制', editor: 'upload-constraints', group: '校验' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '图片改变时触发' }],
  defaultSize: { w: 280, h: 144 },
  render: ({ component, mode, runtime }) => <UploadPreview component={component} mode={mode} runtime={runtime} imageOnly />,
});

registerControl({
  type: 'button', label: '按钮', category: 'basic', icon: '🔲',
  defaultProps: {
    label: '提交', name: '', variant: 'primary', disabled: false, loading: false, icon: '',
    fontSize: 16, fontWeight: '650', color: '#ffffff', backgroundColor: '',
    borderRadius: 10, fullWidth: false,
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '文本', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'btn_submit' },
    { key: 'variant', label: '样式', type: 'select', group: '基础', options: [
      { label: '主要', value: 'primary' }, { label: '默认', value: 'default' },
      { label: '危险', value: 'danger' }, { label: '幽灵', value: 'ghost' },
    ]},
    { key: 'disabled', label: '禁用', type: 'boolean', group: '基础' },
    { key: 'loading', label: '加载中', type: 'boolean', group: '基础' },
    { key: 'icon', label: '图标', type: 'string', editor: 'icon', group: '基础', placeholder: '🚀', help: '兼容现有 emoji，也可输入图标字符。' },
    { key: 'fontSize', label: '字号', type: 'number', group: '样式', min: 10, max: 32 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '样式', options: [
      { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '半粗', value: '600' }, { label: '粗体', value: '700' },
    ]},
    { key: 'color', label: '文字颜色', type: 'color', group: '样式' },
    { key: 'backgroundColor', label: '自定义背景色', type: 'color', group: '样式' },
    { key: 'borderRadius', label: '圆角', type: 'number', editor: 'radius', group: '样式', min: 0, max: 50 },
    { key: 'fullWidth', label: '满宽', type: 'boolean', group: '样式' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onClick', label: '点击', description: '按钮点击时触发' }],
  defaultSize: { w: 180, h: 48 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const p = component.props;
    const isPrimary = p.variant === 'primary';
    const isDanger = p.variant === 'danger';
    const isGhost = p.variant === 'ghost';
    const bg = p.backgroundColor || (isPrimary ? '#007aff' : isDanger ? '#ff3b30' : isGhost ? 'transparent' : 'rgba(118,118,128,0.10)');
    const textColor = p.color || (isPrimary || isDanger ? '#fff' : isGhost ? '#007aff' : '#007aff');
    return withAntdField(
      <div style={{ width: '100%', height: '100%', minWidth: 0, display: 'flex', alignItems: 'flex-start', boxSizing: 'border-box', padding: 4 }}>
        <div style={{ width: p.fullWidth ? '100%' : 'auto' }}>
          <AntdActionButton
            label={`${p.icon ? `${p.icon} ` : ''}${p.loading ? '加载中...' : (p.label || '按钮')}`}
            disabled={!!p.disabled || !!p.loading}
            variant={p.variant === 'ghost' ? 'ghost' : p.variant === 'default' ? 'outline' : 'solid'}
            danger={isDanger}
            block={!!p.fullWidth}
            style={{ fontSize: Number(p.fontSize) || 16, fontWeight: p.fontWeight || 650, color: textColor, background: bg, borderRadius: Number(p.borderRadius) || 0 }}
            onClick={() => runtime?.emit('onClick')}
          />
        </div>
      </div>
    );
  },
});
