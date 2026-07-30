import React, { useState } from 'react';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { registerControl } from '../registry';
import type { DesignComponent } from '../../project/types';
import { controlText, ios, requiredMark } from './styles';
import type { PreviewControlRuntime } from '../types';
import {
  describeDateConstraints,
  describeDateDefaultSource,
  resolveDateConstraintState,
} from '../../services/data/dateConvenience';
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
import { SINGLE_LINE_FIELD_HEIGHT } from './geometry';

dayjs.extend(isoWeek);

const renderLabel = (label: string, required?: boolean) => (
  <>
    {label}
    {required && <span style={requiredMark}>*</span>}
  </>
);
const BUTTON_ICONS: Record<string, string> = { check: '✓', add: '＋', edit: '✎', search: '🔍', attach: '📎', image: '🖼️', settings: '⚙️', chart: '📊', open: '↗' };

const withAntdField = (content: React.ReactNode) => <FormAntdProvider>{content}</FormAntdProvider>;

function normalizeFileList(value: unknown) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object').map((item) => {
    const record = item as Record<string, unknown>;
    return {
      name: String(record.name ?? '未命名文件'),
      size: Number(record.size ?? 0),
      type: String(record.type ?? ''),
      url: typeof record.url === 'string' ? record.url : '',
      status: (record.status === 'error' ? 'error' : record.status === 'uploading' ? 'uploading' : 'done') as 'error' | 'uploading' | 'done',
      error: typeof record.error === 'string' ? record.error : '',
    };
  }) : [];
}

function describeRangeBinding(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const source = record.source && typeof record.source === 'object' ? record.source as Record<string, unknown> : record;
  const start = String(source.startField || source.start || source.startPath || '').trim();
  const end = String(source.endField || source.end || source.endPath || '').trim();
  return start || end ? `开始字段：${start || '未绑定'} · 结束字段：${end || '未绑定'}` : '';
}

