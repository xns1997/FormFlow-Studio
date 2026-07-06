import React from 'react';
import { registerControl } from '../registry';
import type { DesignComponent } from '../../project/types';
import { controlText, ios, requiredMark } from './styles';
import type { PreviewControlRuntime } from '../types';
import {
  AntdCheckboxInput,
  AntdRadioInput,
  AntdSegmentedInput,
  AntdSelectInput,
  FormAntdProvider,
  toOptions,
} from '../../components/AntdFormControls';

const renderLabel = (label: string, required?: boolean) => (
  <>
    {label}
    {required && <span style={requiredMark}>*</span>}
  </>
);

registerControl({
  type: 'select', label: '下拉选择', category: 'select', icon: '📋',
  defaultProps: {
    label: '选择', placeholder: '请选择', name: '', required: false, readonly: false, disabled: false, multiple: false,
    options: [{ label: '选项A', value: 'a' }, { label: '选项B', value: 'b' }],
    fontSize: 15, fontWeight: '400', color: '#1c1c1e',
    customMessage: '',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '只读', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { key: 'multiple', label: '多选', type: 'boolean', group: '校验' },
    { key: 'customMessage', label: '自定义错误提示', type: 'string', group: '校验' },
    { key: 'options', label: '选项 (JSON)', type: 'json', group: '数据' },
    { key: 'fontSize', label: '字号', type: 'number', group: '文本样式', min: 10, max: 48 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '文本样式', options: [
      { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '粗体', value: '700' },
    ]},
    { key: 'color', label: '文字颜色', type: 'color', group: '文本样式' },
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 240, h: 72 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const opts = toOptions(component.props.options || []);
    return (
      <FormAntdProvider>
      <div style={ios.field}>
        <label style={ios.label}>{renderLabel(component.props.label || '选择', component.props.required)}</label>
        <AntdSelectInput
          value={component.props.multiple ? (Array.isArray(runtime?.value) ? runtime?.value.map(String) : []) : String(runtime?.value ?? '')}
          options={opts}
          multiple={!!component.props.multiple}
          placeholder={component.props.placeholder || '请选择'}
          disabled={mode !== 'preview' || !!component.props.disabled}
          onChange={(next) => runtime?.emit('onChange', next)}
          onBlur={() => runtime?.emit('onBlur')}
          onFocus={() => runtime?.emit('onFocus')}
        />
      </div>
      </FormAntdProvider>
    );
  },
});

registerControl({
  type: 'segmented', label: '分段选择', category: 'select', icon: '🧩',
  defaultProps: {
    label: '分段选择', name: '', required: false, disabled: false,
    options: [{ label: '待处理', value: 'pending' }, { label: '进行中', value: 'processing' }, { label: '完成', value: 'done' }],
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { key: 'options', label: '选项 (JSON)', type: 'json', group: '数据' },
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 280, h: 72 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const opts = toOptions(component.props.options || []);
    const selectedValue = String(runtime?.value ?? opts[0]?.value ?? '');
    return (
      <FormAntdProvider>
      <div style={ios.field}>
        <label style={ios.label}>{renderLabel(component.props.label || '分段选择', component.props.required)}</label>
        <AntdSegmentedInput
          value={selectedValue}
          options={opts}
          disabled={mode !== 'preview' || !!component.props.disabled}
          block
          onChange={(next) => {
            runtime?.emit('onFocus');
            runtime?.emit('onChange', next);
            runtime?.emit('onBlur');
          }}
        />
      </div>
      </FormAntdProvider>
    );
  },
});

registerControl({
  type: 'radio', label: '单选', category: 'select', icon: '🔘',
  defaultProps: {
    label: '单选', name: '', required: false, disabled: false, direction: 'vertical',
    options: [{ label: '选项A', value: 'a' }, { label: '选项B', value: 'b' }, { label: '选项C', value: 'c' }],
    fontSize: 15, fontWeight: '400', color: '#1c1c1e', size: 'default',
    customMessage: '',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { key: 'customMessage', label: '自定义错误提示', type: 'string', group: '校验' },
    { key: 'options', label: '选项 (JSON)', type: 'json', group: '数据' },
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
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 240, h: 150 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const opts = toOptions(component.props.options || []);
    const selectedValue = String(runtime?.value ?? opts[0]?.value ?? '');
    return (
      <FormAntdProvider>
      <div style={ios.field}>
        <label style={ios.label}>{renderLabel(component.props.label || '单选', component.props.required)}</label>
        <AntdRadioInput
          value={selectedValue}
          options={opts}
          direction={component.props.direction === 'horizontal' ? 'horizontal' : 'vertical'}
          disabled={mode !== 'preview' || !!component.props.disabled}
          onChange={(next) => runtime?.emit('onChange', next)}
        />
      </div>
      </FormAntdProvider>
    );
  },
});

registerControl({
  type: 'checkbox', label: '多选', category: 'select', icon: '☑️',
  defaultProps: {
    label: '多选', name: '', required: false, disabled: false, direction: 'vertical',
    options: [{ label: '选项A', value: 'a' }, { label: '选项B', value: 'b' }, { label: '选项C', value: 'c' }],
    minSelect: 0, maxSelect: 0,
    fontSize: 15, fontWeight: '400', color: '#1c1c1e', size: 'default',
    customMessage: '',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { key: 'minSelect', label: '最少选择', type: 'number', group: '校验', min: 0 },
    { key: 'maxSelect', label: '最多选择', type: 'number', group: '校验', min: 0 },
    { key: 'customMessage', label: '自定义错误提示', type: 'string', group: '校验' },
    { key: 'options', label: '选项 (JSON)', type: 'json', group: '数据' },
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
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 240, h: 150 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const opts = toOptions(component.props.options || []);
    const checkedValues = Array.isArray(runtime?.value) ? runtime.value.map(String) : [];
    return (
      <FormAntdProvider>
      <div style={ios.field}>
        <label style={ios.label}>{renderLabel(component.props.label || '多选', component.props.required)}</label>
        <AntdCheckboxInput
          value={checkedValues}
          options={opts}
          direction={component.props.direction === 'horizontal' ? 'horizontal' : 'vertical'}
          disabled={mode !== 'preview' || !!component.props.disabled}
          onChange={(next) => runtime?.emit('onChange', next)}
        />
      </div>
      </FormAntdProvider>
    );
  },
});
