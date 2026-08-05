/**
 * 实战循环测试驱动（真实模型 + 真实 MCP 工具，进程内直连 agent-core）。
 *
 * 用法：
 *   npx tsx scripts/loop-test.mjs --prompt "<任务>" [--max-answers 4] [--max-approvals 2]
 *
 * 流程：goal 模式建线程 → planTurn（真实规划）→ 确认 → executePlan（真实决策循环）
 * → 暂停时模拟用户回答「继续，使用合理默认值」→ 破坏性操作自动批准
 * → 输出失败清单（tool_observation/task_failed/gate_failed/decision_failed）与指标。
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const PROMPT = arg('prompt', '');
const MAX_ANSWERS = Number(arg('max-answers', '4'));
const MAX_APPROVALS = Number(arg('max-approvals', '2'));
if (!PROMPT) {
  console.error('缺少 --prompt');
  process.exit(2);
}

const sandbox = mkdtempSync(join(tmpdir(), 'agent-loop-test-'));
process.env.FORMFLOW_DATABASE_REQUIRED = 'false';
process.env.FORMFLOW_DATABASE_AUTO_START = 'false';
process.env.FORMFLOW_PROJECTS_DIR = join(sandbox, 'projects');
// 不覆盖 FORMFLOW_DATA_DIR：llm-management.json（模型路由/密钥）来自真实 server/data。
process.env.AGENT_THREAD_STORE_PATH = join(sandbox, 'threads.json');
process.env.AGENT_BUNDLE_STORE_PATH = join(sandbox, 'bundles.json');
process.env.AGENT_ARTIFACT_STORE_PATH = join(sandbox, 'artifacts');
process.env.AGENT_CHECKPOINT_STORE_PATH = join(sandbox, 'checkpoints');

const {
  createAgentThread, planTurn, confirmPlan, executePlan, getAgentThread,
  addThreadMessage, saveAgentThread, recordToolResult,
} = await import('../server/src/agent-core/index.ts');
const { executeLlmTool } = await import('../server/src/services/llm-tools.ts');
const { randomUUID } = await import('node:crypto');

const run = { tenantId: 'local', userId: 'local', requestId: `loop_${Date.now()}` };
const failures = [];
const answers = [];

const LIVE_EVENT_TYPES = new Set([
  'tool_observation', 'task_failed', 'task_completed', 'gate_failed', 'decision_failed',
  'recovery_retry', 'self_review_failed', 'argument_resolved', 'question_asked',
  'context_compacted', 'model.completed', 'model.failed', 'batch_reads_completed',
  'task_blocked', 'thread_blocked', 'approval_required', 'checkpoint.created',
]);

function summarize(value, max = 110) {
  if (typeof value === 'string') return value.slice(0, max);
  if (value == null) return '';
  try { return JSON.stringify(value).slice(0, max); } catch { return String(value).slice(0, max); }
}

async function runWithLiveLog(thread, run) {
  let lastSeen = 0;
  const poller = setInterval(() => {
    const newEvents = thread.events.slice(lastSeen);
    if (newEvents.length) {
      lastSeen = thread.events.length;
      for (const event of newEvents) {
        if (LIVE_EVENT_TYPES.has(event.type)) {
          const data = event.data || {};
          if (event.type === 'tool_observation') {
            console.log(`  [${event.seq}] ${data.toolName} → ${data.status} ${summarize(data.summary || data.error?.message)}`);
          } else {
            console.log(`  [${event.seq}] ${event.type} ${summarize(data)}`);
          }
        }
      }
    }
  }, 4000);
  try {
    await executePlan(thread, run);
  } finally {
    clearInterval(poller);
  }
}

function collectFailures(thread) {
  for (const event of thread.events) {
    if (event.type === 'tool_observation' && event.data?.status === 'failed') {
      failures.push(`[${event.seq}] ${event.data?.toolName} → ${String(event.data?.summary || event.data?.error?.message || '').slice(0, 200)}`);
    }
    if (event.type === 'task_failed') {
      failures.push(`[${event.seq}] task_failed ${event.data?.taskId} → ${String(event.data?.error || '').slice(0, 200)}`);
    }
    if (event.type === 'gate_failed') {
      failures.push(`[${event.seq}] gate_failed → ${String(JSON.stringify(event.data?.failures || '')).slice(0, 300)}`);
    }
    if (event.type === 'decision_failed') {
      failures.push(`[${event.seq}] decision_failed → ${String(event.data?.error || '').slice(0, 200)}`);
    }
    if (event.type === 'self_review_failed') {
      failures.push(`[${event.seq}] self_review_failed → ${String(event.data?.issues || '').slice(0, 300)}`);
    }
  }
}

async function resumeAfterPause(thread) {
  const question = [...thread.messages].reverse().find((message) => message.kind === 'question');
  const option = question?.questions?.find((item) => item.options?.some((o) => o.label.includes('继续')))
    || question?.questions?.[0];
  const answer = option?.options?.find((o) => o.label.includes('继续'))?.label || '继续，使用合理默认值并推进到完成';
  answers.push(answer);
  thread.turnId = `paturn_${randomUUID()}`;
  addThreadMessage(thread, 'user', 'prompt', answer, thread.turnId);
  thread.consecutiveNoProgress = 0;
  thread.blockedCount = 0;
  thread.blockedConditionFingerprint = undefined;
  thread.decisionSteps = 0;
  thread.pendingSteer = undefined;
  thread.controlSignal = undefined;
  saveAgentThread(thread);
  console.log(`→ 模拟回答：${answer}`);
}

async function approveOperation(thread) {
  const approval = thread.pendingApproval;
  if (!approval) return false;
  console.log(`→ 模拟批准：${approval.toolName}`);
  const result = await executeLlmTool(approval.toolName, { ...approval.arguments, confirmationToken: approval.confirmation.token }, {
    tenantId: run.tenantId,
    projectId: approval.projectId || thread.currentProjectId,
    userId: run.userId,
    requestId: run.requestId,
    mcpRole: approval.scope,
  });
  thread.pendingApproval = undefined;
  const outcome = await recordToolResult(thread, run, {
    toolName: approval.toolName,
    scope: approval.scope,
    taskId: approval.taskId,
    arguments: approval.arguments,
  }, approval.scope, result);
  saveAgentThread(thread);
  return outcome !== 'waiting';
}

async function main() {
  const { initializeAgentStore } = await import('../server/src/agent-core/index.ts');
  await initializeAgentStore();
  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, profileId: 'default-cloud', mode: 'goal', title: '实战循环测试' });
  console.log(`线程 ${thread.id} 已创建（goal 模式，profile=default-cloud）`);
  const startedAt = Date.now();

  console.log(`[${new Date().toISOString()}] 开始规划…`);
  await planTurn(thread, PROMPT, run);
  console.log(`[${new Date().toISOString()}] 规划完成（${((Date.now() - startedAt) / 1000).toFixed(1)}s）：${thread.plan?.goal}（${thread.plan?.tasks.length} 个任务，revision ${thread.plan?.revision}）`);
  for (const task of thread.plan?.tasks || []) console.log(`  任务 ${task.id}: [${task.scope}/${task.access}] ${task.title} — ${task.instruction.slice(0, 90)}`);
  if (thread.plan?.status === 'pending') confirmPlan(thread);

  let guard = 0;
  while (guard < 30) {
    guard += 1;
    await runWithLiveLog(thread, run);
    collectFailures(thread);
    const status = thread.status;
    console.log(`状态：${status}（任务 ${thread.plan?.tasks.filter((t) => t.status === 'passed').length || 0}/${thread.plan?.tasks.length || 0} 完成，恢复 ${thread.recoveryCycles}，步骤 ${thread.decisionSteps}）`);
    if (status === 'completed') break;
    if (status === 'awaiting_operation_approval') {
      if (answers.filter((a) => a.startsWith('→')).length >= MAX_APPROVALS) { console.log('批准次数超限，停止'); break; }
      await approveOperation(thread);
      continue;
    }
    if (status === 'paused') {
      if (answers.length >= MAX_ANSWERS) { console.log('回答次数超限，停止'); break; }
      await resumeAfterPause(thread);
      continue;
    }
    break;
  }

  const final = getAgentThread(thread.id);
  const metrics = final?.turnMetrics;
  console.log('\n===== 结果报告 =====');
  console.log(`最终状态：${final?.status}`);
  console.log(`耗时：${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log(`任务：${final?.plan?.tasks.map((t) => `${t.id}[${t.status}]`).join(' ') || ''}`);
  console.log(`指标：模型 ${metrics?.modelCalls} 次，工具 ${metrics?.toolCalls} 次，无效 ${metrics?.invalidToolCalls}，重试 ${metrics?.retries}，压缩 ${metrics?.compactions}，暂停 ${metrics?.pauses}，token ${metrics?.tokenUsage.prompt + metrics?.tokenUsage.completion}`);
  const unique = [...new Set(failures)];
  console.log(`失败数：${unique.length}`);
  for (const item of unique) console.log(`  ✗ ${item}`);
  const reportPath = `/tmp/agent-loop-report-${thread.id}.json`;
  const { writeFileSync } = await import('node:fs');
  writeFileSync(reportPath, JSON.stringify({
    threadId: thread.id,
    sandbox,
    status: final?.status,
    metrics,
    failures: unique,
    plan: final?.plan ? { goal: final.plan.goal, revision: final.plan.revision, tasks: final.plan.tasks.map((t) => ({ id: t.id, title: t.title, scope: t.scope, status: t.status, error: t.error, evidence: t.evidence.map((e) => e.summary) })) } : undefined,
    events: (final?.events || []).map((e) => ({ seq: e.seq, type: e.type, data: e.data })),
  }, null, 2));
  console.log(`诊断报告：${reportPath}`);
  if (final?.status === 'completed' && unique.length === 0) {
    console.log('✅ 本轮零问题');
    process.exit(0);
  }
  console.log('❌ 本轮存在问题，需要修复');
  process.exit(1);
}

await main();
