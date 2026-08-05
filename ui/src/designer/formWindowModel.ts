import { createDefaultFormWindow, type DesignComponent, type FormWindowConfig } from '../project/types';
import type { ControlDef } from './types';

/** 表单窗体在画布网格中的单元格 ID。 */
export const FORM_WINDOW_CELL_ID = '__formflow_form_window__';

const defaults = createDefaultFormWindow();

/**
 * 表单窗体是每个表单固有的设计对象。它复用属性面板契约，
 * 但不注册进控件目录，因此不会出现在工具箱里，也不能被新增或删除。
 */
export const FORM_WINDOW_CONTROL: ControlDef = {
  type: 'formWindow',
  label: '表单窗体',
  category: 'container',
  icon: '▣',
  defaultProps: defaults.props,
  propSchema: [
    { key: 'title', label: '标题', type: 'string', group: '基础' },
    { key: 'subtitle', label: '副标题', type: 'string', group: '基础' },
    { key: 'width', label: '宽度', type: 'number', target: 'geometry', group: '尺寸', min: 320 },
    { key: 'height', label: '高度', type: 'number', target: 'geometry', group: '尺寸', min: 240 },
    { key: 'background', label: '背景色', type: 'color', group: '样式' },
    { key: 'padding', label: '内边距', type: 'number', editor: 'spacing', group: '样式' },
    { key: 'borderRadius', label: '圆角', type: 'number', editor: 'radius', group: '样式' },
    { key: 'submitText', label: '提交按钮', type: 'string', group: '底部' },
    { key: 'resetText', label: '重置按钮', type: 'string', group: '底部' },
    { key: 'showFooter', label: '显示底栏', type: 'boolean', group: '底部' },
  ],
  eventSchema: [],
  defaultSize: { w: defaults.width, h: defaults.height },
  render: () => null,
};

/** 窗口配置 → 设计组件（窗体占位）。 */
export function formWindowToComponent(formWindow: FormWindowConfig): DesignComponent {
  return {
    id: FORM_WINDOW_CELL_ID,
    type: FORM_WINDOW_CONTROL.type,
    x: formWindow.x,
    y: formWindow.y,
    width: formWindow.width,
    height: formWindow.height,
    props: formWindow.props,
    locked: true,
    zIndex: -1000,
  };
}
