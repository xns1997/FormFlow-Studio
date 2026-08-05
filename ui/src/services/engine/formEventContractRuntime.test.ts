import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComponentNode } from '../../models';
import {
  FORM_EVENT_CONTRACT,
  FORM_EVENT_SCRIPT_ALIAS_KEYS,
} from '../../../../shared/formflow-core/formEventContract';
import {
  lintEventControlKeys,
  planEventControlKeys,
  resolveEventControlFieldName,
} from '../../../../shared/formflow-core/formEventControls';
import { createScriptExecutionScope, SCRIPT_ALIAS_KEYS } from '../config/scriptRuntime';
import { executeFormControlEvent } from './formEventExecutor';

function makeComponent(overrides: Partial<ComponentNode> & { id: string; type: string }): ComponentNode {
  return {
    name: '',
    label: '',
    props: {},
    layout: { row: 0, col: 0, colSpan: 1, rowSpan: 1 },
    ports: [],
    events: [],
    ...overrides,
  };
}

// 覆盖 fieldBinding/name/props.name 组合、纯 ID、重复字段名、ID 撞字段名、
// 中文与空格名、tabs/table 控件等键派生矩阵。
const fixtureComponents: ComponentNode[] = [
  makeComponent({ id: 'c-plain', type: 'input', name: 'customerName', props: { name: 'customerName' } }),
  makeComponent({ id: 'c-fb-only', type: 'input', fieldBinding: 'employeeId' }),
  makeComponent({ id: 'c-fb-diff', type: 'input', fieldBinding: 'approvalId', props: { name: 'displayName' } }),
  makeComponent({ id: 'c-name-props', type: 'input', name: 'legacyName', props: { name: 'canonicalName' } }),
  makeComponent({ id: 'c-id-only', type: 'input' }),
  makeComponent({ id: 'c-dup-a', type: 'input', name: 'duplicateField' }),
  makeComponent({ id: 'c-dup-b', type: 'input', name: 'duplicateField' }),
  makeComponent({ id: 'c-comment', type: 'textarea', name: '审批意见' }),
  makeComponent({ id: 'c-space', type: 'input', name: '含 空格' }),
  makeComponent({ id: 'c-tabs', type: 'tabs', name: 'tabPanel' }),
  makeComponent({ id: 'c-table', type: 'table', name: 'resultTable' }),
  makeComponent({ id: 'duplicateField', type: 'input', name: 'collisionName' }),
];

const eventContext = {
  eventName: 'onChange' as const,
  field: 'customerName',
  value: '新客户',
  values: { customerName: '新客户' },
  originalValues: { customerName: '旧客户' },
  detail: { source: 'audit' },
  component: fixtureComponents[0],
};

async function executeReturningContext(code: string) {
  const writes: Array<[string, unknown]> = [];
  const result = await executeFormControlEvent(eventContext, {
    workflows: [],
    components: fixtureComponents,
    setValue: (field, value) => { writes.push([field, value]); },
    setVisible: () => {},
    setDisabled: () => {},
    setRequired: () => {},
    code,
  });
  assert.equal(result.error, undefined);
  return { writes, ctx: result.callbackResult as Record<string, unknown> };
}

test('runtime ctx keys and controls aliases match the contract and the shared key plan exactly', async () => {
  const { ctx } = await executeReturningContext('return ctx;');

  // 1. ctx 自有键集合与契约成员集合完全相等（含 internal 成员）。
  const contractKeys = FORM_EVENT_CONTRACT.map((member) => member.name).sort();
  assert.deepEqual(Object.keys(ctx).sort(), contractKeys, 'runtime ctx keys must equal contract keys');

  // 2. 方法成员可调用，值成员存在。
  for (const member of FORM_EVENT_CONTRACT) {
    if (member.kind === 'method') {
      assert.equal(typeof ctx[member.name], 'function', `contract method missing at runtime: ${member.name}`);
    } else {
      assert.ok(member.name in ctx, `contract value missing at runtime: ${member.name}`);
    }
  }

  // 3. controls 键集合与共享键计划完全一致，且归属句柄正确（重复字段名后写覆盖）。
  const plan = planEventControlKeys(fixtureComponents);
  const expectedOwners = new Map<string, ComponentNode>();
  for (const assignment of plan) expectedOwners.set(assignment.key, fixtureComponents[assignment.componentIndex]);
  const controls = ctx.controls as Record<string, { id: string; name: string; type: string; component: ComponentNode }>;
  assert.deepEqual(Object.keys(controls).sort(), [...expectedOwners.keys()].sort(), 'controls keys must match shared key plan');
  for (const [key, owner] of expectedOwners) {
    const handle = controls[key];
    assert.equal(handle.id, owner.id, `controls["${key}"] must point to the planned owner`);
    assert.equal(handle.name, resolveEventControlFieldName(owner), `controls["${key}"].name must use canonical derivation`);
    assert.equal(handle.component, owner, `controls["${key}"].component must be the source component`);
    for (const field of ['value', 'visible', 'disabled', 'required']) {
      assert.ok(field in handle, `controls["${key}"] must expose ${field}`);
    }
  }

  // 4. 撞键 lint 覆盖重复字段名与 ID 别名被跳过两类问题。
  const issues = lintEventControlKeys(fixtureComponents);
  assert.ok(issues.some((issue) => issue.kind === 'duplicate-field-name' && issue.key === 'duplicateField'));
  assert.ok(issues.some((issue) => issue.kind === 'id-collision' && issue.key === 'duplicateField'));
});

