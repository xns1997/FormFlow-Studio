import React from 'react';
import { registerControl } from '../registry';
import type { DesignComponent } from '../../project/types';
import { controlText, ios } from './styles';

registerControl({
  type: 'input', label: '文本输入', category: 'basic', icon: '✏️',
  defaultProps: {
    label: 'Label', placeholder: '请输入', name: '', required: false, readonly: false, disabled: false,
    fontSize: 15, fontWeight: '400', color: '#1c1c1e', textAlign: 'left',
    minLength: 0, maxLength: 0, pattern: '', patternMessage: '',
    validator: 'none', customMessage: '',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '只读', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { key: 'validator', label: '校验器', type: 'select', group: '校验', options: [
      { label: '无', value: 'none' }, { label: '邮箱', value: 'email' }, { label: '手机号', value: 'phone' },
      { label: 'URL', value: 'url' }, { label: '身份证', value: 'idcard' }, { label: '自定义正则', value: 'pattern' },
    ]},
    { key: 'pattern', label: '正则表达式', type: 'string', group: '校验', placeholder: '^\\d+$' },
    { key: 'patternMessage', label: '校验提示', type: 'string', group: '校验', placeholder: '格式不正确' },
    { key: 'minLength', label: '最小长度', type: 'number', group: '校验', min: 0 },
    { key: 'maxLength', label: '最大长度', type: 'number', group: '校验', min: 0 },
    { key: 'customMessage', label: '自定义错误提示', type: 'string', group: '校验' },
    { key: 'fontSize', label: '字号', type: 'number', group: '文本样式', min: 10, max: 48 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '文本样式', options: [
      { label: '细体', value: '300' }, { label: '常规', value: '400' }, { label: '中等', value: '500' },
      { label: '半粗', value: '600' }, { label: '粗体', value: '700' },
    ]},
    { key: 'color', label: '文字颜色', type: 'color', group: '文本样式' },
    { key: 'textAlign', label: '对齐', type: 'select', group: '文本样式', options: [
      { label: '左对齐', value: 'left' }, { label: '居中', value: 'center' }, { label: '右对齐', value: 'right' },
    ]},
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 240, h: 72 },
  render: ({ component }: { component: DesignComponent }) => (
    <div style={ios.field}>
      <label style={ios.label}>{component.props.label || 'Label'}</label>
      <input style={{ ...ios.control, fontSize: component.props.fontSize || 14, fontWeight: component.props.fontWeight || '400', color: component.props.color || '#1c1c1e', textAlign: component.props.textAlign || 'left' }} placeholder={component.props.placeholder || ''} disabled />
    </div>
  ),
});

