import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignComponent } from '../../project/types';
import type { CompositePropDef, PropDef } from '../types';
import {
  deepEqualPropertyValue,
  getPropertyStatus,
  propertyStatusLabel,
  resolvePropertyGroup,
} from './propertyMenuModel';

const component: DesignComponent = {
  id: 'number-1', type: 'number', x: 40, y: 60, width: 240, height: 72, props: {},
};

test('旧中文分组归一化为稳定的功能、样式任务', () => {
  assert.deepEqual(resolvePropertyGroup({ key: 'required', label: '必填', type: 'boolean', group: '校验' }), {
    id: 'validation', label: '校验', section: 'function', task: 'validation', order: 20, defaultOpen: true,
  });
  assert.equal(resolvePropertyGroup({ key: 'color', label: '颜色', type: 'color', group: '文本样式' }).section, 'style');
  assert.equal(resolvePropertyGroup({ key: 'pluginValue', label: '插件值', type: 'string', group: '插件扩展' }).task, 'other');
});

test('默认值深比较保留 false、0、空字符串与空集合语义', () => {
  assert.equal(deepEqualPropertyValue(false, false), true);
  assert.equal(deepEqualPropertyValue(false, undefined), false);
  assert.equal(deepEqualPropertyValue(0, 0), true);
  assert.equal(deepEqualPropertyValue(0, undefined), false);
  assert.equal(deepEqualPropertyValue('', ''), true);
  assert.equal(deepEqualPropertyValue([], []), true);
  assert.equal(deepEqualPropertyValue({}, {}), true);
});

test('标量、Composite 和 geometry 使用同一修改状态模型', () => {
  const base = { values: { integerOnly: false, min: 0, max: 10 }, defaults: { integerOnly: false, min: 0, max: 10 }, component, components: [component], defaultSize: { w: 240, h: 72 } };
  const scalar: PropDef = { key: 'integerOnly', label: '仅整数', type: 'boolean' };
  const composite: CompositePropDef = { kind: 'composite', key: 'range', keys: ['min', 'max'], label: '数值范围', editor: 'number-range' };
  const geometry: PropDef = { key: 'width', label: '宽度', type: 'number', target: 'geometry' };
  assert.equal(getPropertyStatus({ def: scalar, ...base }).changed, false);
  assert.equal(getPropertyStatus({ def: composite, ...base }).changed, false);
  assert.equal(getPropertyStatus({ def: geometry, ...base }).changed, false);
  assert.equal(getPropertyStatus({ def: scalar, ...base, values: { ...base.values, integerOnly: true } }).changed, true);
  assert.equal(getPropertyStatus({ def: composite, ...base, values: { ...base.values, max: 12 } }).changed, true);
  assert.equal(getPropertyStatus({ def: geometry, ...base, component: { ...component, width: 300 } }).changed, true);
});

test('问题状态优先于已修改数量', () => {
  assert.equal(propertyStatusLabel([
    { changed: true, diagnostics: [] },
    { changed: true, diagnostics: [{ severity: 'warning', message: '字段失效' }] },
    { changed: false, diagnostics: [{ severity: 'error', message: '表达式循环' }] },
  ]), '错误 1 / 警告 1');
  assert.equal(propertyStatusLabel([{ changed: true, diagnostics: [] }, { changed: false, diagnostics: [] }]), '已修改 1 项');
  assert.equal(propertyStatusLabel([{ changed: false, diagnostics: [] }]), '');
});
