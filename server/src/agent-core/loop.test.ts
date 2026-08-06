import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { AgentThread, LoopDecision } from './types';

process.env.FORMFLOW_DATABASE_REQUIRED = 'false';
process.env.FORMFLOW_DATABASE_AUTO_START = 'false';
const testRoot = mkdtempSync(join(tmpdir(), 'agent-core-loop-'));
process.env.AGENT_THREAD_STORE_PATH = join(testRoot, 'threads.json');
process.env.AGENT_BUNDLE_STORE_PATH = join(testRoot, 'bundles.json');
process.env.FORMFLOW_PROJECTS_DIR = join(testRoot, 'projects');
process.env.FORMFLOW_DATA_DIR = join(testRoot, 'data');

const { executeLlmTool } = await import('../services/llm-tools');
const { projectPackagePath } = await import('../services/project-package-store');
const { goalDeliverableGaps } = await import('./gates');
const {
  createAgentThread, executeAction, getAgentThread, initializeAgentStore, runTurn, saveAgentThread,
} = await import('./index');

test.after(() => rmSync(testRoot, { recursive: true, force: true }));

const run = { tenantId: 'local', userId: 'local', requestId: 'req_test' };

function threadWithPlan(projectIds: string[] = [], currentProjectId?: string): AgentThread {
  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, projectIds, currentProjectId, profileId: 'default-cloud' });
  const now = new Date().toISOString();
  thread.dynamicPlan = {
    goal: '完成测试',
    successCriteria: ['项目可读'],
    summary: '',
    steps: ['建数据表', '建表单'],
    assumptions: [],
    risks: [],
    updatedAt: now,
    updatedBy: 'system',
  };
  thread.status = 'idle';
  thread.turns = [];
  thread.turnId = undefined;
  saveAgentThread(thread);
  return thread;
}

test('single turn executes tools dynamically and completes without confirmation', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.initialize', { id: 'loop_ok', name: 'Loop 测试', templateId: 'game_analytics', idempotencyKey: 'loop-k1' }, { tenantId: run.tenantId, projectId: 'loop_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true);

  const thread = threadWithPlan(['loop_ok'], 'loop_ok');
  const steps: LoopDecision[] = [
    { action: 'act', summary: '更新项目', toolName: 'project.update', scope: 'project', arguments: { projectId: 'loop_ok', config: { name: 'Loop 测试已更新' } } },
    { action: 'complete', summary: '全部完成', finalAnswer: '完成' },
  ];
  let index = 0;
  await runTurn(thread, run, {
    decide: async () => steps[Math.min(index++, steps.length - 1)],
    selfReview: async () => ({ issues: [] }),
  });

  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'completed');
  assert.equal(final.turns.at(-1)?.status, 'completed');
  assert.ok(final.events.some((event) => event.type === 'verification.completed'), '写后应运行验证引擎');
  const project = await executeLlmTool('project.get', { projectId: 'loop_ok' }, { tenantId: run.tenantId, projectId: 'loop_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal((project as any).data?.project?.config?.name, 'Loop 测试已更新');
});

test('plan.update revises the dynamic plan and emits plan.updated', async () => {
  await initializeAgentStore();
  const thread = threadWithPlan(['loop_ok'], 'loop_ok');
  const steps: LoopDecision[] = [
    { action: 'act', summary: '调整计划', toolName: 'plan.update', scope: 'project', arguments: { steps: ['先建表', '再建表单', '最后验证'] } },
    { action: 'complete', summary: '完成', finalAnswer: '完成' },
  ];
  let index = 0;
  await runTurn(thread, run, {
    decide: async () => steps[Math.min(index++, steps.length - 1)],
    selfReview: async () => ({ issues: [] }),
  });
  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'completed');
  assert.equal(final.dynamicPlan?.steps.length, 3);
  assert.equal(final.dynamicPlan?.updatedBy, 'model');
  assert.ok(final.events.some((event) => event.type === 'plan.updated'));
});