registerControl({
  type: 'textarea', label: '多行文本', category: 'basic', icon: '📝',
  defaultProps: {
    label: 'Label', placeholder: '请输入', name: '', rows: 3, required: false, readonly: false, disabled: false,
    maxLength: 0, showCount: false, autoResize: false,
    fontSize: 15, fontWeight: '400', color: '#1c1c1e', lineHeight: 1.5,
    minLength: 0, pattern: '', patternMessage: '', customMessage: '',
    rangeRef: null,
  },
  propSchema: [
    { key: 'label', label: '标签', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'rows', label: '行数', type: 'number', group: '基础', min: 1, max: 20 },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '只读', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { key: 'maxLength', label: '最大字数', type: 'number', group: '校验', min: 0 },
    { key: 'showCount', label: '显示字数统计', type: 'boolean', group: '校验' },
    { key: 'minLength', label: '最小长度', type: 'number', group: '校验', min: 0 },
    { key: 'pattern', label: '正则校验', type: 'string', group: '校验' },
    { key: 'customMessage', label: '自定义错误提示', type: 'string', group: '校验' },
    { key: 'fontSize', label: '字号', type: 'number', group: '文本样式', min: 10, max: 48 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '文本样式', options: [
      { label: '细体', value: '300' }, { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '粗体', value: '700' },
    ]},
    { key: 'color', label: '文字颜色', type: 'color', group: '文本样式' },
    { key: 'lineHeight', label: '行高', type: 'number', group: '文本样式', min: 1, max: 3, step: 0.1 },
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 280, h: 132 },
  render: ({ component }: { component: DesignComponent }) => (
    <div style={ios.field}>
      <label style={ios.label}>{component.props.label || 'Label'}</label>
      <textarea style={{ ...ios.fillControl, resize: 'none', fontSize: component.props.fontSize || 14, fontWeight: component.props.fontWeight || '400', color: component.props.color || '#1c1c1e', lineHeight: component.props.lineHeight || 1.5 }} placeholder={component.props.placeholder || ''} disabled />
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
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '只读', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { key: 'integer', label: '仅整数', type: 'boolean', group: '校验' },
    { key: 'positive', label: '仅正数', type: 'boolean', group: '校验' },
    { key: 'customMessage', label: '自定义错误提示', type: 'string', group: '校验' },
    { key: 'min', label: '最小值', type: 'number', group: '数值范围' },
    { key: 'max', label: '最大值', type: 'number', group: '数值范围' },
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
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 220, h: 72 },
  render: ({ component }: { component: DesignComponent }) => (
    <div style={ios.field}>
      <label style={ios.label}>{component.props.label || 'Label'}</label>
      <input style={{ ...ios.control, fontSize: component.props.fontSize || 14, fontWeight: component.props.fontWeight || '400', color: component.props.color || '#1c1c1e', textAlign: component.props.textAlign || 'left' }} type="number" placeholder={component.props.placeholder || ''} disabled />
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
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'placeholder', label: '占位符', type: 'string', group: '基础' },
    { key: 'required', label: '必填', type: 'boolean', group: '校验' },
    { key: 'readonly', label: '只读', type: 'boolean', group: '校验' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '校验' },
    { key: 'minDate', label: '最早日期', type: 'string', group: '校验', placeholder: '2020-01-01' },
    { key: 'maxDate', label: '最晚日期', type: 'string', group: '校验', placeholder: '2030-12-31' },
    { key: 'customMessage', label: '自定义错误提示', type: 'string', group: '校验' },
    { key: 'format', label: '日期格式', type: 'select', group: '样式', options: [
      { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' }, { label: 'YYYY/MM/DD', value: 'YYYY/MM/DD' },
      { label: 'DD/MM/YYYY', value: 'DD/MM/YYYY' }, { label: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
      { label: 'YYYY年MM月DD日', value: 'YYYY年MM月DD日' },
    ]},
    { key: 'showTime', label: '显示时间', type: 'boolean', group: '样式' },
    { key: 'fontSize', label: '字号', type: 'number', group: '样式', min: 10, max: 48 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '样式', options: [
      { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '粗体', value: '700' },
    ]},
    { key: 'color', label: '文字颜色', type: 'color', group: '样式' },
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }, { key: 'onBlur', label: '失焦', description: '失去焦点时触发' }, { key: 'onFocus', label: '聚焦', description: '获得焦点时触发' }],
  defaultSize: { w: 220, h: 72 },
  render: ({ component }: { component: DesignComponent }) => (
    <div style={ios.field}>
      <label style={ios.label}>{component.props.label || '日期'}</label>
      <div style={{ ...ios.control, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ ...ios.muted, fontSize: component.props.fontSize || 14 }}>{component.props.placeholder || '选择日期'}</span>
        <span style={{ fontSize: 14, flexShrink: 0 }}>📅</span>
      </div>
    </div>
  ),
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
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'disabled', label: '禁用', type: 'boolean', group: '基础' },
    { key: 'defaultValue', label: '默认开启', type: 'boolean', group: '基础' },
    { key: 'size', label: '尺寸', type: 'select', group: '样式', options: [
      { label: '小', value: 'small' }, { label: '默认', value: 'default' }, { label: '大', value: 'large' },
    ]},
    { key: 'activeColor', label: '开启颜色', type: 'color', group: '样式' },
    { key: 'inactiveColor', label: '关闭颜色', type: 'color', group: '样式' },
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }],
  defaultSize: { w: 180, h: 52 },
  render: ({ component }: { component: DesignComponent }) => {
    const checked = component.props.defaultValue !== false;
    const activeColor = component.props.activeColor || '#34c759';
    const inactiveColor = component.props.inactiveColor || 'rgba(118,118,128,0.18)';
    return (
      <div style={{ ...ios.naturalPanel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', gap: 10 }}>
        <span style={ios.label}>{component.props.label || '启用'}</span>
        <div style={{ width: 46, height: 28, borderRadius: 999, background: checked ? activeColor : inactiveColor, position: 'relative', flexShrink: 0, transition: 'background 0.2s', boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.05)' }}>
          <div style={{ width: 24, height: 24, borderRadius: 999, background: '#fff', position: 'absolute', top: 2, left: checked ? 20 : 2, boxShadow: '0 2px 6px rgba(0,0,0,0.18)', transition: 'left 0.2s' }} />
        </div>
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
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
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
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [{ key: 'onChange', label: '值变化', description: '值改变时触发' }],
  defaultSize: { w: 220, h: 52 },
  render: ({ component }: { component: DesignComponent }) => {
    const max = component.props.max || 5;
    const val = component.props.defaultValue || 3;
    const activeColor = component.props.activeColor || '#ff9500';
    const inactiveColor = component.props.inactiveColor || '#e5e5ea';
    return (
      <div style={{ ...ios.naturalPanel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', gap: 8 }}>
        <span style={ios.label}>{component.props.label || '评分'}</span>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0, alignItems: 'center' }}>
          {Array.from({ length: max }, (_, i) => (
            <span key={i} style={{ fontSize: 20, color: i < val ? activeColor : inactiveColor }}>★</span>
          ))}
          {component.props.showText && <span style={{ fontSize: 12, color: '#8e8e93', marginLeft: 4 }}>{val}/{max}</span>}
        </div>
      </div>
    );
  },
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
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'btn_submit' },
    { key: 'variant', label: '样式', type: 'select', group: '基础', options: [
      { label: '主要', value: 'primary' }, { label: '默认', value: 'default' },
      { label: '危险', value: 'danger' }, { label: '幽灵', value: 'ghost' },
    ]},
    { key: 'disabled', label: '禁用', type: 'boolean', group: '基础' },
    { key: 'loading', label: '加载中', type: 'boolean', group: '基础' },
    { key: 'icon', label: '图标 (emoji)', type: 'string', group: '基础', placeholder: '🚀' },
    { key: 'fontSize', label: '字号', type: 'number', group: '样式', min: 10, max: 32 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '样式', options: [
      { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '半粗', value: '600' }, { label: '粗体', value: '700' },
    ]},
    { key: 'color', label: '文字颜色', type: 'color', group: '样式' },
    { key: 'backgroundColor', label: '自定义背景色', type: 'color', group: '样式' },
    { key: 'borderRadius', label: '圆角', type: 'number', group: '样式', min: 0, max: 50 },
    { key: 'fullWidth', label: '满宽', type: 'boolean', group: '样式' },
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [{ key: 'onClick', label: '点击', description: '按钮点击时触发' }],
  defaultSize: { w: 180, h: 48 },
  render: ({ component }: { component: DesignComponent }) => {
    const p = component.props;
    const isPrimary = p.variant === 'primary';
    const isDanger = p.variant === 'danger';
    const isGhost = p.variant === 'ghost';
    const bg = p.backgroundColor || (isPrimary ? 'linear-gradient(180deg, #0a84ff 0%, #007aff 100%)' : isDanger ? 'linear-gradient(180deg, #ff453a 0%, #ff3b30 100%)' : isGhost ? 'transparent' : 'rgba(118,118,128,0.10)');
    const textColor = p.color || (isPrimary || isDanger ? '#fff' : isGhost ? '#007aff' : '#007aff');
    return (
      <div style={{ width: '100%', height: '100%', minWidth: 0, display: 'flex', alignItems: 'flex-start', boxSizing: 'border-box', padding: 4 }}>
        <button style={{
          width: p.fullWidth ? '100%' : '100%', minWidth: 0, minHeight: 40, padding: '10px 14px',
          fontSize: p.fontSize || 16, fontWeight: p.fontWeight || 650,
          border: isGhost ? '1px solid rgba(0,122,255,0.3)' : 'none',
          borderRadius: p.borderRadius ?? 10, background: bg, color: textColor, cursor: 'default',
          ...controlText(),
          boxShadow: isPrimary || isDanger ? '0 4px 12px rgba(0,122,255,0.18)' : 'inset 0 1px 0 rgba(255,255,255,0.55)',
          backdropFilter: 'blur(20px)',
          opacity: p.disabled ? 0.5 : 1,
        }}>
          {p.icon && <span style={{ marginRight: 6 }}>{p.icon}</span>}
          {p.loading ? '加载中...' : (p.label || '按钮')}
        </button>
      </div>
    );
  },
});