function TagInputPreview({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) {
  const tags = Array.isArray(runtime?.value) ? runtime.value.map(String) : [];
  const [invalidTag, setInvalidTag] = useState('');
  const maxTags = Number(component.props.maxTags || 0);
  const maxTagLength = Number(component.props.maxTagLength || 0);
  const normalizeTags = (next: string[]) => {
    const unique = component.props.allowDuplicates ? next : next.filter((tag, index, list) => list.indexOf(tag) === index);
    return (maxTags > 0 ? unique.slice(0, maxTags) : unique).map((tag) => maxTagLength > 0 ? tag.slice(0, maxTagLength) : tag);
  };
  return withAntdField(
    <div style={ios.field}>
      <label style={ios.label}>{renderLabel(component.props.label || '标签', component.props.required)}</label>
      <AntdTagInput
        value={tags}
        placeholder={component.props.placeholder || '输入后回车'}
        disabled={!!component.props.disabled}
        onChange={(next) => { const trimmed = next.map((tag) => tag.trim()); const candidate = trimmed.find((tag) => maxTagLength > 0 && tag.length > maxTagLength) || (maxTags > 0 && trimmed.length > maxTags ? trimmed[maxTags] : ''); setInvalidTag(candidate || ''); runtime?.emit('onChange', candidate ? trimmed : normalizeTags(trimmed)); }}
        onBlur={() => runtime?.emit('onBlur')}
        onFocus={() => runtime?.emit('onFocus')}
      />
      {invalidTag && <div role="alert" className="designer-field-hint designer-field-hint-error">{'⚠️ 标签"'}{invalidTag}{'"超出限制，已保留原文；请缩短或移除后再提交。'}</div>}
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
        imageRotate={imageOnly ? Number(component.props.imageRotate || 0) : undefined}
        constraints={{
          accept: String(component.props.accept || (imageOnly ? 'image/*' : '')),
          maxFileSizeMb: Number(component.props.maxFileSizeMb || 0),
          maxCount: Number(component.props.maxCount || 0),
          minImageWidth: Number(component.props.minImageWidth || 0), maxImageWidth: Number(component.props.maxImageWidth || 0),
          minImageHeight: Number(component.props.minImageHeight || 0), maxImageHeight: Number(component.props.maxImageHeight || 0),
        }}
        disabled={!!component.props.disabled}
        onChange={(next) => runtime?.emit('onChange', next)}
      />
      {files.length > 0 && <div role="status" className="designer-upload-status">{files.map((file) => <span key={file.name} className={file.status === 'error' ? 'error' : ''}>{file.status === 'error' ? `⚠️ 上传失败：${file.name}，请移除后重试` : `已选择：${file.name}`}</span>)}</div>}
      {files.some((file) => file.status === 'error' || file.status === 'uploading') && <div className="designer-upload-actions">{files.filter((file) => file.status === 'error' || file.status === 'uploading').map((file) => file.status === 'error' ? <button key={`${file.name}-retry`} type="button" onClick={() => runtime?.emit('onChange', files.map((item) => item.name === file.name ? { ...item, status: 'done', error: undefined } : item))}>重试 {file.name}</button> : <button key={`${file.name}-cancel`} type="button" onClick={() => runtime?.emit('onChange', files.filter((item) => item.name !== file.name))}>取消 {file.name}</button>)}</div>}
      {imageOnly && (component.props.alt || component.props.privacyHint) && <small className="designer-field-hint">{component.props.alt ? `图片说明：${component.props.alt}` : ''}{component.props.alt && component.props.privacyHint ? ' · ' : ''}{component.props.privacyHint || ''}</small>}
    </div>
  );
}

function DatePickerPreview({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) {
  const isDateTime = !!component.props.showTime;
  const value = normalizeDateTimeValue(runtime?.value, isDateTime ? 'datetime' : 'date');
  const constraintState = resolveDateConstraintState(
    component.props.constraintConfig,
    runtime?.values || {},
    isDateTime ? 'datetime' : 'date',
    component.props.businessDayConfig,
    { minDate: component.props.minDate, maxDate: component.props.maxDate },
  );
  return withAntdField(
    <div style={ios.field}>
      <label style={ios.label}>{renderLabel(component.props.label || '日期', component.props.required)}</label>
      <AntdDateInput
        value={value}
        placeholder={component.props.placeholder || (isDateTime ? '选择日期时间' : '选择日期')}
        showTime={isDateTime}
        format={String(component.props.displayFormat || (component.props.displayPreset === 'chinese' ? 'YYYY年MM月DD日' : component.props.displayPreset === 'datetime' ? 'YYYY-MM-DD HH:mm' : component.props.format || (isDateTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD')))}
        readOnly={!!component.props.readonly}
        disabled={!!component.props.disabled}
        min={constraintState.min}
        max={constraintState.max}
        disableWeekends={constraintState.weekdaysOnly}
        onChange={(next) => runtime?.emit('onChange', next)}
        onBlur={() => runtime?.emit('onBlur')}
        onFocus={() => runtime?.emit('onFocus')}
      />
      {!component.props.readonly && !component.props.disabled && <div className="designer-date-quick-actions" aria-label="日期快捷操作"><button type="button" onClick={() => runtime?.emit('onChange', dayjs().format(isDateTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'))}>今天</button><button type="button" onClick={() => runtime?.emit('onChange', '')}>清空</button></div>}
      {mode === 'preview' && (
        <div className="designer-preview-option-meta">
          <span>{describeDateDefaultSource(component.props.defaultValueConfig)}</span>
          <span>{describeDateConstraints(constraintState).join('；') || '无额外限制'}</span>
        </div>
      )}
    </div>
  );
}

registerControl({
  type: 'input', label: '文本输入', category: 'basic', icon: 'input',
  defaultProps: {
    label: 'Label', placeholder: '请输入', name: '', required: false, readonly: false, disabled: false,
    fontFamily: '', fontSize: 16, fontWeight: '400', color: '#1c1c1e', lineHeight: 1.5, letterSpacing: 0, textAlign: 'left',
    minLength: 0, maxLength: 0, pattern: '', patternMessage: '格式不正确',
    inputKind: 'text', codeTemplate: '', validator: 'none', customMessage: '输入内容不符合要求', validationRules: [], selectOnFocus: false, allowClear: true, trimWhitespace: true, textTransform: 'none', rememberLastInput: false,
    valueExpression: '', visibleExpression: '', disabledExpression: '', requiredExpression: '',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name', help: '可选择已有字段，也可直接输入新的字段名。' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '允许编辑', type: 'boolean', group: '校验', help: '关闭后保留内容但不可修改。' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '校验', help: '关闭后字段不可操作，也不会参与填写。' },
    { key: 'inputKind', label: '输入类型', type: 'select', group: '基础', help: '选择常见类型会自动生成校验和键盘提示。', options: [
      { label: '普通文本', value: 'text' }, { label: '邮箱', value: 'email' }, { label: '手机号', value: 'phone' }, { label: '身份证号', value: 'idcard' }, { label: '网址', value: 'url' }, { label: '编号（自定义）', value: 'code' },
    ]},
    { key: 'codeTemplate', label: '编号模板', type: 'string', group: '便利填写', visibleWhen: { key: 'inputKind', value: 'code' }, placeholder: '如：INV-{yyyyMM}-{n:4}', help: '使用日期与序号占位符生成示例；模板只影响提示，不会覆盖用户已有值。' },
    { key: 'selectOnFocus', label: '聚焦时全选', type: 'boolean', group: '便利填写', help: '适合编号、查询条件等经常整体替换的字段。' },
    { key: 'allowClear', label: '显示清除按钮', type: 'boolean', group: '便利填写', help: '允许一键清空当前内容。' },
    { key: 'trimWhitespace', label: '自动去除首尾空格', type: 'boolean', group: '便利填写', help: '粘贴或失焦时清理首尾空格，不改变中间空格。' },
    { key: 'textTransform', label: '字母格式', type: 'select', group: '便利填写', options: [{ label: '保持原样', value: 'none' }, { label: '转大写', value: 'upper' }, { label: '转小写', value: 'lower' }] },
    { key: 'rememberLastInput', label: '记住上次输入', type: 'boolean', group: '便利填写', help: '仅适合非敏感查询条件；会在本机保存最近一次值，并可随时清除。' },
    { key: 'validator', label: '校验器', type: 'select', group: '校验', options: [
      { label: '无', value: 'none' }, { label: '邮箱', value: 'email' }, { label: '手机号', value: 'phone' },
      { label: 'URL', value: 'url' }, { label: '身份证', value: 'idcard' }, { label: '自定义正则', value: 'pattern' },
    ]},
    { key: 'pattern', label: '正则表达式', type: 'string', editor: 'regex', group: '校验', placeholder: '^\\d+$', visibleWhen: { key: 'validator', value: 'pattern' }, help: '提供范例、语法检查和隔离 Worker 测试。', assistantCapability: { capability: 'regex.generate-or-repair', contextKeys: ['label', 'placeholder'], resultType: 'value' } },
    { key: 'patternMessage', label: '正则错误提示（高级）', type: 'string', group: '校验', level: 'advanced', placeholder: '格式不正确', help: '通常使用“错误提示”即可；此项仅用于兼容旧正则配置。' },
    { key: 'minLength', label: '最小长度', type: 'number', group: '校验', min: 0 },
    { key: 'maxLength', label: '最大长度', type: 'number', group: '校验', min: 0 },
    { key: 'customMessage', label: '错误提示', type: 'string', group: '校验', placeholder: '如：请输入 6–20 个字符', help: '留空时根据输入类型和范围生成默认提示。' },
    { key: 'validationRules', label: '组合校验规则', type: 'json', editor: 'validation-rules', group: '校验', help: '可组合必填、范围、格式与跨字段比较规则，并按顺序执行。' },
    { kind: 'composite', key: 'typography', keys: ['fontFamily', 'fontSize', 'fontWeight', 'color', 'lineHeight', 'letterSpacing', 'textAlign'], label: '字体与排版', editor: 'typography', group: '文本样式', help: '集中配置字体、字号、字重、颜色、行高、字间距与对齐。' },
    { key: 'valueExpression', label: '计算值', type: 'string', editor: 'expression', group: '表达式', help: '值变化时使用受限 DSL 重新计算。', assistantCapability: { capability: 'expression.generate-or-repair', contextKeys: ['name', 'label'], resultType: 'value' } },
    { kind: 'composite', key: 'displayConditions', keys: ['visibleExpression', 'disabledExpression', 'requiredExpression'], label: '显示与填写条件', editor: 'display-conditions', group: '表达式', help: '用“始终”或“满足条件时”配置显示、编辑和必填行为；保存前会检查字段引用。' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 240, h: SINGLE_LINE_FIELD_HEIGHT },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => withAntdField(
    <div style={ios.field}>
      <label style={ios.label}>{renderLabel(component.props.label || 'Label', component.props.required)}</label>
      <AntdTextInput
        value={String(runtime?.value ?? '')}
        placeholder={component.props.placeholder || ''}
        readOnly={!!component.props.readonly}
        disabled={!!component.props.disabled}
        inputMode={component.props.inputKind === 'phone' ? 'tel' : component.props.inputKind === 'email' ? 'email' : component.props.inputKind === 'url' ? 'url' : 'text'}
        maxLength={Number(component.props.maxLength) || undefined}
        showCount={Number(component.props.maxLength) > 0}
        style={{ fontFamily: component.props.fontFamily || undefined, fontSize: component.props.fontSize || 16, fontWeight: component.props.fontWeight || '400', color: component.props.color || 'var(--text)', lineHeight: component.props.lineHeight || undefined, letterSpacing: `${Number(component.props.letterSpacing) || 0}px`, textAlign: component.props.textAlign || 'left' }}
        onChange={(next) => { const value = component.props.trimWhitespace === false ? next : next.trim(); const transformed = component.props.textTransform === 'upper' ? value.toUpperCase() : component.props.textTransform === 'lower' ? value.toLowerCase() : value; runtime?.emit('onChange', transformed); }}
        onBlur={() => runtime?.emit('onBlur')}
        onFocus={() => runtime?.emit('onFocus')}
        onClick={(event) => { if (component.props.selectOnFocus) event.currentTarget.select(); }}
        allowClear={component.props.allowClear !== false}
        onClear={() => runtime?.emit('onChange', '')}
      />
      {component.props.inputKind && component.props.inputKind !== 'text' && <small className="designer-field-hint">格式提示：{component.props.inputKind === 'code' && component.props.codeTemplate ? `示例模板 ${component.props.codeTemplate}` : ({ email: 'name@example.com', phone: '如：13800138000', idcard: '18 位身份证号', url: 'https://example.com', code: '按编号规则输入' } as Record<string, string>)[String(component.props.inputKind)] || '请输入有效格式'}</small>}
    </div>
  ),
});

registerControl({
  type: 'textarea', label: '多行文本', category: 'basic', icon: 'textarea',
  defaultProps: {
    label: 'Label', placeholder: '请输入', name: '', rows: 3, required: false, readonly: false, disabled: false,
    maxLength: 0, showCount: false, autoResize: true,
    fontSize: 16, fontWeight: '400', color: '#1c1c1e', lineHeight: 1.5,
    minLength: 0, pattern: '', patternMessage: '格式不正确', customMessage: '输入内容不符合要求', validationRules: [],
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'rows', label: '行数', type: 'number', group: '基础', min: 1, max: 20 },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '允许编辑', type: 'boolean', group: '校验', help: '关闭后保留内容但不可修改。' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '校验', help: '关闭后字段不可操作，也不会参与填写。' },
    { key: 'maxLength', label: '最大字数', type: 'number', group: '校验', min: 0 },
    { key: 'showCount', label: '显示字数统计', type: 'boolean', group: '校验' },
    { key: 'autoResize', label: '自动调整高度', type: 'boolean', group: '高级', level: 'advanced', help: '内容较长时自动展开，避免在小输入框里滚动。' },
    { key: 'minLength', label: '最小长度', type: 'number', group: '校验', min: 0 },
    { key: 'pattern', label: '正则校验', type: 'string', editor: 'regex', group: '校验' },
    { key: 'customMessage', label: '错误提示', type: 'string', group: '校验', placeholder: '如：请输入 6–200 个字符', help: '留空时根据长度和格式生成默认提示。' },
    { key: 'validationRules', label: '组合校验规则', type: 'json', editor: 'validation-rules', group: '校验' },
    { key: 'fontSize', label: '字号', type: 'number', group: '文本样式', min: 10, max: 48 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '文本样式', options: [
      { label: '细体', value: '300' }, { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '粗体', value: '700' },
    ]},
    { key: 'color', label: '文字颜色', type: 'color', group: '文本样式' },
    { key: 'lineHeight', label: '行高', type: 'number', group: '文本样式', min: 1, max: 3, step: 0.1 },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }, { key: 'onSubmit', label: '快捷提交', description: '按 Ctrl/Cmd+Enter 时触发' }],
  defaultSize: { w: 280, h: 132 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => withAntdField(
    <div style={ios.field}>
      <label style={ios.label}>{renderLabel(component.props.label || 'Label', component.props.required)}</label>
      <AntdTextAreaInput
        value={String(runtime?.value ?? '')}
        placeholder={component.props.placeholder || ''}
        readOnly={!!component.props.readonly}
        disabled={!!component.props.disabled}
        rows={Number(component.props.rows) || 3}
        autoSize={component.props.autoResize ? { minRows: Number(component.props.rows) || 3, maxRows: 8 } : false}
        maxLength={Number(component.props.maxLength) || undefined}
        showCount={!!component.props.showCount || Number(component.props.maxLength) > 0}
        style={{ fontSize: component.props.fontSize || 16, fontWeight: component.props.fontWeight || '400', color: component.props.color || 'var(--text)', lineHeight: component.props.lineHeight || 1.5 }}
        onChange={(next) => runtime?.emit('onChange', next)}
        onBlur={() => runtime?.emit('onBlur')}
        onFocus={() => runtime?.emit('onFocus')}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); runtime?.emit('onSubmit', String(runtime?.value ?? '')); } }}
      />
    </div>
  ),
});

registerControl({
  type: 'number', label: '数字输入', category: 'basic', icon: 'number',
  defaultProps: {
    label: 'Label', placeholder: '0', name: '', required: false, readonly: false, disabled: false,
    step: 1, precision: 0, prefix: '', suffix: '',
    fontSize: 16, fontWeight: '400', color: '#1c1c1e', textAlign: 'left',
    integer: false, positive: false, customMessage: '请输入有效数字',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '允许编辑', type: 'boolean', group: '校验', help: '关闭后保留内容但不可修改。' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '校验', help: '关闭后字段不可操作，也不会参与填写。' },
    { key: 'customMessage', label: '错误提示', type: 'string', group: '校验', placeholder: '如：请输入有效金额', help: '留空时根据数值范围生成默认提示。' },
    { kind: 'composite', key: 'numberRange', keys: ['min', 'max', 'step', 'precision', 'integer', 'positive'], label: '数值范围与精度', editor: 'number-range', group: '数值范围', help: '集中设置范围、步长、小数位和整数/正数约束；默认值超出范围时会在校验中提示。' },
    { key: 'prefix', label: '前缀（仅显示）', type: 'string', group: '数值范围', placeholder: '¥', help: '只影响显示，保存的仍是纯数字。' },
    { key: 'suffix', label: '后缀（仅显示）', type: 'string', group: '数值范围', placeholder: '元', help: '只影响显示，保存的仍是纯数字。' },
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
  defaultSize: { w: 220, h: SINGLE_LINE_FIELD_HEIGHT },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => withAntdField(
    <div style={ios.field}>
      <label style={ios.label}>{renderLabel(component.props.label || 'Label', component.props.required)}</label>
      <AntdNumberInput
        value={runtime?.value === '' ? '' : Number(runtime?.value ?? '')}
        placeholder={component.props.placeholder || ''}
        readOnly={!!component.props.readonly}
        disabled={!!component.props.disabled}
        min={component.props.min}
        max={component.props.max}
        step={component.props.step}
        precision={Number.isFinite(Number(component.props.precision)) ? Number(component.props.precision) : undefined}
        prefix={component.props.prefix || undefined}
        suffix={component.props.suffix || undefined}
        style={{ fontSize: component.props.fontSize || 16, fontWeight: component.props.fontWeight || '400', color: component.props.color || 'var(--text)', textAlign: component.props.textAlign || 'left', width: '100%' }}
        onChange={(next) => runtime?.emit('onChange', next === '' ? '' : Number(next))}
        onBlur={() => runtime?.emit('onBlur')}
        onFocus={() => runtime?.emit('onFocus')}
      />
    </div>
  ),
});

registerControl({
  type: 'datePicker', label: '日期选择', category: 'basic', icon: 'datePicker',
  defaultProps: {
    label: '日期', name: '', placeholder: '选择日期', required: false, readonly: false, disabled: false,
    format: 'YYYY-MM-DD', minDate: '', maxDate: '', showTime: false,
    defaultValueConfig: { mode: 'none' },
    constraintConfig: {},
    businessDayConfig: { mode: 'allDays' },
    displayPreset: 'date', timezone: 'local', displayFormat: '',
    storageFormat: '',
    fontSize: 16, fontWeight: '400', color: '#1c1c1e',
    customMessage: '请选择有效日期',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '允许编辑', type: 'boolean', group: '校验', help: '关闭后保留内容但不可修改。' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '校验', help: '关闭后字段不可操作，也不会参与填写。' },
    { kind: 'composite', key: 'dateRange', keys: ['minDate', 'maxDate'], label: '日期范围', editor: 'date-range', group: '校验', help: '开始日期和结束日期组合填写；跨字段绑定会显示双方业务字段名。' },
    { key: 'defaultValueConfig', label: '默认值向导', type: 'object', editor: 'date-default-config', group: '便利配置' },
    { key: 'constraintConfig', label: '约束向导', type: 'object', editor: 'date-constraint-config', group: '便利配置' },
    { key: 'businessDayConfig', label: '工作日限制', type: 'object', editor: 'date-business-day-config', group: '便利配置' },
    { key: 'customMessage', label: '错误提示', type: 'string', group: '校验', placeholder: '如：请选择有效日期' },
    { key: 'displayPreset', label: '用户看到的格式', type: 'select', group: '样式', options: [{ label: '日期', value: 'date' }, { label: '日期和时间', value: 'datetime' }, { label: '中文日期', value: 'chinese' }], help: '决定填表者看到的格式；系统保存格式在高级设置中保持稳定。' },
    { key: 'timezone', label: '时区', type: 'select', group: '样式', options: [{ label: '跟随设备', value: 'local' }, { label: 'UTC', value: 'utc' }, { label: '中国标准时间（UTC+8）', value: 'Asia/Shanghai' }], help: '明确日期时间解释方式，避免跨地区提交产生歧义。' },
    { key: 'format', label: '日期格式（高级）', type: 'select', level: 'advanced', group: '样式', options: [
      { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' }, { label: 'YYYY/MM/DD', value: 'YYYY/MM/DD' },
      { label: 'DD/MM/YYYY', value: 'DD/MM/YYYY' }, { label: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
      { label: 'YYYY年MM月DD日', value: 'YYYY年MM月DD日' },
      { label: 'YYYY-MM-DD HH:mm', value: 'YYYY-MM-DD HH:mm' },
      { label: 'YYYY-MM-DD HH:mm:ss', value: 'YYYY-MM-DD HH:mm:ss' },
    ]},
    { key: 'displayFormat', label: '展示格式（高级）', type: 'string', group: '样式', level: 'advanced', placeholder: '为空则沿用日期格式' },
    { key: 'storageFormat', label: '存储格式（高级）', type: 'string', group: '样式', level: 'advanced', placeholder: '如 YYYY-MM-DD' },
    { key: 'showTime', label: '显示时间', type: 'boolean', group: '样式' },
    { key: 'fontSize', label: '字号', type: 'number', group: '样式', min: 10, max: 48 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '样式', options: [
      { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '粗体', value: '700' },
    ]},
    { key: 'color', label: '文字颜色', type: 'color', group: '样式' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 220, h: SINGLE_LINE_FIELD_HEIGHT },
  render: DatePickerPreview,
});

registerControl({
  type: 'timePicker', label: '时间选择', category: 'basic', icon: 'timePicker',
  defaultProps: {
    label: '时间', name: '', placeholder: '选择时间', required: false, readonly: false, disabled: false,
    showSeconds: false, format: 'HH:mm', displayPreset: 'time', timezone: 'local', rangeRef: null,
    defaultValueConfig: { mode: 'none' },
    constraintConfig: {},
    displayFormat: '',
    storageFormat: '',
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '允许编辑', type: 'boolean', group: '校验', help: '关闭后保留内容但不可修改。' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '校验', help: '关闭后字段不可操作，也不会参与填写。' },
    { key: 'defaultValueConfig', label: '默认值向导', type: 'object', editor: 'date-default-config', group: '便利配置' },
    { key: 'constraintConfig', label: '时间限制', type: 'object', editor: 'date-constraint-config', group: '便利配置' },
    { key: 'displayPreset', label: '用户看到的格式', type: 'select', group: '样式', options: [{ label: '时:分', value: 'time' }, { label: '时:分:秒', value: 'timeSeconds' }], help: '常用格式优先；系统保存格式仍在高级设置中保持稳定。' },
    { key: 'timezone', label: '时区', type: 'select', group: '样式', options: [{ label: '跟随设备', value: 'local' }, { label: 'UTC', value: 'utc' }, { label: '中国标准时间（UTC+8）', value: 'Asia/Shanghai' }], help: '明确时间解释方式，避免跨地区提交产生歧义。' },
    { key: 'showSeconds', label: '显示秒', type: 'boolean', group: '样式' },
    { key: 'format', label: '时间格式（高级）', type: 'select', level: 'advanced', group: '样式', options: [
      { label: 'HH:mm', value: 'HH:mm' },
      { label: 'HH:mm:ss', value: 'HH:mm:ss' },
    ]},
    { key: 'displayFormat', label: '展示格式（高级）', type: 'string', group: '样式', level: 'advanced', placeholder: '为空则沿用时间格式' },
    { key: 'storageFormat', label: '存储格式（高级）', type: 'string', group: '样式', level: 'advanced', placeholder: '如 HH:mm:ss' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 220, h: SINGLE_LINE_FIELD_HEIGHT },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => withAntdField(
    <div style={ios.field}>
      <label style={ios.label}>{renderLabel(component.props.label || '时间', component.props.required)}</label>
      {(() => {
        const timeConstraints = resolveDateConstraintState(component.props.constraintConfig, runtime?.values || {}, 'time');
        return (
          <>
      <AntdTimeInput
        value={normalizeDateTimeValue(runtime?.value, 'time')}
        readOnly={!!component.props.readonly}
        placeholder={component.props.placeholder || '选择时间'}
        disabled={!!component.props.disabled}
        format={component.props.displayFormat || (component.props.displayPreset === 'timeSeconds' ? 'HH:mm:ss' : component.props.format || (component.props.showSeconds ? 'HH:mm:ss' : 'HH:mm'))}
        showSeconds={!!component.props.showSeconds}
        min={timeConstraints.min}
        max={timeConstraints.max}
        onChange={(next) => runtime?.emit('onChange', next)}
        onBlur={() => runtime?.emit('onBlur')}
        onFocus={() => runtime?.emit('onFocus')}
      />
      {mode === 'preview' && (
        <div className="designer-preview-option-meta">
          <span>{describeDateDefaultSource(component.props.defaultValueConfig)}</span>
          <span>{describeDateConstraints(timeConstraints).join('；') || '无额外限制'}</span>
        </div>
      )}
          </>
        );
      })()}
    </div>
  ),
});

registerControl({
  type: 'dateRange', label: '日期范围', category: 'basic', icon: 'dateRange',
  defaultProps: {
    label: '日期范围', name: '', required: false, readonly: false, disabled: false,
    format: 'YYYY-MM-DD', startPlaceholder: '开始日期', endPlaceholder: '结束日期',
    defaultValueConfig: { mode: 'none' },
    constraintConfig: {},
    businessDayConfig: { mode: 'allDays' },
    rangeLinkagePolicy: 'clearInvalid',
    displayFormat: '',
    storageFormat: '',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '允许编辑', type: 'boolean', group: '校验', help: '关闭后保留内容但不可修改。' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '校验', help: '关闭后字段不可操作，也不会参与填写。' },
    { key: 'startPlaceholder', label: '开始占位符', type: 'string', group: '基础', placeholder: '开始日期（含当天）' },
    { key: 'endPlaceholder', label: '结束占位符', type: 'string', group: '基础', placeholder: '结束日期（含当天）' },
    { key: 'defaultValueConfig', label: '默认值向导', type: 'object', editor: 'date-default-config', group: '便利配置' },
    { key: 'constraintConfig', label: '范围约束', type: 'object', editor: 'date-constraint-config', group: '便利配置' },
    { key: 'businessDayConfig', label: '工作日限制', type: 'object', editor: 'date-business-day-config', group: '便利配置' },
    { key: 'rangeLinkagePolicy', label: '失效范围处理', type: 'select', group: '便利配置', help: '当起止顺序或日期限制失效时，清空整段并在字段旁说明原因。', options: [{ label: '清理失效区间', value: 'clearInvalid' }] },
    { key: 'format', label: '日期格式', type: 'select', group: '样式', options: [
      { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
      { label: 'YYYY/MM/DD', value: 'YYYY/MM/DD' },
      { label: 'YYYY年MM月DD日', value: 'YYYY年MM月DD日' },
    ]},
    { key: 'displayFormat', label: '展示格式（高级）', type: 'string', group: '样式', level: 'advanced', placeholder: '为空则沿用日期格式' },
    { key: 'storageFormat', label: '存储格式（高级）', type: 'string', group: '样式', level: 'advanced', placeholder: '如 YYYY-MM-DD' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 280, h: SINGLE_LINE_FIELD_HEIGHT },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const rangeValue = runtime?.value && typeof runtime.value === 'object' ? runtime.value as Record<string, unknown> : {};
    const constraintState = resolveDateConstraintState(
      component.props.constraintConfig,
      runtime?.values || {},
      'date',
      component.props.businessDayConfig,
    );
    return withAntdField(
      <div style={ios.field}>
        <label style={ios.label}>{renderLabel(component.props.label || '日期范围', component.props.required)}</label>
        <AntdDateRangeInput
          value={{ start: normalizeDateTimeValue(rangeValue.start, 'date'), end: normalizeDateTimeValue(rangeValue.end, 'date') }}
          readOnly={!!component.props.readonly}
          disabled={!!component.props.disabled}
          placeholder={[String(component.props.startPlaceholder || '开始日期'), String(component.props.endPlaceholder || '结束日期')]}
          format={String(component.props.displayFormat || component.props.format || 'YYYY-MM-DD')}
          min={constraintState.min}
          max={constraintState.max}
          disableWeekends={constraintState.weekdaysOnly}
          onChange={(next) => runtime?.emit('onChange', next)}
          onBlur={() => runtime?.emit('onBlur')}
          onFocus={() => runtime?.emit('onFocus')}
        />
        {!component.props.readonly && !component.props.disabled && <div className="designer-date-range-presets" aria-label="快捷日期范围"><button type="button" onClick={() => runtime?.emit('onChange', { start: dayjs().startOf('isoWeek').format('YYYY-MM-DD'), end: dayjs().endOf('isoWeek').format('YYYY-MM-DD') })}>本周</button><button type="button" onClick={() => runtime?.emit('onChange', { start: dayjs().subtract(29, 'day').format('YYYY-MM-DD'), end: dayjs().format('YYYY-MM-DD') })}>近 30 天</button><button type="button" onClick={() => runtime?.emit('onChange', { start: dayjs().startOf('month').format('YYYY-MM-DD'), end: dayjs().endOf('month').format('YYYY-MM-DD') })}>本月</button></div>}
        {mode === 'preview' && (
          <div className="designer-preview-option-meta">
            <span>{describeDateDefaultSource(component.props.defaultValueConfig)}</span>
            <span>{describeDateConstraints(constraintState).join('；') || '无额外限制'}</span>
            {describeRangeBinding(component.props.dataBinding) && <span>{describeRangeBinding(component.props.dataBinding)}</span>}
          </div>
        )}
      </div>
    );
  },
});

registerControl({
  type: 'switch', label: '开关', category: 'basic', icon: 'switch',
  defaultProps: {
    label: '启用', name: '', disabled: false, defaultValue: false, onText: '开启', offText: '关闭',
    size: 'default', activeColor: '#34c759', inactiveColor: 'rgba(118,118,128,0.18)',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '基础', help: '关闭后控件不可操作。' },
    { key: 'defaultValue', label: '默认状态', type: 'boolean', group: '基础', help: '默认关闭更安全；提交前请确认开启代表的业务含义。' },
    { key: 'onText', label: '开启时文字', type: 'string', group: '基础', placeholder: '开启' },
    { key: 'offText', label: '关闭时文字', type: 'string', group: '基础', placeholder: '关闭' },
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
          disabled={!!component.props.disabled}
          size={component.props.size || 'default'}
          activeColor={component.props.activeColor}
          inactiveColor={component.props.inactiveColor}
          onChange={(next) => runtime?.emit('onChange', next)}
        />
        <span aria-live="polite" style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 30 }}>{checked ? (component.props.onText || '开启') : (component.props.offText || '关闭')}</span>
      </div>
    );
  },
});

registerControl({
  type: 'rating', label: '评分', category: 'basic', icon: 'rating',
  defaultProps: {
    label: '评分', name: '', max: 5, defaultValue: 0, disabled: false, required: false, lowLabel: '不满意', highLabel: '非常满意',
    size: 'default', activeColor: '#ff9500', inactiveColor: '#e5e5ea', allowHalf: false, showText: false,
    customMessage: '请选择评分',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'max', label: '最高分', type: 'number', group: '基础', min: 1, max: 10, help: '例如 5 分制；运行态会显示 1–5 个星。' },
    { key: 'defaultValue', label: '默认分值', type: 'number', group: '基础', min: 0, help: '设为 0 表示不预选，避免用户误提交默认评分。' },
    { key: 'lowLabel', label: '最低分说明', type: 'string', group: '基础', placeholder: '不满意' },
    { key: 'highLabel', label: '最高分说明', type: 'string', group: '基础', placeholder: '非常满意' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '基础', help: '关闭后控件不可操作。' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'customMessage', label: '错误提示', type: 'string', group: '校验', placeholder: '如：请完成评分' },
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
        <div aria-label={`评分 ${val || 0}/${max}`} style={{ display: 'flex', gap: 2, flexShrink: 0, alignItems: 'center' }}>
          <AntdRateInput
            count={max}
            value={val}
            disabled={!!component.props.disabled}
            size={component.props.size || 'default'}
            color={component.props.activeColor}
            inactiveColor={component.props.inactiveColor}
            allowHalf={!!component.props.allowHalf}
            onChange={(next) => runtime?.emit('onChange', next)}
          />
          {component.props.showText && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 4 }}>{val ? `${val}/${max}` : '未评分'}</span>}
        </div>
        <span role="status" style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{component.props.allowHalf ? '支持半星' : '整星'}；可用方向键调整</span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 54, textAlign: 'right' }}>{val >= max ? (component.props.highLabel || '非常满意') : val === 1 ? (component.props.lowLabel || '不满意') : ''}</span>
      </div>
    );
  },
});

