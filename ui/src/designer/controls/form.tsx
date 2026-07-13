import React from 'react';
import { registerControl } from '../registry';
import type { DesignComponent } from '../../project/types';
import { controlText } from './styles';
import type { PreviewControlRuntime } from '../types';
import { spacingToCss } from '../../services/style/propertyStyles';

registerControl({
  type: 'form', label: '表单窗体', category: 'container', icon: '📋',
  defaultProps: {
    title: '表单标题',
    subtitle: '',
    background: '#f2f2f7',
    padding: 20,
    borderRadius: 12,
    submitText: '提交',
    resetText: '重置',
    showFooter: true,
  },
  propSchema: [
    { key: 'title', label: '标题', type: 'string', group: '基础' },
    { key: 'subtitle', label: '副标题', type: 'string', group: '基础' },
    { key: 'width', label: '宽度', type: 'number', target: 'geometry', group: '尺寸', min: 320 },
    { key: 'height', label: '高度', type: 'number', target: 'geometry', group: '尺寸', min: 240 },
    { key: 'background', label: '背景色', type: 'color', group: '样式' },
    { key: 'padding', label: '内边距', type: 'number', editor: 'spacing', group: '样式', help: '兼容原有统一数字；编辑后可分别设置四个方向。' },
    { key: 'borderRadius', label: '圆角', type: 'number', editor: 'radius', group: '样式' },
    { key: 'submitText', label: '提交按钮', type: 'string', group: '底部' },
    { key: 'resetText', label: '重置按钮', type: 'string', group: '底部' },
    { key: 'showFooter', label: '显示底栏', type: 'boolean', group: '底部' },
  ],
  eventSchema: [
    { key: 'onSubmit', label: '提交', description: '表单提交时触发' },
    { key: 'onReset', label: '重置', description: '表单重置时触发' },
  ],
  defaultSize: { w: 640, h: 720 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const p = component.props;
    return (
      <div style={{
        width: '100%', height: '100%', minWidth: 0, boxSizing: 'border-box',
        background: p.background || '#f2f2f7',
        borderRadius: p.borderRadius ?? 12,
        padding: spacingToCss(p.padding, 20),
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ marginBottom: 18, paddingTop: 2, flexShrink: 0, minWidth: 0 }}>
          <div style={controlText({ fontSize: 30, fontWeight: 750, color: '#1c1c1e', lineHeight: 1.12 })}>{p.title || '表单'}</div>
          {p.subtitle && <div style={controlText({ fontSize: 14, color: '#8e8e93', marginTop: 5 })}>{p.subtitle}</div>}
        </div>
        <div style={{
          flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.72)', borderRadius: 10,
          backdropFilter: 'blur(22px) saturate(180%)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), inset 0 0 0 0.5px rgba(60,60,67,0.10), inset 0 1px 0 rgba(255,255,255,0.65)',
          minHeight: 0,
        }} />
        {p.showFooter !== false && (
          <div style={{ display: 'flex', minWidth: 0, gap: 8, marginTop: 16, flexShrink: 0 }}>
            <button type="button" onClick={() => mode === 'preview' && runtime?.emit('onReset', {})} style={{ flex: 1, minWidth: 0, padding: '11px 14px', fontSize: 16, fontWeight: 650, border: 'none', borderRadius: 10, background: 'rgba(118,118,128,0.10)', color: '#007aff', cursor: mode === 'preview' ? 'pointer' : 'default', backdropFilter: 'blur(20px)', ...controlText() }}>
              {p.resetText || '重置'}
            </button>
            <button type="button" onClick={() => mode === 'preview' && runtime?.emit('onSubmit', runtime.values)} style={{ flex: 2, minWidth: 0, padding: '11px 14px', fontSize: 16, fontWeight: 650, border: 'none', borderRadius: 10, background: 'linear-gradient(180deg, #0a84ff 0%, #007aff 100%)', color: '#fff', cursor: mode === 'preview' ? 'pointer' : 'default', boxShadow: '0 4px 12px rgba(0,122,255,0.18)', ...controlText() }}>
              {p.submitText || '提交'}
            </button>
          </div>
        )}
      </div>
    );
  },
});
