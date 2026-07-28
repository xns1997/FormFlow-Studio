import test from 'node:test';
import assert from 'node:assert/strict';
import './controls';
import { getAllControls, hydrateControlComponent } from './registry';
import { isCompositePropDef } from './types';
import { createDesignFile } from '../project/types';

test('每个公开属性都声明运行时消费契约且不再暴露旧绑定入口', () => {
  const controls = getAllControls();
  assert.equal(controls.length, 26);
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

test('表单窗体是设计文件的固有几何，不是公开控件', () => {
  assert.equal(getAllControls().some((control) => control.type === 'form'), false);
  const design = createDesignFile('订单表单');
  assert.ok(design.formWindow.width > 0);
  assert.ok(design.formWindow.height > 0);
  assert.equal(design.components.some((component) => component.type === 'form'), false);
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
