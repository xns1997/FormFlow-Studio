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
const {
  createAgentThread, executeAction, executePlan, getAgentThread, initializeAgentStore, saveAgentThread,
} = await import('./index');

test.after(() => rmSync(testRoot, { recursive: true, force: true }));

const run = { tenantId: 'local', userId: 'local', requestId: 'req_test' };

function confirmedPlan(thread: AgentThread, tasks: NonNullable<AgentThread['plan']>['tasks']) {
  const now = new Date().toISOString();
  thread.plan = {
    id: 'plan_loop',
    revision: 1,
    request: '测试计划',
    goal: '完成测试',
    successCriteria: ['项目可读'],
    summary: '',
    assumptions: [],
    risks: [],
    status: 'confirmed',
    createdAt: now,
    tasks,
  };
  return thread;
}

test('single loop executes write tasks, verifies and completes', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.initialize', { id: 'loop_ok', name: 'Loop 测试', templateId: 'game_analytics', idempotencyKey: 'loop-k1' }, { tenantId: run.tenantId, projectId: 'loop_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true);

  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, projectIds: ['loop_ok'], currentProjectId: 'loop_ok', profileId: 'default-cloud' });
  const now = new Date().toISOString();
  confirmedPlan(thread, [
    { id: 't1', title: '更新项目名称', instruction: '把项目名称改为 Loop 测试已更新', scope: 'project', access: 'write', projectId: 'loop_ok', acceptance: ['名称已更新'], status: 'pending', attempt: 0, maxAttempts: 3, toolSteps: 0, evidence: [], createdAt: now, updatedAt: now },
    { id: 't2', title: '创建测试表单', instruction: '创建 id 为 f1 的表单', scope: 'form', access: 'write', projectId: 'loop_ok', acceptance: ['表单存在'], status: 'pending', attempt: 0, maxAttempts: 3, toolSteps: 0, evidence: [], createdAt: now, updatedAt: now },
  ]);
  saveAgentThread(thread);

  const steps: LoopDecision[] = [
    { action: 'act', summary: '更新项目', toolName: 'project.update', scope: 'project', arguments: { projectId: 'loop_ok', config: { name: 'Loop 测试已更新' } }, taskId: 't1' },
    { action: 'act', summary: '创建表单', toolName: 'form.create', scope: 'form', arguments: { projectId: 'loop_ok', id: 'f1', name: '测试表单' }, taskId: 't2' },
    { action: 'complete', summary: '全部完成', completeTaskIds: ['t1', 't2'], finalAnswer: '完成' },
  ];
  let index = 0;
  await executePlan(thread, run, { decide: async () => steps[Math.min(index++, steps.length - 1)] });

  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'completed');
  assert.equal(final.plan?.status, 'executed');
  assert.equal(final.plan?.tasks.every((task) => task.status === 'passed'), true);
  assert.ok(final.projectRevisions['loop_ok']);
  const project = await executeLlmTool('project.get', { projectId: 'loop_ok' }, { tenantId: run.tenantId, projectId: 'loop_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal((project as any).data?.project?.config?.name, 'Loop 测试已更新');
  const forms = await executeLlmTool('form.list', { projectId: 'loop_ok' }, { tenantId: run.tenantId, projectId: 'loop_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'form' });
  assert.ok((forms as any).data?.some((form: any) => form.id === 'f1'));
});

test('destructive tool pauses for user approval and pendingApproval is recorded', async () => {
  await initializeAgentStore();
  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, projectIds: ['loop_ok'], currentProjectId: 'loop_ok', profileId: 'default-cloud' });
  const now = new Date().toISOString();
  confirmedPlan(thread, [
    { id: 'del', title: '删除测试表单', instruction: '删除 id 为 f1 的表单', scope: 'form', access: 'write', projectId: 'loop_ok', acceptance: ['表单已删除'], status: 'pending', attempt: 0, maxAttempts: 3, toolSteps: 0, evidence: [], createdAt: now, updatedAt: now },
  ]);
  saveAgentThread(thread);

  await executePlan(thread, run, { decide: async () => ({ action: 'act', summary: '删除表单', toolName: 'form.delete', scope: 'form', arguments: { projectId: 'loop_ok', id: 'f1' }, taskId: 'del' }) });
  const waiting = getAgentThread(thread.id)!;
  assert.equal(waiting.status, 'awaiting_operation_approval');
  assert.ok(waiting.pendingApproval);
  assert.equal(waiting.pendingApproval!.toolName, 'form.delete');

  const approved = await executeLlmTool('form.delete', { ...waiting.pendingApproval!.arguments, confirmationToken: waiting.pendingApproval!.confirmation.token }, { tenantId: run.tenantId, projectId: 'loop_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'form' });
  assert.equal(approved.ok, true);
});

test('repeated no-progress pauses the loop and asks the user', async () => {
  await initializeAgentStore();
  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, projectIds: ['loop_ok'], currentProjectId: 'loop_ok', profileId: 'default-cloud' });
  const now = new Date().toISOString();
  confirmedPlan(thread, [
    { id: 'bad', title: '写入不存在的项目', instruction: '尝试写入缺失项目', scope: 'form', access: 'write', projectId: 'missing', acceptance: ['写入成功'], status: 'pending', attempt: 0, maxAttempts: 3, toolSteps: 0, evidence: [], createdAt: now, updatedAt: now },
  ]);
  saveAgentThread(thread);

  await executePlan(thread, run, {
    decide: async () => ({ action: 'act', summary: '尝试写入', toolName: 'form.create', scope: 'form', arguments: { projectId: 'missing', id: 'f2', name: 'x' }, taskId: 'bad' }),
  });
  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'paused');
  const question = final.messages.find((message) => message.kind === 'question');
  assert.ok(question);
  assert.ok(question!.questions?.length, '暂停提问必须携带结构化问题');
  assert.match(question!.questions![0].question, /连续失败/);
  assert.ok(question!.questions![0].context?.includes('当前任务'), '问题需说明当前卡在哪个任务');
  assert.ok(question!.questions![0].context?.includes('最近失败'), '问题需说明最近一次失败原因');
  assert.ok(question!.questions![0].options?.some((option) => option.label.includes('继续')), '问题需提供可一键回复的选项');
  assert.ok(final.events.some((event) => event.type === 'question_asked'));
});

