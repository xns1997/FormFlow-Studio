/**
 * ContextManager v2：结构化上下文契约 + 超阈值压缩 + artifact 摘要回读。
 *
 * 参考书 ContextManager 建议：固定上下文、线程上下文、工作区上下文、按需上下文分层，
 * 压缩保留 goal/constraints/decisions/verification/remainingWork，完整日志转存 artifact。
 */
import { llmManagement } from '../services/llm-management';
import { chat } from './llm';
import {
  appendAgentThreadEvent, bumpThreadMetric, compactThreadMessages, saveAgentThread, setThreadContext,
} from './store';
import type { AgentThread, CapabilityBundleVersion, RunContext, ThreadContext } from './types';

const DEFAULT_MAX_PROMPT_CHARS = 40_000;
/** 注入的当前 scope skill 文档 + 目录的估算字符数（保守值）。 */
const SKILL_DOCS_ALLOWANCE = 16_000;

/** 提示词最大字符数（来自能力包配置，默认 40000）。 */
export function maxPromptChars(bundle: CapabilityBundleVersion) {
  return bundle.context?.maxPromptChars ?? DEFAULT_MAX_PROMPT_CHARS;
}

/** 从线程现有结构化状态确定性提取压缩契约（动态计划 + 事件流，无任务清单）。 */
/** 构造线程的结构化上下文（目标/约束/决策/验证/剩余工作）。 */
export function structuredThreadContext(thread: AgentThread): ThreadContext {
  const plan = thread.dynamicPlan;
  const remainingWork = [...(plan?.steps || [])];
  const verification = thread.events
    .filter((event) => event.type === 'verification.completed' || event.type === 'verification.failed' || event.type === 'gate_failed')
    .slice(-10)
    .map((event) => String(event.data?.summary || event.type));
  const decisions = thread.events
    .filter((event) => event.type === 'tool_observation' && event.data?.status === 'succeeded')
    .slice(-12)
    .map((event) => String(event.data?.summary || ''));
  const userCorrections = thread.messages
    .filter((message) => message.role === 'user' && message.kind === 'prompt')
    .slice(-3)
    .map((message) => message.content);
  return {
    goal: plan?.goal || '',
    constraints: [...(plan?.successCriteria || []), ...(plan?.assumptions || [])],
    decisions,
    verification,
    remainingWork,
    userCorrections,
    updatedAt: new Date().toISOString(),
  };
}

/** 粗略估算当前 Prompt 大小（最近消息 + 最近观察 + 注入 skill 文档 + 摘要）。
 *  事件流是审计日志、不在 Prompt 内全量注入，因此不参与估算，避免每步误触发压缩。 */
/** 估算当前提示词字符数（用于触发压缩）。 */
export function estimatePromptChars(thread: AgentThread): number {
  const recentMessagesChars = thread.messages.slice(-8).reduce((total, message) => total + (message.content?.length || 0), 0);
  const recentObservationChars = thread.events.slice(-12).reduce((total, event) => total + JSON.stringify(event.data || {}).length, 0);
  return recentMessagesChars + recentObservationChars + SKILL_DOCS_ALLOWANCE + (thread.summary?.length || 0);
}

function hasSummarizeRoute(thread: AgentThread, run: RunContext) {
  try {
    const profile = llmManagement.resolveProfile(thread.profileId, { tenantId: run.tenantId, projectId: thread.currentProjectId });
    return profile.routes.some((route) => route.purpose === 'summarize');
  } catch {
    return false;
  }
}

async function summarizeOldMessages(thread: AgentThread, run: RunContext, oldText: string, maxChars: number): Promise<string> {
  if (!oldText.trim()) return '';
  try {
    const response = await chat(thread, run, {
      messages: [
        { role: 'system', content: '你是会话压缩器。把以下历史对话压缩成简洁中文摘要，保留：用户目标与纠正、已做的关键修改、失败与原因、未完成事项。只输出摘要正文，不要 Markdown。' },
        { role: 'user', content: oldText.slice(-12000) },
      ],
      temperature: 0.2,
      maxTokens: 600,
      purpose: 'summarize',
    });
    const summary = (response.content || '').trim();
    return summary ? summary.slice(0, maxChars) : '';
  } catch {
    return '';
  }
}

/**
 * 超过 maxPromptChars 阈值时执行压缩：
 * 1) 确定性提取结构化契约（thread.context）；
 * 2) 旧消息折叠进 summary（有 summarize 路由时先做 LLM 摘要，否则确定性折叠）；
 * 3) 记录 context_compacted 事件与指标。
 */
/** 提示词超限时触发结构化上下文压缩。 */
export async function maybeCompactContext(thread: AgentThread, bundle: CapabilityBundleVersion, run: RunContext) {
  const threshold = maxPromptChars(bundle);
  if (estimatePromptChars(thread) <= threshold) return;
  const recentMessages = bundle.context?.recentMessages ?? 8;
  const maxSummaryChars = bundle.context?.maxSummaryChars ?? 6000;
  const old = thread.messages.slice(0, Math.max(0, thread.messages.length - recentMessages));
  if (!old.length && !thread.summary) return;
  setThreadContext(thread, structuredThreadContext(thread));
  let summaryText = '';
  if (hasSummarizeRoute(thread, run)) {
    const oldText = old.map((item) => `${item.role === 'user' ? '用户' : '智能体'}（${item.kind}）：${item.content}`).join('\n');
    summaryText = await summarizeOldMessages(thread, run, oldText, maxSummaryChars);
  }
  compactThreadMessages(thread, maxSummaryChars, recentMessages);
  if (summaryText) {
    thread.summary = `${thread.summary}\n${summaryText}`.trim().slice(-maxSummaryChars);
  }
  bumpThreadMetric(thread, { compactions: 1 });
  appendAgentThreadEvent(thread, 'context_compacted', {
    summarizedMessages: old.length,
    summaryChars: thread.summary.length,
    contract: {
      goal: thread.context?.goal,
      remainingWorkCount: thread.context?.remainingWork.length || 0,
      verificationCount: thread.context?.verification.length || 0,
    },
  });
  saveAgentThread(thread);
}
