import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignComponent } from '../../project/types';
import { executeDesignPreviewEvent, getDesignComponentField } from './designPreviewRuntime';

function component(eventName: string): DesignComponent {
  return {
    id: 'component_1',
    type: 'input',
    x: 0,
    y: 0,
    width: 200,
    height: 60,
    props: {
      name: 'customer',
      events: { [eventName]: 'ctx.setValue("observed", `${ctx.eventName}:${ctx.field}`);' },
    },
  };
}

test('preview runtime executes every declared interaction event through one context', async () => {
  const eventNames = ['onChange', 'onBlur', 'onFocus', 'onClick', 'onSubmit', 'onReset', 'onTabChange', 'onRowClick', 'onDrop'];
  for (const eventName of eventNames) {
    let observed: unknown;
    const target = component(eventName);
    const result = await executeDesignPreviewEvent({
      eventName,
      field: getDesignComponentField(target),
      value: 'value',
      values: { customer: 'value' },
      detail: { source: 'test' },
      component: target,
    }, {
      workflows: [],
      setValue: (field, value) => { if (field === 'observed') observed = value; },
    });
    assert.equal(result.error, undefined, eventName);
    assert.equal(result.codeExecuted, true, eventName);
    assert.equal(observed, `${eventName}:customer`, eventName);
  }
});

test('preview runtime lets event code control runtime-only component state', async () => {
  const target = component('onClick');
  target.props.events = {
    onClick: `
      await ctx.setVisible('component_1', false);
      await ctx.setDisabled('component_1', true);
      await ctx.setRequired('customer', true);
    `,
  };
  const calls = {
    visible: [] as Array<[string, boolean]>,
    disabled: [] as Array<[string, boolean]>,
    required: [] as Array<[string, boolean]>,
  };
  const result = await executeDesignPreviewEvent({
    eventName: 'onClick',
    field: 'customer',
    value: 'value',
    values: { customer: 'value' },
    component: target,
  }, {
    workflows: [],
    setValue: () => {},
    setVisible: (componentId, visible) => { calls.visible.push([componentId, visible]); },
    setDisabled: (componentId, disabled) => { calls.disabled.push([componentId, disabled]); },
    setRequired: (field, required) => { calls.required.push([field, required]); },
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(calls.visible, [['component_1', false]]);
  assert.deepEqual(calls.disabled, [['component_1', true]]);
  assert.deepEqual(calls.required, [['customer', true]]);
});

test('preview runtime reports a missing configured workflow without swallowing the failure', async () => {
  const target = component('onClick');
  target.props.flowTriggers = { onClick: { enabled: true, workflowId: 'missing' } };
  const originalConsoleError = console.error;
  console.error = () => {};
  const result = await executeDesignPreviewEvent({
    eventName: 'onClick', field: 'customer', value: '', values: {}, component: target,
  }, { workflows: [], setValue: () => {} });
  console.error = originalConsoleError;
  assert.match(result.error?.message || '', /找不到事件绑定的流程/);
});

test('preview runtime executes linkage rules before script and exposes a trace', async () => {
  const target = component('onChange');
  target.props.linkageRules = {
    onChange: [{
      id: 'rule-1',
      name: '默认联动',
      trigger: { eventName: 'onChange', sourceField: 'customer' },
      enabled: true,
      priority: 10,
      conditionMode: 'all',
      conditions: [{ id: 'cond-1', field: 'customer', operator: 'isNotEmpty' }],
      actions: [{ id: 'action-1', type: 'setValue', targetField: 'summary', valueSource: 'event' }],
    }],
  };
  target.props.events = { onChange: 'await ctx.setValue("scriptField", ctx.getValue("summary"));' };
  const writes: Array<[string, unknown]> = [];
  const result = await executeDesignPreviewEvent({
    eventName: 'onChange',
    field: 'customer',
    value: 'Ada',
    values: { customer: 'Ada' },
    component: target,
  }, {
    workflows: [],
    setValue: (field, value) => { writes.push([field, value]); },
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(writes, [['summary', 'Ada'], ['scriptField', 'Ada']]);
  assert.equal(result.trace.stages.some((stage) => stage.type === 'rule' && stage.status === 'success'), true);
  assert.equal(result.trace.stages.some((stage) => stage.type === 'script' && stage.status === 'success'), true);
});