test('destructive tool pauses for user approval and pendingApproval carries turnId', async () => {
  await initializeAgentStore();
  const thread = threadWithPlan(['loop_ok'], 'loop_ok');
  await runTurn(thread, run, {
    decide: async () => ({ action: 'act', summary: '删除表单', toolName: 'form.delete', scope: 'form', arguments: { projectId: 'loop_ok', id: 'f1' } }),
    selfReview: async () => ({ issues: [] }),
  });
  const waiting = getAgentThread(thread.id)!;
  assert.equal(waiting.status, 'awaiting_operation_approval');
  assert.ok(waiting.pendingApproval);
  assert.equal(waiting.pendingApproval!.toolName, 'form.delete');
  assert.equal(waiting.pendingApproval!.turnId, waiting.turnId);
});

test('no-progress auto-continues and escalates to blocked instead of pausing repeatedly', async () => {
  await initializeAgentStore();
  const thread = threadWithPlan(['loop_ok'], 'loop_ok');
  await runTurn(thread, run, {
    decide: async () => { throw new Error('决策无效，无法选择合法工具'); },
    selfReview: async () => ({ issues: [] }),
  });
  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'blocked');
  assert.ok(final.events.some((event) => event.type === 'no_progress_auto_continue'), '应记录自动继续事件');
  assert.equal(final.messages.filter((message) => message.kind === 'question').length, 1, '只在收敛后 blocked 提问一次');
});

test('verification read tools are exempt from the read-before-write guard', async () => {
  await initializeAgentStore();
  const thread = threadWithPlan(['loop_ok'], 'loop_ok');
  let reads = 0;
  await runTurn(thread, run, {
    decide: async () => {
      reads += 1;
      return { action: 'act', summary: '运行校验', toolName: 'project.validate', scope: 'project', arguments: { projectId: 'loop_ok' } };
    },
    selfReview: async () => ({ issues: [] }),
  });
  const final = getAgentThread(thread.id)!;
  assert.ok(reads >= 2, '验证类只读应被执行');
  assert.ok(!final.events.some((event) => event.type === 'tool_observation' && /本轮已拒绝只读工具/.test(String(event.data?.summary || ''))), '验证类只读不应被只读护栏拦截');
  assert.ok(['blocked', 'paused'].includes(final.status), '纯只读最终由无进展收敛收尾');
});

test('steer after a stall resets counters and the loop completes', async () => {
  await initializeAgentStore();
  const thread = threadWithPlan(['loop_ok'], 'loop_ok');
  thread.status = 'paused';
  thread.consecutiveNoProgress = 2;
  thread.pendingSteer = '继续，先做只读核对';
  saveAgentThread(thread);
  await runTurn(thread, run, {
    decide: async () => ({ action: 'complete', summary: '完成', finalAnswer: '完成' }),
    selfReview: async () => ({ issues: [] }),
  });
  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'completed');
  assert.equal(final.consecutiveNoProgress, 0);
  assert.ok(final.events.some((event) => event.type === 'steer_applied'));
});

test('creating a project binds the thread to the new project', async () => {
  await initializeAgentStore();
  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, profileId: 'default-cloud' });
  saveAgentThread(thread);
  const bundle = (await import('./store')).getCapabilityBundle('cap_default_v1', 'local')!;
  await executeAction(thread, run, {
    action: 'act',
    summary: '创建项目',
    toolName: 'project.create',
    scope: 'project',
    arguments: { id: 'bound_demo', name: '绑定测试' },
  }, bundle);
  assert.ok(thread.projectIds.includes('bound_demo'));
  assert.equal(thread.currentProjectId, 'bound_demo');
  assert.ok(thread.events.some((event) => event.type === 'thread_project_bound'));
});

