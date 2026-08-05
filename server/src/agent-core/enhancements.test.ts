import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.FORMFLOW_DATABASE_REQUIRED = 'false';
process.env.FORMFLOW_DATABASE_AUTO_START = 'false';
const testRoot = mkdtempSync(join(tmpdir(), 'agent-core-enhancements-'));
process.env.AGENT_THREAD_STORE_PATH = join(testRoot, 'threads.json');
process.env.AGENT_BUNDLE_STORE_PATH = join(testRoot, 'bundles.json');
process.env.FORMFLOW_PROJECTS_DIR = join(testRoot, 'projects');
process.env.FORMFLOW_DATA_DIR = join(testRoot, 'data');
process.env.AGENT_ARTIFACT_STORE_PATH = join(testRoot, 'artifacts');
process.env.AGENT_CHECKPOINT_STORE_PATH = join(testRoot, 'checkpoints');

const { executeLlmTool } = await import('../services/llm-tools');
const { projectPackagePath } = await import('../services/project-package-store');
const { llmProviderClient } = await import('../services/llm-provider-client');
const {
  createAgentThread, executePlan, getAgentThread, initializeAgentStore, saveAgentThread,
  storeAgentArtifact, readAgentArtifact, getCapabilityBundle,
} = await import('./index');
const { maybeCompactContext, maxPromptChars } = await import('./context');
const { runFinalGates, missingTaskDeliverables } = await import('./gates');
const { defaultCapabilityBundle } = await import('./store');

test.after(() => rmSync(testRoot, { recursive: true, force: true }));

const run = { tenantId: 'local', userId: 'local', requestId: 'req_enhance' };

function confirmedPlan(thread: any, tasks: any[]) {
  const now = new Date().toISOString();
  thread.plan = {
    id: 'plan_enhance',
    revision: 1,
    request: '增强测试计划',
    goal: '完成增强能力验证',
    successCriteria: ['可验证'],
    summary: '',
    assumptions: [],
    risks: [],
    status: 'confirmed',
    createdAt: now,
    tasks,
  };
  return thread;
}

function makeTask(id: string, title: string, instruction: string, scope: any, access: any, projectId?: string) {
  const now = new Date().toISOString();
  return { id, title, instruction, scope, access, projectId, acceptance: ['满足验收'], status: 'pending', attempt: 0, maxAttempts: 3, toolSteps: 0, evidence: [], createdAt: now, updatedAt: now };
}

test('batch reads run up to three read tools in one step', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.create', { id: 'batch_ok', name: '批量只读', idempotencyKey: 'batch-k1' }, { tenantId: run.tenantId, projectId: 'batch_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true);
  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, projectIds: ['batch_ok'], currentProjectId: 'batch_ok', profileId: 'default-cloud' });
  confirmedPlan(thread, [makeTask('r1', '只读核对', '核对项目现状', 'project', 'read', 'batch_ok')]);
  saveAgentThread(thread);

  let index = 0;
  await executePlan(thread, run, {
    decide: async () => {
      if (index === 0) {
        index += 1;
        return {
          action: 'act', summary: '批量读取',
          batchReads: [
            { toolName: 'project.get', arguments: { projectId: 'batch_ok' } },
            { toolName: 'project.validate', arguments: { projectId: 'batch_ok' } },
          ],
          taskId: 'r1',
        };
      }
      return { action: 'complete', summary: '完成', completeTaskIds: ['r1'], finalAnswer: '完成' };
    },
    selfReview: async () => ({ issues: [] }),
  });

  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'completed');
  assert.ok(final.events.some((event) => event.type === 'batch_reads_completed' && event.data?.ok === 2));
  const observed = final.events.filter((event) => event.type === 'tool_observation').map((event) => event.data?.toolName);
  assert.ok(observed.includes('project.get'));
  assert.ok(observed.includes('project.validate'));
});

