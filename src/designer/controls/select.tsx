import React from 'react';
import { registerControl } from '../registry';
import type { DesignComponent } from '../../project/types';
import { controlText, ios } from './styles';

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
  render: ({ component }: { component: DesignComponent }) => (
    <div style={ios.field}>
      <label style={ios.label}>{component.props.label || '选择'}</label>
      <div style={{ ...ios.control, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer' }}>
        <span style={{ ...ios.muted, fontSize: component.props.fontSize || 14 }}>{component.props.placeholder || '请选择'}</span>
        <span style={{ fontSize: 10, color: '#8e8e93', flexShrink: 0 }}>▼</span>
      </div>
    </div>
  ),
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
  render: ({ component }: { component: DesignComponent }) => {
    const opts = component.props.options || [];
    return (
      <div style={ios.field}>
        <label style={ios.label}>{component.props.label || '单选'}</label>
        <div style={ios.naturalPanel}>
          {opts.map((o: any, i: number) => (
            <div key={i} style={{ ...ios.row, borderBottom: i < opts.length - 1 ? ios.row.borderBottom : 'none' }}>
              <span style={controlText({ fontSize: component.props.fontSize || 14, color: component.props.color || '#1c1c1e' })}>{o.label || o}</span>
              <div style={{ width: 21, height: 21, borderRadius: 999, border: i === 0 ? '2px solid #007aff' : '2px solid rgba(118,118,128,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {i === 0 && <div style={{ width: 11, height: 11, borderRadius: 999, background: '#007aff' }} />}
              </div>
            </div>
          ))}
        </div>
      </div>
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
  render: ({ component }: { component: DesignComponent }) => {
    const opts = component.props.options || [];
    return (
      <div style={ios.field}>
        <label style={ios.label}>{component.props.label || '多选'}</label>
        <div style={ios.naturalPanel}>
          {opts.map((o: any, i: number) => (
            <div key={i} style={{ ...ios.row, borderBottom: i < opts.length - 1 ? ios.row.borderBottom : 'none' }}>
              <span style={controlText({ fontSize: component.props.fontSize || 14, color: component.props.color || '#1c1c1e' })}>{o.label || o}</span>
              <div style={{ width: 21, height: 21, borderRadius: 6, border: i === 0 ? '2px solid #007aff' : '2px solid rgba(118,118,128,0.35)', background: i === 0 ? '#007aff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {i === 0 && <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>✓</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
});