test('user steer after a stall resets no-progress and the loop completes', async () => {
  await initializeAgentStore();
  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, profileId: 'default-cloud' });
  const now = new Date().toISOString();
  confirmedPlan(thread, [
    { id: 'read1', title: '只读核对', instruction: '核对项目现状', scope: 'project', access: 'read', acceptance: ['已核对'], status: 'pending', attempt: 0, maxAttempts: 3, toolSteps: 0, evidence: [], createdAt: now, updatedAt: now },
  ]);
  thread.status = 'paused';
  thread.consecutiveNoProgress = 2;
  thread.pendingSteer = '继续，先做只读核对';
  saveAgentThread(thread);

  await executePlan(thread, run, {
    decide: async () => ({ action: 'complete', summary: '核对完成', completeTaskIds: ['read1'], finalAnswer: '完成' }),
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

test('write task with cyclic rule code fails formal verification and cannot complete', async () => {
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

  // 直接注入静态分析拦不住的运行时循环（rule_code.update 会拒绝该代码，这里模拟已存在的坏规则）。
  const behaviorsPath = join(projectPackagePath('loop_verify'), 'forms', 'calc.behaviors.json');
  const behaviors = JSON.parse(readFileSync(behaviorsPath, 'utf8'));
  behaviors.ruleCode = 'compute $A = $B + 1 watch($B)\ncompute $B = $A + 1 watch($A)';
  writeFileSync(behaviorsPath, JSON.stringify(behaviors, null, 2));

  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, projectIds: ['loop_verify'], currentProjectId: 'loop_verify', profileId: 'default-cloud' });
  const now = new Date().toISOString();
  confirmedPlan(thread, [
    { id: 't1', title: '编写计算规则', instruction: '为 calc 表单编写计算规则并通过形式化验证', scope: 'behavior', access: 'write', projectId: 'loop_verify', acceptance: ['规则通过形式化验证'], status: 'pending', attempt: 0, maxAttempts: 2, toolSteps: 0, evidence: [], createdAt: now, updatedAt: now },
  ]);
  saveAgentThread(thread);

  let index = 0;
  await executePlan(thread, run, {
    decide: async () => {
      if (index === 0) {
        index += 1;
        return { action: 'complete', summary: '声称完成', completeTaskIds: ['t1'], finalAnswer: '完成' };
      }
      return { action: 'pause', summary: '停止', questions: [] };
    },
  });

  const final = getAgentThread(thread.id)!;
  assert.notEqual(final.status, 'completed');
  const task = final.plan!.tasks[0];
  assert.ok(['failed', 'blocked'].includes(task.status), task.status);
  assert.match(task.error || '', /形式化验证/);
});
