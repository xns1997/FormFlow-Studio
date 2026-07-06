import React from 'react';
import { registerControl } from '../registry';
import type { DesignComponent } from '../../project/types';
import { controlText, ios } from './styles';
import type { PreviewControlRuntime } from '../types';

registerControl({
  type: 'container', label: '容器', category: 'container', icon: '📦',
  defaultProps: {
    title: '容器标题', subtitle: '', name: '',
    background: 'rgba(255,255,255,0.72)', borderRadius: 10, padding: 12,
  },
  propSchema: [
    { key: 'title', label: '标题', type: 'string', group: '基础' },
    { key: 'subtitle', label: '副标题', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'background', label: '背景色', type: 'color', group: '样式' },
    { key: 'borderRadius', label: '圆角', type: 'number', group: '样式', min: 0, max: 50 },
    { key: 'padding', label: '内边距', type: 'number', group: '样式', min: 0, max: 50 },
  ],
  eventSchema: [],
  defaultSize: { w: 360, h: 200 },
  render: ({ component }: { component: DesignComponent }) => (
    <div style={{ width: '100%', height: '100%', minWidth: 0, boxSizing: 'border-box', padding: '0 2px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {component.props.title && (
        <div style={{ fontSize: 12, fontWeight: 650, color: '#8e8e93', padding: '6px 4px 4px', textTransform: 'uppercase', flexShrink: 0 }}>
          {component.props.title}
        </div>
      )}
      <div style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        background: component.props.background || 'rgba(255,255,255,0.72)',
        borderRadius: component.props.borderRadius ?? 10,
        padding: component.props.padding ?? 12,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), inset 0 0 0 0.5px rgba(60,60,67,0.10)',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
      }}>
        {component.props.subtitle && (
          <div style={{ padding: '0 0 6px', fontSize: 11, color: '#8e8e93', marginBottom: 6 }}>{component.props.subtitle}</div>
        )}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c7c7cc', fontSize: 12 }}>
          拖入控件到此区域
        </div>
      </div>
    </div>
  ),
});

