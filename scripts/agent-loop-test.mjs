/**
 * 项目智能体「提示词循环测试」：起本地 LLM Provider + Server，用 v5 API 提交
 * 一段真实任务提示词，轮询线程直到终态，输出诊断摘要并以退出码表示成败。
 *
 * 用法：
 *   node scripts/agent-loop-test.mjs [--timeout 1200000] [--port 5190] [--provider http://127.0.0.1:5001]
 *
 * 每次运行使用全新临时数据目录，互不污染；反复运行即「一遍又一遍尝试」。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) => [value.replace(/^--/, ''), all[index + 1]]));
const TIMEOUT_MS = Number(args.timeout || 60 * 60_000);
const PORT = Number(args.port || 5190);
const GRPC_PORT = Number(args['grpc-port'] || 50052);
const HTTP_PORT = Number(args['http-port'] || 5002);
const PROVIDER_HEALTH = args.provider || `http://127.0.0.1:${HTTP_PORT}`;
const GRPC_URL = args.grpc || `127.0.0.1:${GRPC_PORT}`;

import { readFileSync } from 'node:fs';
const DEFAULT_PROMPT_FILE = join(ROOT, 'scripts', 'prompts', 'employee-mgmt.txt');
const PROMPT = args.prompt || (() => { try { return readFileSync(DEFAULT_PROMPT_FILE, 'utf8').trim(); } catch { return '从零构建一个员工信息管理 FormFlow 项目并跑通所有门禁。'; } })();
const MANIFEST = args.manifest ? JSON.parse(readFileSync(args.manifest, 'utf8')) : null;
// 更重的基准（跨表工作流）可这样跑：
//   node scripts/agent-loop-test.mjs --prompt "$(cat scripts/prompts/device-borrow.txt)"
// 小任务序列（同线程顺序执行）：
//   node scripts/agent-loop-test.mjs --manifest scripts/prompts/small-tasks.json

function sleep(ms) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }

async function waitFor(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // 尚未就绪
    }
    await sleep(800);
  }
  throw new Error(`${label} 未就绪：${url}`);
}

const kids = [];
function startProcess(command, env, label) {
  const child = spawn(command[0], command.slice(1), { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  kids.push(child);
  return child;
}

function shutdown() {
  for (const child of kids) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  }
}

const tempRoot = mkdtempSync(join(tmpdir(), 'agent-loop-test-'));
const env = {
  FORMFLOW_MODE: 'local',
  FORMFLOW_DATABASE_REQUIRED: 'false',
  FORMFLOW_DATABASE_AUTO_START: 'false',
  PORT: String(PORT),
  LLM_PROVIDER_GRPC_URL: GRPC_URL,
  AGENT_THREAD_STORE_PATH: join(tempRoot, 'threads.json'),
  AGENT_BUNDLE_STORE_PATH: join(tempRoot, 'bundles.json'),
  AGENT_ARTIFACT_STORE_PATH: join(tempRoot, 'artifacts'),
  AGENT_CHECKPOINT_STORE_PATH: join(tempRoot, 'checkpoints'),
  FORMFLOW_PROJECTS_DIR: join(tempRoot, 'projects'),
  FORMFLOW_DATA_DIR: join(tempRoot, 'data'),
  FORMFLOW_UPLOADS_DIR: join(tempRoot, 'uploads'),
  // 复用真实 LLM 配置（MiMo provider/profile），避免临时目录落到默认 seed。
  LLM_MANAGEMENT_STORE_PATH: join(ROOT, 'server', 'data', 'configs', 'llm-management.json'),
};

const TERMINAL = new Set(['completed', 'paused', 'blocked', 'failed', 'stopped']);

try {
  // 1) Provider
  let providerUp = false;
  try { providerUp = await fetch(`${PROVIDER_HEALTH}/healthz`).then((res) => res.ok); } catch { /* 未起 */ }
  if (!providerUp) {
    const python = join(ROOT, 'llm-provider', '.venv', 'bin', 'python');
    startProcess([python, '-m', 'src'], {
      PYTHONPATH: join(ROOT, 'llm-provider'),
      LLM_PROVIDER_GRPC_HOST: '127.0.0.1',
      LLM_PROVIDER_GRPC_PORT: String(GRPC_PORT),
      LLM_PROVIDER_HTTP_HOST: '127.0.0.1',
      LLM_PROVIDER_HTTP_PORT: String(HTTP_PORT),
    }, 'provider');
    await waitFor(`${PROVIDER_HEALTH}/healthz`, 30_000, 'LLM Provider');
  }

  // 2) Server
  startProcess(['npx', 'tsx', 'server/src/index.ts'], env, 'server');
  await waitFor(`http://127.0.0.1:${PORT}/api/health`, 60_000, 'Server');

  // 3) 建线程并提交 Turn
  const createRes = await fetch(`http://127.0.0.1:${PORT}/api/ai/project-agent/v5/threads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profileId: 'default-cloud', title: '循环测试：设备借出登记与归还跟踪' }),
  });
  const thread = await createRes.json();
  if (!createRes.ok) throw new Error(`创建线程失败：${JSON.stringify(thread).slice(0, 400)}`);
  console.log(`[test] 线程 ${thread.id} 已创建`);

  if (MANIFEST) {
    const perTask = MANIFEST.perTask || {};
    const maxSeconds = Number(perTask.maxSeconds || 300);
    const results = [];
    let currentProjectId = '';
    for (let index = 0; index < MANIFEST.tasks.length; index += 1) {
      const task = MANIFEST.tasks[index];
      const maxTools = Number(task.maxToolCalls ?? perTask.maxToolCalls ?? 40);
      const startedAt = Date.now();
      let prompt = String(task.prompt || '');
      if (prompt.includes('{projectId}')) {
        if (!currentProjectId) throw new Error(`任务「${task.title}」需要 {projectId}，但尚无已绑定项目`);
        prompt = prompt.replaceAll('{projectId}', currentProjectId);
      }
      const res = await fetch(`http://127.0.0.1:${PORT}/api/ai/project-agent/v5/threads/${thread.id}/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, finalGate: task.finalGate === true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(`任务「${task.title}」提交失败：${JSON.stringify(body).slice(0, 300)}`);
      console.log(`[task ${index + 1}/${MANIFEST.tasks.length}] ${task.title} 已提交`);
      const deadline = Date.now() + maxSeconds * 1000;
      let latest;
      let reason = '';
      while (Date.now() < deadline) {
        await sleep(2000);
        latest = await (await fetch(`http://127.0.0.1:${PORT}/api/ai/project-agent/v5/threads/${thread.id}`)).json();
        if (TERMINAL.has(latest.status)) break;
        if (latest.status === 'awaiting_operation_approval') { reason = '触发破坏性审批（禁止）'; break; }
        if (latest.status === 'paused') {
          const q = [...(latest.messages || [])].reverse().find((message) => message.kind === 'question');
          reason = `中途提问/暂停：${q?.questions?.[0]?.header || q?.content || ''}`.slice(0, 120);
          break;
        }
      }
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      const toolCalls = latest?.turnMetrics?.toolCalls ?? 0;
      const status = latest?.status === 'completed' && !reason && toolCalls <= maxTools ? 'completed' : 'failed';
      const failReason = reason
        || (latest?.status !== 'completed' ? `终态 ${latest?.status || 'timeout'}`
          : toolCalls > maxTools ? `工具调用超限 ${toolCalls} > ${maxTools}` : '');
      results.push({ index: index + 1, title: task.title, status, elapsedSec, toolCalls, failReason });
      console.log(`[task ${index + 1}/${MANIFEST.tasks.length}] ${task.title} → ${status}（${elapsedSec}s · ${toolCalls} 工具${failReason ? ` · ${failReason}` : ''}）`);
      currentProjectId = latest?.currentProjectId || currentProjectId;
      if (status !== 'completed') break;
    }
    console.log(`\n===== 小任务序列汇总 =====`);
    for (const r of results) console.log(`  ${r.index}. ${r.title}: ${r.status}（${r.elapsedSec}s · ${r.toolCalls} 工具${r.failReason ? ` · ${r.failReason}` : ''}）`);
    const allDone = results.length === MANIFEST.tasks.length && results.every((r) => r.status === 'completed');
    if (allDone && currentProjectId) {
      const verify = spawnSync('npx', ['tsx', 'scripts/verify-small-tasks.ts', tempRoot, currentProjectId], { cwd: ROOT, stdio: 'inherit' });
      if (verify.status !== 0) {
        console.error('[verify] 产物核验未通过');
        process.exitCode = 1;
      } else {
        console.log('[verify] 产物核验通过');
        process.exitCode = 0;
      }
    } else {
      process.exitCode = 1;
    }
  } else {
  const turnRes = await fetch(`http://127.0.0.1:${PORT}/api/ai/project-agent/v5/threads/${thread.id}/turns`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: PROMPT }),
  });
  const turnBody = await turnRes.json();
  if (!turnRes.ok) throw new Error(`提交 Turn 失败：${JSON.stringify(turnBody).slice(0, 400)}`);
  console.log(`[test] Turn ${turnBody.turnId || thread.id} 已提交，等待终态（超时 ${Math.round(TIMEOUT_MS / 1000)}s）`);

  // 4) 轮询
  const deadline = Date.now() + TIMEOUT_MS;
  let final;
  let lastProgress = 0;
  let budgetResumes = 0;
  while (Date.now() < deadline) {
    await sleep(2500);
    const res = await fetch(`http://127.0.0.1:${PORT}/api/ai/project-agent/v5/threads/${thread.id}`);
    final = await res.json();
    // 决策预算暂停是可控恢复点：自动回复「继续，使用合理默认值」（与本地 UI 一致，限 3 次）。
    if (final.status === 'paused' && budgetResumes < 3) {
      const lastQuestion = [...(final.messages || [])].reverse().find((message) => message.kind === 'question');
      if (lastQuestion?.questions?.[0]?.header === '预算用尽') {
        budgetResumes += 1;
        await fetch(`http://127.0.0.1:${PORT}/api/ai/project-agent/v5/threads/${thread.id}/turns`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: '继续，使用合理默认值' }),
        });
        console.log(`[test] 预算暂停自动继续（第 ${budgetResumes} 次）`);
        continue;
      }
    }
    if (TERMINAL.has(final.status)) break;
    if (final.status === 'awaiting_operation_approval' && final.pendingApproval) {
      // 本地模式与 UI 一致：破坏性操作自动确认（确定性策略，非人工判断）。
      await fetch(`http://127.0.0.1:${PORT}/api/ai/project-agent/v5/threads/${thread.id}/operations/${final.pendingApproval.id}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approved: true, automatic: true }),
      });
      console.log(`[test] 自动确认破坏性操作 ${final.pendingApproval.toolName}`);
    }
    if (Date.now() - lastProgress > 30_000) {
      lastProgress = Date.now();
      const failedCount = final.events.filter((event) => event.type === 'tool_observation' && event.data?.status === 'failed').length;
      const lastEvent = final.events.at(-1)?.type || '';
      console.log(`[progress] ${Math.round((Date.now() - deadline + TIMEOUT_MS) / 1000)}s 剩余 · status=${final.status} · 事件 ${final.events.length} · 失败 ${failedCount} · 最近 ${lastEvent}`);
    }
  }
  if (!final) throw new Error('超时未得到终态');

  // 5) 诊断摘要
  const failed = final.events.filter((event) => event.type === 'tool_observation' && event.data?.status === 'failed');
  const problems = final.events
    .filter((event) => ['decision_failed', 'verification.failed', 'gate_failed', 'question_asked', 'no_progress_auto_continue', 'thread_blocked', 'turn_failed'].includes(event.type))
    .slice(-12);
  console.log(`\n===== 终态：${final.status} =====`);
  console.log(`Turn 状态：${final.turns.map((turn) => `${turn.status}${turn.failureReason ? `(${turn.failureReason.slice(0, 80)})` : ''}`).join('；')}`);
  console.log(`工具失败 ${failed.length} 次；最近失败：`);
  for (const event of failed.slice(-6)) console.log(`  - ${event.data?.toolName}: ${String(event.data?.summary || '').slice(0, 160)}`);
  console.log('关键事件：');
  for (const event of problems) console.log(`  - ${event.type}: ${JSON.stringify(event.data).slice(0, 180)}`);
  console.log('最近工具调用/观察：');
  const trace = final.events.filter((event) => ['tool_call', 'tool_observation', 'decision_failed', 'plan.updated'].includes(event.type)).slice(-10);
  for (const event of trace) console.log(`  - ${event.type}: ${JSON.stringify(event.data).slice(0, 160)}`);
  if (final.dynamicPlan) console.log(`动态计划：${final.dynamicPlan.goal}（步骤 ${final.dynamicPlan.steps.length}）`);
  const lastMessages = final.messages.slice(-4).map((message) => `  [${message.role}/${message.kind}] ${message.content.slice(0, 160)}`);
  console.log('最近消息：');
  for (const line of lastMessages) console.log(line);
  console.log(`指标：模型 ${final.turnMetrics?.modelCalls || 0} · 工具 ${final.turnMetrics?.toolCalls || 0} · 无效 ${final.turnMetrics?.invalidToolCalls || 0} · 重试 ${final.turnMetrics?.retries || 0} · 暂停 ${final.turnMetrics?.pauses || 0}`);

  process.exitCode = final.status === 'completed' ? 0 : 1;
  }
} catch (error) {
  console.error(`[test] 失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
} finally {
  shutdown();
  await sleep(500);
}