test('cyclic rule code fails final formal verification and cannot complete', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.create', { id: 'loop_verify', name: '验证循环', idempotencyKey: 'loop-v1' }, { tenantId: run.tenantId, projectId: 'loop_verify', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true, JSON.stringify(created));
  const loaded = await executeLlmTool('project.get', { projectId: 'loop_verify' }, { tenantId: run.tenantId, projectId: 'loop_verify', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  const form = await executeLlmTool('form.create', {
    projectId: 'loop_verify', id: 'calc', name: '计算', baseRevision: (loaded as any).data.revision, idempotencyKey: 'loop-form',
    design: {
      id: 'calc-design', name: '计算', formMode: 'edit',
      components: [
        { id: 'A', type: 'number', fieldBinding: 'A', props: { name: 'A' } },
        { id: 'B', type: 'number', fieldBinding: 'B', props: { name: 'B' } },
        { id: 'C', type: 'number', fieldBinding: 'C', props: { name: 'C' } },
      ],
      bindings: [],
    },
  }, { tenantId: run.tenantId, projectId: 'loop_verify', userId: run.userId, requestId: run.requestId, mcpRole: 'form' });
  assert.equal(form.ok, true, JSON.stringify(form));

  const behaviorsPath = join(projectPackagePath('loop_verify'), 'forms', 'calc.behaviors.json');
  const behaviors = JSON.parse(readFileSync(behaviorsPath, 'utf8'));
  behaviors.ruleCode = 'compute $A = $B + 1 watch($B)\ncompute $B = $A + 1 watch($A)';
  writeFileSync(behaviorsPath, JSON.stringify(behaviors, null, 2));

  const thread = threadWithPlan(['loop_verify'], 'loop_verify');
  thread.dynamicPlan = { ...thread.dynamicPlan!, goal: '为 calc 表单编写计算规则并通过形式化验证', successCriteria: ['规则通过形式化验证'], summary: '', steps: ['编写规则', '形式化验证'], assumptions: [], risks: [], updatedAt: new Date().toISOString(), updatedBy: 'system' };
  saveAgentThread(thread);

  await runTurn(thread, run, {
    decide: async () => ({ action: 'complete', summary: '声称完成', finalAnswer: '完成' }),
    selfReview: async () => ({ issues: [] }),
  });

  const final = getAgentThread(thread.id)!;
  assert.notEqual(final.status, 'completed');
  assert.ok(final.events.some((event) => event.type === 'gate_failed' && /形式化验证/.test(String(event.data?.failures?.join('') || ''))), '最终门禁应捕获循环规则');
});

test('goal deliverable gaps detect missing forms and rules', () => {
  const thread = threadWithPlan();
  thread.dynamicPlan = {
    ...thread.dynamicPlan!,
    goal: '生成设备台账查询修改表单与借用登记表单并配置行为规则',
    successCriteria: ['至少两个表单', '行为规则通过形式化验证', '内置示例数据'],
  };
  const project = {
    forms: [{ id: 'device_ledger_edit', ruleCode: '', behaviors: [] }],
    srcTable: [{ id: 'device_ledger', sheets: [{ rowCount: 0 }] }],
    workflows: [],
    outputs: [],
  };
  const gaps = goalDeliverableGaps(thread, project as any);
  assert.ok(gaps.some((item) => item.includes('2 个表单')), `缺少表单检查：${gaps.join('；')}`);
  assert.ok(gaps.some((item) => item.includes('表单缺少控件')), `缺少空表单检查：${gaps.join('；')}`);
  assert.ok(gaps.some((item) => item.includes('表单规则')), `缺少规则检查：${gaps.join('；')}`);
  assert.ok(gaps.some((item) => item.includes('示例')), `缺少示例数据检查：${gaps.join('；')}`);
});

test('goal deliverable gaps anchor to the user prompt even with a vague plan', () => {
  const thread = threadWithPlan();
  thread.messages.push({ id: 'm_u', role: 'user', kind: 'prompt', content: '创建设备台账查询修改表单与借用登记表单并配置行为规则，内置示例数据', createdAt: new Date().toISOString() });
  thread.dynamicPlan = { ...thread.dynamicPlan!, goal: '完成设备借出项目', successCriteria: ['项目可交付'] };
  const project = {
    forms: [{ id: 'f1', design: { components: [{ id: 'c1' }] } }],
    srcTable: [{ id: 'device', sheets: [{ rowCount: 0 }] }],
    workflows: [],
    outputs: [],
  };
  const gaps = goalDeliverableGaps(thread, project as any);
  assert.ok(gaps.some((item) => item.includes('2 个表单')), `提示词应锚定表单要求：${gaps.join('；')}`);
  assert.ok(gaps.some((item) => item.includes('表单规则')), `提示词应锚定规则要求：${gaps.join('；')}`);
  assert.ok(gaps.some((item) => item.includes('示例')), `提示词应锚定示例数据要求：${gaps.join('；')}`);
});

test('goal deliverable gaps ignore explicit non-creation tasks', () => {
  const thread = threadWithPlan();
  thread.messages.push({ id: 'm_neg', role: 'user', kind: 'prompt', content: '创建空项目，只填元信息：名称=员工信息管理，描述=包括数据录入、查询与编辑，标签=人力资源。不要创建数据表或表单。', createdAt: new Date().toISOString() });
  thread.dynamicPlan = { ...thread.dynamicPlan!, goal: '创建空项目', successCriteria: ['项目元信息完整'] };
  const project = { forms: [], srcTable: [], workflows: [], outputs: [] };
  assert.deepEqual(goalDeliverableGaps(thread, project as any), [], '明确不建表/表单的任务不应被误判交付物缺失');
});

test('completion is rejected when goal deliverables are missing', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.create', { id: 'deliv_miss', name: '交付物缺失', idempotencyKey: 'deliv-k1' }, { tenantId: run.tenantId, projectId: 'deliv_miss', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true, JSON.stringify(created));
  const loaded = await executeLlmTool('project.get', { projectId: 'deliv_miss' }, { tenantId: run.tenantId, projectId: 'deliv_miss', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  const form = await executeLlmTool('form.create', {
    projectId: 'deliv_miss', id: 'f1', name: '查询表单', baseRevision: (loaded as any).data.revision, idempotencyKey: 'deliv-f1',
    design: { id: 'd1', name: 'f1', formMode: 'edit', components: [], bindings: [] },
  }, { tenantId: run.tenantId, projectId: 'deliv_miss', userId: run.userId, requestId: run.requestId, mcpRole: 'form' });
  assert.equal(form.ok, true, JSON.stringify(form));

  const thread = threadWithPlan(['deliv_miss'], 'deliv_miss');
  thread.dynamicPlan = { ...thread.dynamicPlan!, goal: '生成查询表单与登记表单并配置行为规则', successCriteria: ['至少两个表单', '行为规则存在'] };
  saveAgentThread(thread);

  await runTurn(thread, run, {
    decide: async () => ({ action: 'complete', summary: '声称完成', finalAnswer: '完成' }),
    selfReview: async () => ({ issues: [] }),
  });
  const final = getAgentThread(thread.id)!;
  assert.notEqual(final.status, 'completed');
  assert.ok(final.events.some((event) => event.type === 'gate_failed' && /目标交付物缺失/.test(JSON.stringify(event.data))), '最终门禁应拒绝缺失交付物');
});

test('unbound thread cannot fake completion for a project-building goal', async () => {
  await initializeAgentStore();
  const thread = threadWithPlan();
  thread.dynamicPlan = { ...thread.dynamicPlan!, goal: '从零创建并交付一个设备借出项目', successCriteria: ['项目可交付'] };
  saveAgentThread(thread);
  await runTurn(thread, run, {
    decide: async () => ({ action: 'complete', summary: '声称完成', finalAnswer: '完成' }),
    selfReview: async () => ({ issues: [] }),
  });
  const final = getAgentThread(thread.id)!;
  assert.notEqual(final.status, 'completed');
  assert.ok(final.events.some((event) => event.type === 'gate_failed' && /尚未创建或绑定任何项目/.test(JSON.stringify(event.data))), '未建项目不得假完成');
});

test('missing linkage workflow is auto-created so completion can pass', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.create', { id: 'link_auto', name: '联动自动', idempotencyKey: 'link-auto-k1' }, { tenantId: run.tenantId, projectId: 'link_auto', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true, JSON.stringify(created));
  const loaded = await executeLlmTool('project.get', { projectId: 'link_auto' }, { tenantId: run.tenantId, projectId: 'link_auto', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  const table = await executeLlmTool('data_table.create', {
    projectId: 'link_auto', id: 'device', columns: [{ name: '编号', type: 'string' }, { name: '状态', type: 'string' }], keyFields: ['编号'],
    baseRevision: (loaded as any).data.revision, idempotencyKey: 'link-auto-t1',
  }, { tenantId: run.tenantId, projectId: 'link_auto', userId: run.userId, requestId: run.requestId, mcpRole: 'data' });
  assert.equal(table.ok, true, JSON.stringify(table));

  const thread = threadWithPlan(['link_auto'], 'link_auto');
  thread.dynamicPlan = { ...thread.dynamicPlan!, goal: '构建跨表状态联动流程', successCriteria: ['联动流程存在且含节点'] };
  saveAgentThread(thread);
  await runTurn(thread, run, {
    decide: async () => ({ action: 'complete', summary: '完成', finalAnswer: '完成' }),
    selfReview: async () => ({ issues: [] }),
  });
  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'completed', `自动生成联动流程后应可完成：${final.events.filter((event) => event.type === 'gate_failed').map((event) => JSON.stringify(event.data)).join('；')}`);
  assert.ok(final.events.some((event) => event.type === 'auto_repair' && event.data?.toolName === 'workflow.generate_from_table'), '应记录自动生成工作流事件');
});

test('missing form rule is auto-created so completion can pass', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.create', { id: 'rule_auto', name: '规则自动', idempotencyKey: 'rule-auto-k1' }, { tenantId: run.tenantId, projectId: 'rule_auto', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true, JSON.stringify(created));
  const loaded = await executeLlmTool('project.get', { projectId: 'rule_auto' }, { tenantId: run.tenantId, projectId: 'rule_auto', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  const table = await executeLlmTool('data_table.create', {
    projectId: 'rule_auto', id: 'employee', columns: [{ name: '员工编号', type: 'string' }, { name: '姓名', type: 'string' }, { name: '手机号', type: 'string' }],
    keyFields: ['员工编号'], rows: [{ 员工编号: 'E1', 姓名: '张三', 手机号: '13800000000' }],
    baseRevision: (loaded as any).data.revision, idempotencyKey: 'rule-auto-t1',
  }, { tenantId: run.tenantId, projectId: 'rule_auto', userId: run.userId, requestId: run.requestId, mcpRole: 'data' });
  assert.equal(table.ok, true, JSON.stringify(table));
  const loaded2 = await executeLlmTool('project.get', { projectId: 'rule_auto' }, { tenantId: run.tenantId, projectId: 'rule_auto', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  const form = await executeLlmTool('form.generate_from_table', {
    projectId: 'rule_auto', tableId: 'employee', sheetName: 'Sheet1', id: 'employee_edit', mode: 'create',
    baseRevision: (loaded2 as any).data.revision, idempotencyKey: 'rule-auto-f1',
  }, { tenantId: run.tenantId, projectId: 'rule_auto', userId: run.userId, requestId: run.requestId, mcpRole: 'form' });
  assert.equal(form.ok, true, JSON.stringify(form));

  const thread = threadWithPlan(['rule_auto'], 'rule_auto');
  thread.messages.push({ id: 'm_prompt', role: 'user', kind: 'prompt', content: '员工录入表单提交前校验 姓名 与 手机号 必填', createdAt: new Date().toISOString() });
  thread.dynamicPlan = { ...thread.dynamicPlan!, goal: '构建员工录入表单并配置提交前校验规则', successCriteria: ['表单规则存在'] };
  saveAgentThread(thread);
  await runTurn(thread, run, {
    decide: async () => ({ action: 'complete', summary: '完成', finalAnswer: '完成' }),
    selfReview: async () => ({ issues: [] }),
  });
  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'completed', `自动写入表单规则后应可完成：${final.events.filter((event) => event.type === 'gate_failed').map((event) => JSON.stringify(event.data)).join('；')}`);
  assert.ok(final.events.some((event) => event.type === 'auto_repair' && event.data?.toolName === 'rule_code.update'), '应记录自动写规则事件');
});

test('light completion gate validates deliverables without regression or preview', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.create', { id: 'light_ok', name: '轻量门禁', idempotencyKey: 'light-k1' }, { tenantId: run.tenantId, projectId: 'light_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true, JSON.stringify(created));
  const loaded = await executeLlmTool('project.get', { projectId: 'light_ok' }, { tenantId: run.tenantId, projectId: 'light_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  const table = await executeLlmTool('data_table.create', {
    projectId: 'light_ok', id: 'device', columns: [{ name: '编号', type: 'string' }], keyFields: ['编号'], rows: [{ 编号: 'D1' }],
    baseRevision: (loaded as any).data.revision, idempotencyKey: 'light-t1',
  }, { tenantId: run.tenantId, projectId: 'light_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'data' });
  assert.equal(table.ok, true, JSON.stringify(table));

  const thread = threadWithPlan(['light_ok'], 'light_ok');
  thread.dynamicPlan = { ...thread.dynamicPlan!, goal: '创建设备数据表', successCriteria: ['数据表存在'] };
  thread.completionGate = 'light';
  saveAgentThread(thread);
  await runTurn(thread, run, {
    decide: async () => ({ action: 'complete', summary: '完成', finalAnswer: '完成' }),
    selfReview: async () => ({ issues: [] }),
  });
  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'completed', '轻量门禁下应快速完成');
  const evidenceKinds = final.events.filter((event) => event.type === 'gate_evidence').map((event) => event.data?.kind);
  assert.ok(!evidenceKinds.includes('scenario_result'), '轻量门禁不应运行回归');
  assert.ok(!evidenceKinds.includes('delivery_preview'), '轻量门禁不应运行发布预检');
});

test('repeated lint without write auto-applies the rule', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.create', { id: 'lint_auto', name: 'lint 自动写入', idempotencyKey: 'lint-k1' }, { tenantId: run.tenantId, projectId: 'lint_auto', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true, JSON.stringify(created));
  const loaded = await executeLlmTool('project.get', { projectId: 'lint_auto' }, { tenantId: run.tenantId, projectId: 'lint_auto', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  const table = await executeLlmTool('data_table.create', {
    projectId: 'lint_auto', id: 'employee', columns: [{ name: '员工编号', type: 'string' }, { name: '姓名', type: 'string' }, { name: '手机号', type: 'string' }],
    keyFields: ['员工编号'], rows: [{ 员工编号: 'E1', 姓名: '张三', 手机号: '13800000000' }],
    baseRevision: (loaded as any).data.revision, idempotencyKey: 'lint-t1',
  }, { tenantId: run.tenantId, projectId: 'lint_auto', userId: run.userId, requestId: run.requestId, mcpRole: 'data' });
  assert.equal(table.ok, true, JSON.stringify(table));
  const loaded2 = await executeLlmTool('project.get', { projectId: 'lint_auto' }, { tenantId: run.tenantId, projectId: 'lint_auto', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  const form = await executeLlmTool('form.generate_from_table', {
    projectId: 'lint_auto', tableId: 'employee', sheetName: 'Sheet1', id: 'employee_edit', mode: 'create',
    baseRevision: (loaded2 as any).data.revision, idempotencyKey: 'lint-f1',
  }, { tenantId: run.tenantId, projectId: 'lint_auto', userId: run.userId, requestId: run.requestId, mcpRole: 'form' });
  assert.equal(form.ok, true, JSON.stringify(form));

  const thread = threadWithPlan(['lint_auto'], 'lint_auto');
  thread.messages.push({ id: 'm_lint', role: 'user', kind: 'prompt', content: '给员工录入表单配置规则：提交前校验 姓名 与 手机号 必填', createdAt: new Date().toISOString() });
  thread.dynamicPlan = { ...thread.dynamicPlan!, goal: '配置员工表单规则', successCriteria: ['表单规则存在'] };
  thread.completionGate = 'light';
  saveAgentThread(thread);
  const code = 'before submit -> require($姓名, $手机号)';
  let calls = 0;
  await runTurn(thread, run, {
    decide: async () => {
      calls += 1;
      if (calls <= 3) {
        return { action: 'act', summary: 'lint', toolName: 'rule_syntax.lint', scope: 'behavior', arguments: { projectId: 'lint_auto', formId: 'employee_edit', code } };
      }
      return { action: 'complete', summary: '完成', finalAnswer: '完成' };
    },
    selfReview: async () => ({ issues: [] }),
  });
  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'completed', '重复 lint 后应自动写入规则并完成');
  assert.ok(final.events.some((event) => event.type === 'auto_repair' && event.data?.toolName === 'rule_code.update'), '应记录自动写规则事件');
});