registerControl({
  type: 'card', label: '卡片', category: 'container', icon: '🃏',
  defaultProps: {
    title: '分组标题', subtitle: '', name: '',
    background: 'rgba(255,255,255,0.72)', borderRadius: 10, padding: 10,
    shadow: true, borderColor: 'rgba(60,60,67,0.10)',
    rangeRef: null,
  },
  propSchema: [
    { key: 'title', label: '标题', type: 'string', group: '基础' },
    { key: 'subtitle', label: '副标题', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'background', label: '背景色', type: 'color', group: '样式' },
    { key: 'borderRadius', label: '圆角', type: 'number', group: '样式', min: 0, max: 50 },
    { key: 'padding', label: '内边距', type: 'number', group: '样式', min: 0, max: 50 },
    { key: 'shadow', label: '阴影', type: 'boolean', group: '样式' },
    { key: 'borderColor', label: '边框颜色', type: 'color', group: '样式' },
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [{ key: 'onDrop', label: '放入控件', description: '控件放入卡片时触发' }],
  defaultSize: { w: 360, h: 220 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    return (
      <div onDragOver={(event) => { if (mode === 'preview') event.preventDefault(); }} onDrop={(event) => { if (mode !== 'preview') return; event.preventDefault(); const text = event.dataTransfer.getData('text/plain'); runtime?.emit('onDrop', text, { text, files: Array.from(event.dataTransfer.files), types: Array.from(event.dataTransfer.types) }); }} style={{ width: '100%', height: '100%', minWidth: 0, boxSizing: 'border-box', padding: '0 2px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {component.props.title && (
        <div style={controlText({ fontSize: 12, fontWeight: 650, color: '#8e8e93', padding: '6px 4px 4px', textTransform: 'uppercase', flexShrink: 0 })}>
          {component.props.title}
        </div>
        )}
        <div style={{
          ...ios.glass, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
          background: component.props.background || 'rgba(255,255,255,0.72)',
          borderRadius: component.props.borderRadius ?? 10,
          padding: component.props.padding ?? 10,
          boxShadow: component.props.shadow !== false ? '0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.65)' : 'none',
          borderColor: component.props.borderColor || 'rgba(60,60,67,0.10)',
          justifyContent: 'flex-start',
          alignItems: 'stretch',
        }}>
          {component.props.subtitle && (
          <div style={{ padding: '0 0 6px', fontSize: 11, color: '#8e8e93', borderBottom: '0.5px solid rgba(60,60,67,0.08)', marginBottom: 6 }}>{component.props.subtitle}</div>
          )}
        </div>
      </div>
    );
  },
});

registerControl({
  type: 'tabs', label: '标签页', category: 'container', icon: '📑',
  defaultProps: {
    tabs: ['选项一', '选项二', '选项三'], defaultTab: 0, name: '',
    style: 'segmented', activeColor: '#007aff', inactiveColor: '#8e8e93',
  },
  propSchema: [
    { key: 'tabs', label: '标签名 (JSON)', type: 'json', group: '基础' },
    { key: 'defaultTab', label: '默认选中', type: 'number', group: '基础', min: 0 },
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'style', label: '样式', type: 'select', group: '样式', options: [
      { label: '分段', value: 'segmented' }, { label: '下划线', value: 'underline' }, { label: '胶囊', value: 'pill' },
    ]},
    { key: 'activeColor', label: '激活颜色', type: 'color', group: '样式' },
    { key: 'inactiveColor', label: '未激活颜色', type: 'color', group: '样式' },
  ],
  eventSchema: [{ key: 'onTabChange', label: '切换标签', description: '切换标签页时触发' }],
  defaultSize: { w: 360, h: 220 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const tabs = component.props.tabs || ['选项一', '选项二'];
    const activeColor = component.props.activeColor || '#007aff';
    const inactiveColor = component.props.inactiveColor || '#8e8e93';
    const active = Number(runtime?.value ?? component.props.defaultTab ?? 0);
    return (
      <div style={{ width: '100%', height: '100%', minWidth: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6, padding: 6, overflow: 'hidden' }}>
        <div style={{ display: 'flex', minWidth: 0, background: 'rgba(118,118,128,0.10)', borderRadius: 9, padding: 2, flexShrink: 0 }}>
          {tabs.map((t: string, i: number) => (
            <button type="button" key={i} onClick={() => mode === 'preview' && runtime?.emit('onTabChange', i, { index: i, label: t })} style={{
              flex: 1, minWidth: 0, padding: '5px 6px', fontSize: 13, fontWeight: 600, textAlign: 'center', borderRadius: 7,
              border: 'none', cursor: mode === 'preview' ? 'pointer' : 'default',
              background: i === active ? 'rgba(255,255,255,0.8)' : 'transparent',
              color: i === active ? activeColor : inactiveColor,
              boxShadow: i === active ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              backdropFilter: 'blur(20px)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {t}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0, background: 'rgba(118,118,128,0.06)', borderRadius: 10 }} />
      </div>
    );
  },
});

registerControl({
  type: 'steps', label: '步骤条', category: 'container', icon: '🪜',
  defaultProps: {
    steps: ['开始', '处理', '完成'], defaultStep: 0, name: '',
    activeColor: '#2563eb', inactiveColor: '#94a3b8',
  },
  propSchema: [
    { key: 'steps', label: '步骤名 (JSON)', type: 'json', group: '基础' },
    { key: 'defaultStep', label: '默认步骤', type: 'number', group: '基础', min: 0 },
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'activeColor', label: '激活颜色', type: 'color', group: '样式' },
    { key: 'inactiveColor', label: '未激活颜色', type: 'color', group: '样式' },
  ],
  eventSchema: [{ key: 'onChange', label: '切换步骤', description: '切换步骤时触发' }],
  defaultSize: { w: 360, h: 96 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const steps = component.props.steps || ['开始', '处理', '完成'];
    const activeColor = component.props.activeColor || '#2563eb';
    const inactiveColor = component.props.inactiveColor || '#94a3b8';
    const active = Number(runtime?.value ?? component.props.defaultStep ?? 0);
    return (
      <div style={{ width: '100%', height: '100%', minWidth: 0, boxSizing: 'border-box', display: 'flex', gap: 8, padding: 8, overflow: 'hidden' }}>
        {steps.map((step: string, index: number) => {
          const done = index < active;
          const isActive = index === active;
          return (
            <button
              key={index}
              type="button"
              disabled={mode !== 'preview'}
              onClick={() => runtime?.emit('onChange', index, { index, label: step })}
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                borderRadius: 16,
                background: done || isActive ? 'rgba(37,99,235,0.12)' : 'rgba(148,163,184,0.12)',
                color: done || isActive ? activeColor : inactiveColor,
                padding: '10px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                alignItems: 'center',
                cursor: mode === 'preview' ? 'pointer' : 'default',
              }}
            >
              <span style={{ width: 28, height: 28, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: done || isActive ? activeColor : '#cbd5e1', color: '#fff', fontSize: 12, fontWeight: 700 }}>{done ? '✓' : index + 1}</span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600 }}>{step}</span>
            </button>
          );
        })}
      </div>
    );
  },
});

registerControl({
  type: 'divider', label: '分割线', category: 'container', icon: '➖',
  defaultProps: { orientation: 'horizontal', color: 'rgba(60,60,67,0.12)', thickness: 0.5, margin: 0 },
  propSchema: [
    { key: 'orientation', label: '方向', type: 'select', group: '基础', options: [
      { label: '水平', value: 'horizontal' }, { label: '垂直', value: 'vertical' },
    ]},
    { key: 'color', label: '颜色', type: 'color', group: '样式' },
    { key: 'thickness', label: '粗细', type: 'number', group: '样式', min: 0.5, max: 5, step: 0.5 },
    { key: 'margin', label: '间距', type: 'number', group: '样式', min: 0, max: 50 },
  ],
  eventSchema: [],
  defaultSize: { w: 240, h: 16 },
  render: ({ component }: { component: DesignComponent }) => {
    const color = component.props.color || 'rgba(60,60,67,0.12)';
    const thickness = component.props.thickness || 0.5;
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={component.props.orientation === 'vertical' ? { width: thickness, height: '100%', background: color } : { width: '100%', height: thickness, background: color }} />
      </div>
    );
  },
});
