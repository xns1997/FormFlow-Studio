import React from 'react';
import { registerControl } from '../registry';
import type { PropSchemaEntry } from '../types';
import type { DesignComponent } from '../../project/types';
import { controlText, ios, requiredMark } from './styles';
import type { PreviewControlRuntime } from '../types';
import { useProjectStore } from '../../project/store';
import { resolveOptionSource } from '../../services/data/optionSource';
import {
  AntdCheckboxInput,
  AntdRadioInput,
  AntdSegmentedInput,
  AntdSelectInput,
  FormAntdProvider,
  toOptions,
} from '../../components/AntdFormControls';
import { SINGLE_LINE_FIELD_HEIGHT } from './geometry';

function resolveRenderedOptions(component: DesignComponent, tables: NonNullable<ReturnType<typeof useProjectStore.getState>['project']>['srcTable']) {
  const runtimeOptions = Array.isArray(component.props.runtimeOptions) ? component.props.runtimeOptions : null;
  const options = runtimeOptions || resolveOptionSource(component.props.options, component.props.optionSource, tables).options;
  return {
    options: toOptions(options),
    emptyText: String(component.props.optionEmptyText || '暂无可选项'),
    loadingText: String(component.props.optionLoadingText || '加载选项中…'),
  };
}

const renderLabel = (label: string, required?: boolean) => (
  <>
    {label}
    {required && <span style={requiredMark}>*</span>}
  </>
);

const OPTION_DATA_SCHEMA: PropSchemaEntry[] = [
  { key: 'optionSource', label: '选项来源', type: 'object', editor: 'option-source', group: '数据', help: '先决定选项来自静态列表、数据表还是数据范围。' },
  { key: 'options', label: '选项内容', type: 'json', editor: 'option-content', group: '数据', help: '静态来源时维护选项内容；动态来源时这里仅展示摘要。' },
  { kind: 'composite', key: 'optionAdvanced', keys: ['optionUpdatePolicy', 'emptyOptionsBehavior', 'optionEmptyText', 'optionLoadingText', 'optionLoading'], label: '高级', editor: 'option-advanced', group: '数据', help: '联动后的同步规则与空态提示。默认策略会自动生效。' },
];