registerControl({
  type: 'tagInput', label: '标签输入', category: 'basic', icon: 'tagInput',
  defaultProps: {
    label: '标签', name: '', placeholder: '输入后回车', required: false, disabled: false, maxTags: 0, maxTagLength: 0, allowDuplicates: false, rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '校验', help: '关闭后控件不可操作。' },
    { key: 'maxTags', label: '最多标签数（0=不限）', type: 'number', group: '校验', min: 0 },
    { key: 'maxTagLength', label: '单个标签最多字数（0=不限）', type: 'number', group: '校验', min: 0 },
    { key: 'allowDuplicates', label: '允许重复标签', type: 'boolean', group: '校验' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 280, h: 84 },
  render: TagInputPreview,
});

registerControl({
  type: 'upload', label: '文件上传', category: 'basic', icon: 'upload',
  defaultProps: {
    label: '文件上传', name: '', placeholder: '点击选择文件', required: false, disabled: false,
    accept: '', maxFileSizeMb: 0, maxCount: 0, rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '校验', help: '关闭后控件不可操作。' },
    { kind: 'composite', key: 'uploadConstraints', keys: ['accept', 'maxFileSizeMb', 'maxCount'], label: '上传限制', editor: 'upload-constraints', group: '校验' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '文件改变时触发' }],
  defaultSize: { w: 280, h: 112 },
  render: ({ component, mode, runtime }) => <UploadPreview component={component} mode={mode} runtime={runtime} />,
});

