/**
 * End-to-end project-agent driver.
 *
 * Creates a goal-mode thread, sends one prompt, then follows the thread to
 * completion while acting as a "limited user": approving destructive
 * operations and answering pause questions at most once per question kind.
 * Collects every failed tool observation / task failure / gate failure so the
 * loop can be fixed and re-run.
 *
 * Usage: node scripts/e2e-agent-run.mjs --prompt "<text>" [--timeout-min 15]
 */
import { spawnSync } from 'node:child_process';

const BASE = process.env.FORMFLOW_API || 'http://127.0.0.1:3001';
const api = `${BASE}/api/ai/project-agent/v4`;

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const PROMPT = arg('prompt', '');
const TIMEOUT_MIN = Number(arg('timeout-min', '15'));
const ATTACH = arg('attach', '');
const ANSWER_LIMIT = 6; // 最多代替用户回答几次，超过视为“无法有限回答完成”

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function json(method, path, body) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(path.includes('/turns') ? 300_000 : 60_000),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${String(text).slice(0, 300)}`);
  return data;
}

function summarize(value, max = 140) {
  if (typeof value === 'string') return value.slice(0, max);
  if (value == null) return '';
  try { return JSON.stringify(value).slice(0, max); } catch { return String(value).slice(0, max); }
}

const errors = [];
const answers = [];
const answeredQuestions = new Set();

async function main() {
  if (!PROMPT && !ATTACH) {
    console.error('缺少 --prompt');
    process.exit(2);
  }
  let threadId = ATTACH;
  if (!threadId) {
    const created = await json('POST', '/threads', { mode: 'goal', title: '端到端试跑' });
    threadId = created.id;
    console.log(`线程 ${threadId} 已创建（goal 模式）`);
    await json('POST', `/threads/${threadId}/turns`, { prompt: PROMPT, mode: 'goal' });
    console.log('提示词已发送');
  } else {
    console.log(`附加到线程 ${threadId}，等待执行或暂停点…`);
  }

  const deadline = Date.now() + TIMEOUT_MIN * 60_000;
  let lastSeq = 0;
  let lastStatus = '';
  let stallRounds = 0;

  while (Date.now() < deadline) {
    await sleep(2000);
    const thread = await json('GET', `/threads/${threadId}`);
    const status = thread.status;

    // 事件流里收集失败
    const page = await json('GET', `/threads/${threadId}/events?afterSeq=${lastSeq}`);
    for (const event of page.events || []) {
      lastSeq = Math.max(lastSeq, Number(event.seq || 0));
      if (event.type === 'tool_observation' && event.data?.status === 'failed') {
        errors.push(`[${event.seq}] ${event.data?.toolName} → ${summarize(event.data?.summary || event.data?.error?.message, 160)}`);
      }
      if (event.type === 'task_failed') {
        errors.push(`[${event.seq}] task_failed ${summarize(event.data?.taskId)} → ${summarize(event.data?.error, 160)}`);
      }
      if (event.type === 'gate_failed') {
        errors.push(`[${event.seq}] gate_failed → ${summarize(event.data?.failures, 200)}`);
      }
      if (event.type === 'question_asked') {
        const question = event.data?.questions?.[0];
        const key = `${question?.header || ''}:${question?.question || event.data?.reason || ''}`;
        if (!answeredQuestions.has(key)) {
          const option = question?.options?.find((item) => item.label.includes('继续')) || question?.options?.[0];
          if (option && answers.length < ANSWER_LIMIT) {
            answers.push({ key, answer: option.label });
            answeredQuestions.add(key);
            await json('POST', `/threads/${threadId}/turns`, { prompt: option.label });
            console.log(`→ 自动回答：${option.label}`);
          } else if (!option && answers.length < ANSWER_LIMIT) {
            answers.push({ key, answer: '继续，使用合理默认值并推进到完成' });
            answeredQuestions.add(key);
            await json('POST', `/threads/${threadId}/turns`, { prompt: '继续，使用合理默认值并推进到完成' });
            console.log('→ 自动回答：继续，使用合理默认值');
          }
        }
      }
    }

    // 待确认的破坏性操作 → 自动批准（模拟用户）
    if (thread.pendingApproval) {
      console.log(`→ 自动批准操作：${thread.pendingApproval.toolName}（${summarize(thread.pendingApproval.confirmation?.summary, 80)}）`);
      await json('POST', `/threads/${threadId}/operations/${thread.pendingApproval.id}/decision`, { approved: true, automatic: true });
    }

    if (status !== lastStatus) {
      console.log(`状态：${status}${thread.plan ? `（任务 ${thread.plan.tasks.filter((t) => t.status === 'passed').length}/${thread.plan.tasks.length} 完成）` : ''}`);
      lastStatus = status;
      stallRounds = 0;
    } else {
      stallRounds += 1;
    }

    if (status === 'completed') {
      console.log('\n=== 完成 ===');
      printSummary(thread);
      return 0;
    }
    if (status === 'blocked') {
      console.log('\n=== 阻塞 ===');
      errors.push(`thread_blocked → ${summarize(thread.blockedConditionFingerprint, 200)}`);
      printSummary(thread);
      return 1;
    }
    if (status === 'paused' && answers.length >= ANSWER_LIMIT && stallRounds > 3) {
      console.log('\n=== 暂停且回答次数超限 ===');
      printSummary(thread);
      return 2;
    }
    if (thread.status === 'idle' && thread.messages.length === 0) {
      // 线程还没被 turn 激活
    }
  }

  console.log('\n=== 超时 ===');
  const thread = await json('GET', `/threads/${threadId}`);
  printSummary(thread);
  return 3;
}

function printSummary(thread) {
  console.log(`线程：${thread.id}（${thread.status}）`);
  console.log(`人工回答次数：${answers.length}${answers.length ? `（${answers.map((item) => item.answer).join(' | ')}）` : ''}`);
  console.log(`任务状态：${(thread.plan?.tasks || []).map((task) => `${task.title}=${task.status}${task.attempt ? `(${task.attempt})` : ''}`).join('；')}`);
  const unique = [...new Set(errors)];
  console.log(`\n错误清单（去重 ${unique.length} 条）：`);
  unique.forEach((error, index) => console.log(`  ${index + 1}. ${error}`));
  if (!unique.length) console.log('  无');
}

try {
  const code = await main();
  process.exit(code);
} catch (error) {
  console.error('驱动失败：', error instanceof Error ? error.message : String(error));
  process.exit(4);
}