registerControl({
  type: 'select', label: '下拉选择', category: 'select', icon: 'select',
  defaultProps: {
    label: '选择', placeholder: '请选择', name: '', required: false, readonly: false, disabled: false, multiple: false, maxSelect: 0,
    options: [{ label: '选项A', value: 'a' }, { label: '选项B', value: 'b' }],
    optionSource: { mode: 'static', unique: true, sortOrder: 'none' },
    optionUpdatePolicy: 'clearInvalid',
    emptyOptionsBehavior: 'keepEnabled',
    optionEmptyText: '暂无可选项',
    optionLoadingText: '加载选项中…', optionLoading: false,
    fontSize: 16, fontWeight: '400', color: '#1c1c1e',
    customMessage: '请选择有效选项',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '允许编辑', type: 'boolean', group: '校验', help: '关闭后保留当前选择但不可修改。' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '校验', help: '关闭后无法选择，也不会参与填写。' },
    { key: 'multiple', label: '多选', type: 'boolean', group: '校验' },
    { key: 'maxSelect', label: '最多选择数（0=不限）', type: 'number', group: '校验', min: 0, visibleWhen: { key: 'multiple', operator: 'truthy' } },
    { key: 'customMessage', label: '错误提示', type: 'string', group: '校验', placeholder: '如：请选择有效选项', help: '留空时使用默认提示。' },
    ...OPTION_DATA_SCHEMA,
    { key: 'fontSize', label: '字号', type: 'number', group: '文本样式', min: 10, max: 48 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '文本样式', options: [
      { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '粗体', value: '700' },
    ]},
    { key: 'color', label: '文字颜色', type: 'color', group: '文本样式' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 240, h: SINGLE_LINE_FIELD_HEIGHT },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const tables = useProjectStore((state) => state.project?.srcTable || []);
    const resolved = resolveRenderedOptions(component, tables);
    const allowedValues = new Set(resolved.options.map((option) => String(option.value)));
    const currentValues = component.props.multiple && Array.isArray(runtime?.value) ? runtime?.value.map(String) : [];
    const clearedInvalidCount = component.props.multiple ? currentValues.filter((value) => !allowedValues.has(value)).length : 0;
    return (
      <FormAntdProvider>
      <div style={ios.field}>
        <label style={ios.label}>{renderLabel(component.props.label || '选择', component.props.required)}</label>
        {resolved.options.length > 0 && resolved.options.length <= 5 && !component.props.multiple ? <AntdRadioInput
          value={String(runtime?.value ?? '')}
          options={resolved.options}
          direction="vertical"
          disabled={!!component.props.disabled}
          onChange={(next) => runtime?.emit('onChange', next)}
        /> : <AntdSelectInput
          value={component.props.multiple ? (Array.isArray(runtime?.value) ? runtime?.value.map(String) : []) : String(runtime?.value ?? '')}
          options={resolved.options}
          multiple={!!component.props.multiple}
          showSearch={resolved.options.length > 5 || !!component.props.multiple}
          maxTagCount={component.props.multiple ? 'responsive' : undefined}
          allowClear
          placeholder={component.props.placeholder || '请选择'}
          emptyText={resolved.emptyText}
          disabled={!!component.props.disabled || component.props.optionLoading === true || (resolved.options.length === 0 && component.props.emptyOptionsBehavior === 'disable')}
          readOnly={!!component.props.readonly}
          style={{ fontSize: Number(component.props.fontSize) || 16, fontWeight: component.props.fontWeight || 400, color: component.props.color || 'var(--text)', width: '100%' }}
          onChange={(next) => runtime?.emit('onChange', component.props.multiple && Number(component.props.maxSelect) > 0 && Array.isArray(next) ? next.slice(0, Number(component.props.maxSelect)) : next)}
          onBlur={() => runtime?.emit('onBlur')}
          onFocus={() => runtime?.emit('onFocus')}
        />}
        {resolved.options.length > 0 && resolved.options.length <= 5 && !component.props.multiple && <small role="status" style={{ color: 'var(--text-tertiary)', lineHeight: 1.4 }}>选项较少，已使用单选列表，减少打开下拉的步骤。</small>}
        {component.props.multiple && resolved.options.length > 0 && <button type="button" className="designer-select-select-all" disabled={!!component.props.disabled || !!component.props.readonly} onClick={() => runtime?.emit('onChange', resolved.options.slice(0, Number(component.props.maxSelect) > 0 ? Number(component.props.maxSelect) : undefined).map((option) => String(option.value)))}>全选可见选项</button>}
        {clearedInvalidCount > 0 && <small role="status" style={{ color: 'var(--warning)', lineHeight: 1.4 }}>已清除 {clearedInvalidCount} 个失效选择，请重新选择。</small>}
        {component.props.optionLoading === true && <small role="status" style={{ color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{component.props.optionLoadingText || '加载选项中…'}</small>}
        {component.props.optionLoading !== true && resolved.options.length === 0 && <small role="status" style={{ color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{component.props.emptyOptionsBehavior === 'disable' ? '暂无可选项，当前字段暂不可继续；请检查数据来源或筛选条件。' : '暂无可选项；请检查数据来源或筛选条件'}</small>}
      </div>
      </FormAntdProvider>
    );
  },
});

registerControl({
  type: 'segmented', label: '分段选择', category: 'select', icon: 'segmented',
  defaultProps: {
    label: '分段选择', name: '', required: false, disabled: false,
    options: [{ label: '待处理', value: 'pending' }, { label: '进行中', value: 'processing' }, { label: '完成', value: 'done' }],
    optionSource: { mode: 'static', unique: true, sortOrder: 'none' },
    optionUpdatePolicy: 'clearInvalid',
    emptyOptionsBehavior: 'keepEnabled',
    optionEmptyText: '暂无可选项',
    optionLoadingText: '加载选项中…',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '校验', help: '关闭后无法选择，也不会参与填写。' },
    ...OPTION_DATA_SCHEMA,
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 280, h: SINGLE_LINE_FIELD_HEIGHT },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const tables = useProjectStore((state) => state.project?.srcTable || []);
    const resolved = resolveRenderedOptions(component, tables);
    const selectedValue = String(runtime?.value ?? resolved.options[0]?.value ?? '');
    const segmentedAllowed = resolved.options.length <= 5 && resolved.options.reduce((sum, option) => sum + String(option.label).length, 0) <= 40;
    return (
      <FormAntdProvider>
      <div style={ios.field}>
        <label style={ios.label}>{renderLabel(component.props.label || '分段选择', component.props.required)}</label>
        {!segmentedAllowed ? <>
          <AntdSelectInput value={selectedValue} options={resolved.options} showSearch allowClear placeholder="选项较多，请搜索选择" disabled={!!component.props.disabled} onChange={(next) => runtime?.emit('onChange', next)} />
          <small role="status" style={{ color: '#8e8e93', lineHeight: 1.4 }}>选项较多或文字较长，已切换为可搜索下拉，避免窄窗口溢出。</small>
        </> : <AntdSegmentedInput
          value={selectedValue}
          options={resolved.options}
          emptyText={resolved.emptyText}
          disabled={!!component.props.disabled}
          block
          onChange={(next) => {
            runtime?.emit('onFocus');
            runtime?.emit('onChange', next);
            runtime?.emit('onBlur');
          }}
        />}
      </div>
      </FormAntdProvider>
    );
  },
});

registerControl({
  type: 'radio', label: '单选', category: 'select', icon: 'radio',
  defaultProps: {
    label: '单选', name: '', required: false, disabled: false, direction: 'vertical',
    options: [{ label: '选项A', value: 'a' }, { label: '选项B', value: 'b' }, { label: '选项C', value: 'c' }],
    optionSource: { mode: 'static', unique: true, sortOrder: 'none' },
    optionUpdatePolicy: 'clearInvalid',
    emptyOptionsBehavior: 'keepEnabled',
    optionEmptyText: '暂无可选项',
    optionLoadingText: '加载选项中…',
    fontSize: 16, fontWeight: '400', color: '#1c1c1e', size: 'default',
    customMessage: '请选择一项',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '校验', help: '关闭后无法选择，也不会参与填写。' },
    { key: 'customMessage', label: '错误提示', type: 'string', group: '校验', placeholder: '如：请选择一项', help: '留空时使用默认提示。' },
    ...OPTION_DATA_SCHEMA,
    { key: 'direction', label: '排列方向', type: 'select', group: '样式', options: [
      { label: '垂直', value: 'vertical' }, { label: '水平', value: 'horizontal' },
    ]},
    { key: 'fontSize', label: '字号', type: 'number', group: '样式', min: 10, max: 48 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '样式', options: [
      { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '粗体', value: '700' },
    ]},
    { key: 'color', label: '文字颜色', type: 'color', group: '样式' },
    { key: 'size', label: '控件尺寸', type: 'select', group: '样式', options: [
      { label: '小', value: 'small' }, { label: '默认', value: 'default' }, { label: '大', value: 'large' },
    ]},
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 240, h: 150 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const tables = useProjectStore((state) => state.project?.srcTable || []);
    const resolved = resolveRenderedOptions(component, tables);
    const opts = resolved.options;
    const selectedValue = String(runtime?.value ?? opts[0]?.value ?? '');
    const horizontalAllowed = opts.length <= 5 && opts.reduce((total, option) => total + String(option.label || '').length, 0) <= 24;
    return (
      <FormAntdProvider>
      <div style={ios.field}>
        <label style={ios.label}>{renderLabel(component.props.label || '单选', component.props.required)}</label>
        <AntdRadioInput
          value={selectedValue}
          options={opts}
          emptyText={resolved.emptyText}
          direction={component.props.direction === 'horizontal' && horizontalAllowed ? 'horizontal' : 'vertical'}
          disabled={!!component.props.disabled}
          style={{ fontSize: component.props.size === 'small' ? 13 : component.props.size === 'large' ? 17 : Number(component.props.fontSize) || 16, fontWeight: component.props.fontWeight || 400, color: component.props.color || 'var(--text)' }}
          onChange={(next) => runtime?.emit('onChange', next)}
        />
        {component.props.direction === 'horizontal' && !horizontalAllowed && <small role="status" style={{ color: 'var(--text-tertiary)' }}>选项较多或文字较长，已自动改为纵向排列</small>}
      </div>
      </FormAntdProvider>
    );
  },
});