registerControl({
  type: 'imageUpload', label: '图片上传', category: 'basic', icon: 'imageUpload',
  defaultProps: {
    label: '图片上传', name: '', placeholder: '点击选择图片', required: false, disabled: false,
    accept: 'image/*', maxFileSizeMb: 0, maxCount: 1, minImageWidth: 0, maxImageWidth: 0, minImageHeight: 0, maxImageHeight: 0, imageRotate: 0, alt: '', privacyHint: '仅保存文件元信息', rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '校验', help: '关闭后控件不可操作。' },
    { key: 'alt', label: '图片说明（无障碍）', type: 'string', group: '基础', placeholder: '如：证件正面', help: '建议填写简短描述；不要写入身份证号等敏感信息。' },
    { key: 'privacyHint', label: '隐私提示', type: 'string', group: '基础', placeholder: '仅用于本次业务，不公开展示', help: '向填表者说明图片用途与保存范围。' },
    { key: 'imageRotate', label: '预览旋转', type: 'select', group: '便利填写', options: [{ label: '不旋转', value: 0 }, { label: '顺时针 90°', value: 90 }, { label: '180°', value: 180 }, { label: '逆时针 90°', value: 270 }], help: '只影响预览方向，不改变原始文件。' },
    { kind: 'composite', key: 'uploadConstraints', keys: ['accept', 'maxFileSizeMb', 'maxCount', 'minImageWidth', 'maxImageWidth', 'minImageHeight', 'maxImageHeight'], label: '上传与尺寸限制', editor: 'upload-constraints', group: '校验' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '图片改变时触发' }],
  defaultSize: { w: 280, h: 144 },
  render: ({ component, mode, runtime }) => <UploadPreview component={component} mode={mode} runtime={runtime} imageOnly />,
});