test('control handle value/visible/disabled/required writes are routed through the host spies', async () => {
  const visibleCalls: Array<[string, boolean]> = [];
  const disabledCalls: Array<[string, boolean]> = [];
  const requiredCalls: Array<[string, boolean]> = [];
  const result = await executeFormControlEvent(eventContext, {
    workflows: [],
    components: fixtureComponents,
    setValue: () => {},
    setVisible: (componentId, visible) => { visibleCalls.push([componentId, visible]); },
    setDisabled: (componentId, disabled) => { disabledCalls.push([componentId, disabled]); },
    setRequired: (field, required) => { requiredCalls.push([field, required]); },
    code: `async (ctx) => {
      ctx.controls.duplicateField.value = 42;
      ctx.controls['含 空格'].visible = false;
      ctx.controls.resultTable.disabled = true;
      ctx.controls.customerName.required = true;
      return {
        value: ctx.controls.duplicateField.value,
        visible: ctx.controls['含 空格'].visible,
        disabled: ctx.controls.resultTable.disabled,
        required: ctx.controls.customerName.required,
      };
    }`,
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(visibleCalls, [['c-space', false]]);
  assert.deepEqual(disabledCalls, [['c-table', true]]);
  assert.deepEqual(requiredCalls, [['customerName', true]]);
  assert.deepEqual(result.callbackResult, { value: 42, visible: false, disabled: true, required: true });
});

test('script scope binds every top-level alias from the contract and keeps sandbox legacy aliases host-driven', async () => {
  const { ctx } = await executeReturningContext('return ctx;');
  const scope = createScriptExecutionScope(ctx, { writeLog: () => {} });
  for (const member of FORM_EVENT_CONTRACT.filter((item) => item.topLevelAlias)) {
    assert.ok(member.name in scope, `script scope missing top-level alias: ${member.name}`);
    if (member.kind === 'method') {
      assert.equal(typeof scope[member.name], 'function', `top-level alias must be callable: ${member.name}`);
    }
  }
  assert.equal(scope.originalValues, ctx.originalValues, 'originalValues fallback must resolve');
  // 控件事件 ctx 只暴露契约键；遗留别名不属于契约，因此不会出现在控件事件脚本里。
  for (const legacy of ['setField', 'validateField', 'updateRow', 'submit', 'getState', 'originalData']) {
    assert.equal(legacy in scope, false, `control-event scope must not bind non-contract alias: ${legacy}`);
  }
  // 行为脚本沙箱把遗留 API 放进 ctx，createScriptExecutionScope 应继续按清单绑定。
  const sandboxLikeContext = {
    ...ctx,
    setField: () => {},
    validateField: () => true,
    updateRow: () => {},
    submit: () => {},
    getState: () => ({}),
  };
  const sandboxScope = createScriptExecutionScope(sandboxLikeContext, { writeLog: () => {} });
  for (const legacy of ['setField', 'validateField', 'updateRow', 'submit', 'getState']) {
    assert.equal(typeof sandboxScope[legacy], 'function', `sandbox legacy alias must stay bindable: ${legacy}`);
    assert.ok(SCRIPT_ALIAS_KEYS.includes(legacy), `sandbox legacy alias must stay in SCRIPT_ALIAS_KEYS: ${legacy}`);
  }
  assert.ok(FORM_EVENT_SCRIPT_ALIAS_KEYS.every((key) => key in scope), 'contract top-level aliases must all be bound');
});
