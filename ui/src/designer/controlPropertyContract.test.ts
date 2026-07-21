import test from 'node:test';
import assert from 'node:assert/strict';
import './controls';
import { getAllControls, hydrateControlComponent } from './registry';
import { isCompositePropDef } from './types';

test('每个公开属性都声明运行时消费契约且不再暴露旧绑定入口', () => {
  const controls = getAllControls();
  assert.equal(controls.length, 27);
  for (const control of controls) {
    assert.ok(control.propertyContract, `${control.type} 缺少 propertyContract`);
    for (const def of control.propSchema) {
      const keys = isCompositePropDef(def) ? def.keys : [def.key];
      for (const key of keys) assert.ok(control.propertyContract?.[key], `${control.type}.${key} 没有消费分类`);
      if (!isCompositePropDef(def)) assert.notEqual(def.key, 'rangeRef', `${control.type} 仍暴露旧 rangeRef`);
    }
    for (const key of Object.keys(control.defaultProps)) assert.ok(control.propertyContract?.[key], `${control.type}.${key} 默认值没有消费分类`);
  }
});

test('表单宽高写入几何而不是 props', () => {
  const form = getAllControls().find((control) => control.type === 'form');
  assert.equal(form?.propSchema.find((def) => !isCompositePropDef(def) && def.key === 'width')?.target, 'geometry');
  assert.equal(form?.propertyContract?.width, 'geometry');
  assert.equal(form?.propertyContract?.height, 'geometry');
});

test('历史组件载入时补齐初始属性且保留明确的 false 和空值', () => {
  const hydrated = hydrateControlComponent({
    id: 'legacy-number', type: 'number', x: 0, y: 0, width: 220, height: 72,
    props: { required: false, placeholder: '' },
  });
  assert.equal(hydrated.props.required, false);
  assert.equal(hydrated.props.placeholder, '');
  assert.equal(hydrated.props.readonly, false);
  assert.equal(hydrated.props.disabled, false);
  assert.equal(hydrated.props.integer, false);
  assert.equal(hydrated.props.positive, false);
  assert.equal(hydrated.props.customMessage, '请输入有效数字');
});