registerControl({
  type: 'button', label: '按钮', category: 'basic', icon: 'button',
  defaultProps: {
    label: '提交', name: '', action: 'submit', variant: 'primary', disabled: false, loading: false, icon: '', confirmBeforeAction: true,
    fontSize: 16, fontWeight: '650', color: '#ffffff', backgroundColor: '',
    borderRadius: 10, fullWidth: false,
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '文本', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'btn_submit' },
    { key: 'action', label: '动作', type: 'select', group: '基础', help: '用于生成更清晰的默认文案和运行态反馈。', options: [
      { label: '提交', value: 'submit' }, { label: '保存', value: 'save' }, { label: '查询', value: 'query' }, { label: '删除（危险）', value: 'delete' }, { label: '重置', value: 'reset' }, { label: '取消', value: 'cancel' },
    ]},
    { key: 'variant', label: '样式', type: 'select', group: '基础', options: [
      { label: '主要', value: 'primary' }, { label: '默认', value: 'default' },
      { label: '危险', value: 'danger' }, { label: '幽灵', value: 'ghost' },
    ]},
    { key: 'confirmBeforeAction', label: '危险操作前确认', type: 'boolean', group: '基础', visibleWhen: { key: 'variant', value: 'danger' }, help: '危险按钮默认要求确认，避免误删或重复提交。' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '基础', help: '关闭后按钮不可操作。' },
    { key: 'loading', label: '加载中（高级）', type: 'boolean', group: '基础', level: 'advanced', help: '建议由异步行为自动控制，不要手动固定。' },
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
    const actionLabels: Record<string, string> = { submit: '提交', save: '保存', query: '查询', delete: '删除', reset: '重置', cancel: '取消' };
    const buttonText = !p.label || p.label === '确定' || p.label === '执行' ? (actionLabels[String(p.action)] || '提交') : String(p.label);
    const bg = p.backgroundColor || (isPrimary ? '#007aff' : isDanger ? '#ff3b30' : isGhost ? 'transparent' : 'rgba(118,118,128,0.10)');
    const textColor = p.color || (isPrimary || isDanger ? '#fff' : isGhost ? '#007aff' : '#007aff');
    return withAntdField(
      <div style={{ width: '100%', height: '100%', minWidth: 0, display: 'flex', alignItems: 'flex-start', boxSizing: 'border-box', padding: 4 }}>
        <div style={{ width: p.fullWidth ? '100%' : 'auto' }}>
          <AntdActionButton
            label={`${p.icon ? `${BUTTON_ICONS[String(p.icon)] || p.icon} ` : ''}${p.loading ? '加载中...' : buttonText}`}
            disabled={!!p.disabled || !!p.loading}
            variant={p.variant === 'ghost' ? 'ghost' : p.variant === 'default' ? 'outline' : 'solid'}
            danger={isDanger}
            block={!!p.fullWidth}
            style={{ fontSize: Number(p.fontSize) || 16, fontWeight: p.fontWeight || 650, color: textColor, background: bg, borderRadius: Number(p.borderRadius) || 0 }}
            onClick={() => { if (isDanger && p.confirmBeforeAction !== false && typeof globalThis.confirm === 'function' && !globalThis.confirm(`确认${p.label || '执行此操作'}？`)) return; runtime?.emit('onClick'); }}
          />
        </div>
      </div>
    );
  },
});