test('revision conflict auto-refreshes and retries instead of failing', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.create', { id: 'conflict_ok', name: '冲突前', idempotencyKey: 'conf-k1' }, { tenantId: run.tenantId, projectId: 'conflict_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true);
  const first = await executeLlmTool('project.get', { projectId: 'conflict_ok' }, { tenantId: run.tenantId, projectId: 'conflict_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  const staleRevision = (first as any).data.revision;
  // 用外部写操作把 revision 推到最新，制造「线程缓存过期」。
  const bumped = await executeLlmTool('project.update', {
    projectId: 'conflict_ok', baseRevision: staleRevision, idempotencyKey: 'conf-bump', config: { description: '外部修改' },
  }, { tenantId: run.tenantId, projectId: 'conflict_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(bumped.ok, true, JSON.stringify(bumped));

  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, projectIds: ['conflict_ok'], currentProjectId: 'conflict_ok', profileId: 'default-cloud' });
  thread.projectRevisions.conflict_ok = staleRevision;
  confirmedPlan(thread, [makeTask('u1', '更新项目名称', '把项目名称改为 冲突后', 'project', 'write', 'conflict_ok')]);
  saveAgentThread(thread);

  let index = 0;
  await executePlan(thread, run, {
    decide: async () => {
      if (index === 0) {
        index += 1;
        return { action: 'act', summary: '更新名称', toolName: 'project.update', scope: 'project', arguments: { projectId: 'conflict_ok', config: { name: '冲突后' } }, taskId: 'u1' };
      }
      return { action: 'complete', summary: '完成', completeTaskIds: ['u1'], finalAnswer: '完成' };
    },
    selfReview: async () => ({ issues: [] }),
  });

  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'completed');
  assert.ok(final.events.some((event) => event.type === 'recovery_retry' && event.data?.failureClass === 'revision_conflict'));
  const project = await executeLlmTool('project.get', { projectId: 'conflict_ok' }, { tenantId: run.tenantId, projectId: 'conflict_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal((project as any).data.project.config.name, '冲突后');
});

test('context.read_artifact returns a bounded window of a stored result', async () => {
  await initializeAgentStore();
  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, profileId: 'default-cloud' });
  const bigPayload = { rows: Array.from({ length: 400 }, (_, i) => ({ id: i, value: `row-${i}-${'x'.repeat(20)}` })) };
  const meta = await storeAgentArtifact(thread.id, 'tool_result', bigPayload, '大结果');
  const artifactId = meta.id;
  confirmedPlan(thread, [makeTask('a1', '回读 artifact', '核对完整结果', 'project', 'read')]);
  saveAgentThread(thread);

  let index = 0;
  await executePlan(thread, run, {
    decide: async () => {
      if (index === 0) {
        index += 1;
        return { action: 'act', summary: '回读', toolName: 'context.read_artifact', scope: 'project', arguments: { artifactId, offset: 0, limit: 200 }, taskId: 'a1' };
      }
      return { action: 'complete', summary: '完成', completeTaskIds: ['a1'], finalAnswer: '完成' };
    },
    selfReview: async () => ({ issues: [] }),
  });

  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'completed');
  const observation = final.events.filter((event) => event.type === 'tool_observation').find((event) => event.data?.toolName === 'context.read_artifact');
  assert.ok(observation);
  assert.ok(String(observation!.data.evidence?.[0] || '').length <= 200);
  const reread = await readAgentArtifact(thread.id, artifactId);
  assert.ok(reread);
  assert.equal((reread!.payload as any).rows.length, 400);
});

test('context compaction keeps a structured contract and trims old messages', async () => {
  await initializeAgentStore();
  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, profileId: 'default-cloud' });
  confirmedPlan(thread, [makeTask('c1', '创建表单', '创建表单 f1', 'form', 'write')]);
  thread.summary = '';
  for (let i = 0; i < 30; i += 1) {
    (thread as any).messages.push({ id: `m${i}`, role: 'user', kind: 'prompt', content: `第 ${i} 条很长的历史消息：${'长'.repeat(120)}`, createdAt: new Date().toISOString() });
  }
  saveAgentThread(thread);
  const bundle = defaultCapabilityBundle();
  bundle.context.maxPromptChars = 1;
  assert.equal(maxPromptChars(bundle), 1);

  await maybeCompactContext(thread, bundle, run);

  assert.ok(thread.context, '压缩后必须生成结构化契约');
  assert.equal(thread.context!.goal, '完成增强能力验证');
  assert.ok(thread.context!.remainingWork.some((item) => item.includes('创建表单')));
  assert.ok(thread.messages.length < 30);
  assert.ok(thread.events.some((event) => event.type === 'context_compacted'));
  assert.equal(thread.turnMetrics?.compactions, 1);
});

