import assert from 'node:assert/strict';
import test from 'node:test';
import { decodePropertyClipboard, encodePropertyClipboard, validatePropertyClipboard } from './propertyClipboard';

test('属性剪贴板只接受带版本标记且类型兼容的配置', () => {
  const text = encodePropertyClipboard({ editor: 'options', storageType: 'array', value: [{ label: 'A', value: 'a' }] });
  const payload = decodePropertyClipboard(text);
  assert.equal(payload.formflowProperty, 1);
  assert.equal(validatePropertyClipboard(payload, { key: 'options', label: '选项', type: 'array', editor: 'options' }), null);
  assert.match(validatePropertyClipboard(payload, { key: 'count', label: '数量', type: 'number' }) || '', /不兼容/);
  assert.throws(() => decodePropertyClipboard('{"value":1}'), /没有可识别/);
});

test('Composite 剪贴板至少包含一个目标属性', () => {
  const payload = decodePropertyClipboard(encodePropertyClipboard({ editor: 'number-range', storageType: 'composite', value: { min: 1, max: 3 } }));
  assert.equal(validatePropertyClipboard(payload, { kind: 'composite', key: 'range', keys: ['min', 'max'], label: '范围', editor: 'number-range' }), null);
  assert.match(validatePropertyClipboard(payload, { kind: 'composite', key: 'spacing', keys: ['top'], label: '间距', editor: 'spacing' }) || '', /缺少/);
});