registerControl({
  type: 'checkbox', label: '多选', category: 'select', icon: 'checkbox',
  defaultProps: {
    label: '多选', name: '', required: false, disabled: false, direction: 'vertical',
    options: [{ label: '选项A', value: 'a' }, { label: '选项B', value: 'b' }, { label: '选项C', value: 'c' }],
    optionSource: { mode: 'static', unique: true, sortOrder: 'none' },
    optionUpdatePolicy: 'clearInvalid',
    emptyOptionsBehavior: 'keepEnabled',
    optionEmptyText: '暂无可选项',
    optionLoadingText: '加载选项中…',
    minSelect: 0, maxSelect: 0,
    fontSize: 16, fontWeight: '400', color: '#1c1c1e', size: 'default',
    customMessage: '请至少选择一项',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '暂不可用', type: 'boolean', group: '校验', help: '关闭后无法选择，也不会参与填写。' },
    { kind: 'composite', key: 'selectionRange', keys: ['minSelect', 'maxSelect'], label: '选择数量范围', editor: 'selection-range', group: '校验' },
    { key: 'customMessage', label: '错误提示', type: 'string', group: '校验', placeholder: '如：请至少选择一项', help: '留空时使用默认提示。' },
    ...OPTION_DATA_SCHEMA,
    { key: 'direction', label: '排列方向', type: 'select', group: '样式', options: [
      { label: '垂直', value: 'vertical' }, { label: '水平', value: 'horizontal' },
    ]},
    { key: 'fontSize', label: '字号', type: 'number', group: '样式', min: 10, max: 48 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '样式', options: [
      { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '粗体', value: '700' },
    ]},
    { key: 'color', label: '文字颜色', type: 'color', group: '样式' },
    { key: 'size', label: '控件尺寸', type: 'select', group: '样式', options: [
      { label: '小', value: 'small' }, { label: '默认', value: 'default' }, { label: '大', value: 'large' },
    ]},
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 240, h: 150 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const tables = useProjectStore((state) => state.project?.srcTable || []);
    const resolved = resolveRenderedOptions(component, tables);
    const opts = resolved.options;
    const checkedValues = Array.isArray(runtime?.value) ? runtime.value.map(String) : [];
    return (
      <FormAntdProvider>
      <div style={ios.field}>
        <label style={ios.label}>{renderLabel(component.props.label || '多选', component.props.required)}</label>
        <AntdCheckboxInput
          value={checkedValues}
          options={opts}
          emptyText={resolved.emptyText}
          direction={component.props.direction === 'horizontal' ? 'horizontal' : 'vertical'}
          disabled={!!component.props.disabled}
          style={{ fontSize: component.props.size === 'small' ? 13 : component.props.size === 'large' ? 17 : Number(component.props.fontSize) || 16, fontWeight: component.props.fontWeight || 400, color: component.props.color || 'var(--text)' }}
          onChange={(next) => runtime?.emit('onChange', next)}
        />
        {(Number(component.props.minSelect) > 0 || Number(component.props.maxSelect) > 0) && <small role="status" style={{ color: checkedValues.length < Number(component.props.minSelect || 0) || (Number(component.props.maxSelect) > 0 && checkedValues.length > Number(component.props.maxSelect)) ? 'var(--danger)' : 'var(--text-tertiary)', lineHeight: 1.4 }}>已选 {checkedValues.length} 项{Number(component.props.minSelect) > 0 && checkedValues.length < Number(component.props.minSelect) ? `，还需 ${Number(component.props.minSelect) - checkedValues.length} 项` : ''}{Number(component.props.maxSelect) > 0 ? `，最多 ${component.props.maxSelect} 项` : ''}</small>}
      </div>
      </FormAntdProvider>
    );
  },
});