test('pre-existing test failures do not block completion but introduced ones do', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.create', { id: 'test_gate', name: '测试门禁', idempotencyKey: 'gate-k1' }, { tenantId: run.tenantId, projectId: 'test_gate', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true);
  // 注入一个必然失败的套件（引用不存在的表单）。
  const testingPath = join(projectPackagePath('test_gate'), 'testing', 'testing.json');
  writeFileSync(testingPath, JSON.stringify({
    profiles: [],
    fixtures: [],
    runs: [],
    suites: [{ id: 'suite_fail', title: '失败套件', cases: [{ id: 'c1', category: 'business', formId: 'no_such_form', values: {}, expectValid: true }] }],
  }, null, 2));
  const loaded = await executeLlmTool('project.get', { projectId: 'test_gate' }, { tenantId: run.tenantId, projectId: 'test_gate', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  const revision = (loaded as any).data.revision;

  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, projectIds: ['test_gate'], currentProjectId: 'test_gate', profileId: 'default-cloud' });
  confirmedPlan(thread, [makeTask('w1', '写一个表单', '创建表单 f1', 'form', 'write', 'test_gate')]);
  thread.projectRevisions.test_gate = revision;
  thread.testBaseline = { capturedAt: new Date().toISOString(), passed: false, failures: ['用例「c1」：表单不存在'] };
  const preexisting = await runFinalGates(thread, run, ['form']);
  assert.equal(preexisting.passed, true, `预存失败不应阻塞：${preexisting.failures.join('；')}`);

  const after = await executeLlmTool('project.get', { projectId: 'test_gate' }, { tenantId: run.tenantId, projectId: 'test_gate', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  thread.projectRevisions.test_gate = (after as any).data.revision;
  thread.testBaseline = { capturedAt: new Date().toISOString(), passed: true, failures: [] };
  const introduced = await runFinalGates(thread, run, ['form']);
  assert.equal(introduced.passed, false, '引入失败必须阻塞');
  assert.ok(introduced.failures.some((item) => item.includes('新增失败')));
});

test('empty-table tasks are not treated as data-write tasks', () => {
  const project = {
    config: { id: 'p' },
    srcTable: [{ id: 'sales', sheets: [{ name: 'Sheet1', rowCount: 0, config: { keyFields: ['日期', '产品'] } }] }],
    forms: [],
    workflows: [],
  };
  const now = new Date().toISOString();
  const emptyTask: any = { id: 't2', title: '创建 sales 数据表（空表）', instruction: '创建 sales 数据表（空表，这一步不要写入行数据）', scope: 'data', access: 'write', projectId: 'p', acceptance: [], status: 'pending', attempt: 0, maxAttempts: 3, toolSteps: 0, evidence: [], createdAt: now, updatedAt: now };
  const writeTask: any = { id: 't3', title: '写入示例数据', instruction: '向数据表 sales 写入 5 行业务数据', scope: 'data', access: 'write', projectId: 'p', acceptance: [], status: 'pending', attempt: 0, maxAttempts: 3, toolSteps: 0, evidence: [], createdAt: now, updatedAt: now };
  assert.deepEqual(missingTaskDeliverables(project as any, emptyTask), [], '空表任务不应要求行数据');
  assert.deepEqual(missingTaskDeliverables(project as any, writeTask), ['数据表 sales 的行数据'], '写数据任务应要求行数据');
});

test('deliverable check matches id-before-noun phrasing', () => {
  const now = new Date().toISOString();
  const project = { config: { id: 'p' }, srcTable: [{ id: 'department', sheets: [{ name: 'Sheet1', rowCount: 0, config: { keyFields: ['部门编号'] } }] }], forms: [], workflows: [] };
  const createTask: any = { id: 't2', title: '创建部门表', instruction: '创建 department 数据表，包含列：部门编号、部门名，并设置主键为 部门编号', scope: 'data', access: 'write', projectId: 'p', acceptance: [], status: 'pending', attempt: 0, maxAttempts: 3, toolSteps: 0, evidence: [], createdAt: now, updatedAt: now };
  assert.deepEqual(missingTaskDeliverables(project as any, createTask), [], 'id 前置写法应能识别已存在的表');
  const emptyProject = { config: { id: 'p' }, srcTable: [], forms: [], workflows: [] };
  assert.deepEqual(missingTaskDeliverables(emptyProject as any, createTask), ['数据表 department'], '表不存在时应报告缺失');
});

test('quality gate ignores unrelated completeness blockers', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.create', { id: 'quality_scope', name: '质量作用域', idempotencyKey: 'qscope-k1' }, { tenantId: run.tenantId, projectId: 'quality_scope', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true);
  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, projectIds: ['quality_scope'], currentProjectId: 'quality_scope', profileId: 'default-cloud' });
  confirmedPlan(thread, [makeTask('q1', '运行回归', '运行项目回归测试', 'quality', 'read', 'quality_scope')]);
  thread.projectRevisions.quality_scope = (created as any).meta?.revision;
  thread.testBaseline = { capturedAt: new Date().toISOString(), passed: true, failures: [] };
  // 计划只含 quality 只读任务：项目无表单不应阻塞（该阻塞与本计划无关）。
  const gate = await runFinalGates(thread, run, ['quality']);
  assert.equal(gate.passed, true, `无关阻塞不应阻塞：${gate.failures.join('；')}`);

  const thread2 = createAgentThread({ tenantId: run.tenantId, userId: run.userId, projectIds: ['quality_scope'], currentProjectId: 'quality_scope', profileId: 'default-cloud' });
  confirmedPlan(thread2, [makeTask('f1', '创建表单', '创建表单 my_form', 'form', 'write', 'quality_scope')]);
  thread2.projectRevisions.quality_scope = (created as any).meta?.revision;
  thread2.testBaseline = { capturedAt: new Date().toISOString(), passed: true, failures: [] };
  // 计划承诺创建表单但项目没有表单：应阻塞。
  const gate2 = await runFinalGates(thread2, run, ['form', 'quality']);
  assert.equal(gate2.passed, false, '计划内表单缺失必须阻塞');
  assert.ok(gate2.failures.some((item) => item.includes('质量门禁未通过')));
});

test('replan in plan mode supersedes remaining tasks and waits for confirmation', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.create', { id: 'replan_ok', name: '重规划', idempotencyKey: 'replan-k1' }, { tenantId: run.tenantId, projectId: 'replan_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true);
  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, projectIds: ['replan_ok'], currentProjectId: 'replan_ok', profileId: 'default-cloud' });
  confirmedPlan(thread, [
    makeTask('t1', '已完成任务', '已完成', 'project', 'write', 'replan_ok'),
    makeTask('t2', '剩余任务', '创建表单 f1', 'form', 'write', 'replan_ok'),
  ]);
  thread.plan!.tasks[0].status = 'passed';
  saveAgentThread(thread);

  const originalChat = llmProviderClient.chat;
  llmProviderClient.chat = (async (input: any) => ({
    content: '',
    model: 'test',
    usage: {},
    toolCalls: [],
    structured: {
      goal: '重规划后的目标',
      successCriteria: ['新验收'],
      summary: '只保留剩余任务',
      assumptions: [],
      risks: [],
      tasks: [
        { id: 't3', title: '新建剩余任务', instruction: '创建表单 f2', scope: 'form', access: 'write', projectId: 'replan_ok', acceptance: ['表单存在'] },
      ],
    },
    requestId: input.requestId,
  })) as any;
  try {
    await executePlan(thread, run, {
      decide: async () => ({ action: 'replan', summary: '调整方向', replanReason: '原任务范围变化，只保留剩余工作' }),
      selfReview: async () => ({ issues: [] }),
    });
  } finally {
    llmProviderClient.chat = originalChat;
  }

  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'awaiting_plan_approval');
  assert.equal(final.plan!.revision, 2);
  assert.equal(final.plan!.tasks[0].id, 't3');
  assert.ok(final.plan!.tasks.every((task: any) => task.status === 'pending'));
  assert.ok(final.events.some((event) => event.type === 'plan_proposed'));
});
