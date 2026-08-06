/**
 * AgentLoop（PDF 6.1）：领域无关的单循环驱动。
 *
 * 驱动只负责编排：Turn 记录、控制信号、终止语义、决策校验、批量只读归一化、
 * 只读护栏、完成门禁编排。模型调用、工具执行、权限、验证、恢复、上下文压缩、
 * 事件持久化全部委托给注入的 HarnessComponents。
 */
import { randomUUID } from 'node:crypto';
import {
  acquireAgentThreadLease, releaseAgentThreadLease, renewAgentThreadLease,
} from '../store';
import {
  BLOCKED_THRESHOLD, NO_PROGRESS_THRESHOLD, blockingFingerprint, budgetExhausted,
  progressFingerprint, recordBlockedCondition, recordProgress, stalled,
} from '../termination';
import type {
  AgentThread, CapabilityBundleVersion, LoopDecision, LoopQuestion, RunContext, TurnStatus,
} from '../types';
import type { HarnessComponents } from './types';

const READ_BEFORE_WRITE_LIMIT = 6;
/** 连续无进展收敛系数：达到 5× 阈值仍未解决时转 blocked 提问（给模型更多自纠空间）。 */
const NO_PROGRESS_ESCALATION_FACTOR = 5;

function markTurn(thread: AgentThread, status: TurnStatus, failureReason?: string) {
  const turn = thread.turns.find((item) => item.id === thread.turnId);
  if (!turn) return;
  turn.status = status;
  if (failureReason) turn.failureReason = failureReason;
  if (['completed', 'failed', 'cancelled'].includes(status)) turn.completedAt = new Date().toISOString();
}

function recentProblemSummary(thread: AgentThread): string {
  for (const event of [...thread.events].reverse()) {
    if (event.type === 'tool_observation' && event.data?.status === 'failed') {
      return `最近失败：${String(event.data?.toolName || '工具')} → ${String(event.data?.summary || '').slice(0, 140)}`;
    }
    if (event.type === 'verification.failed') {
      return `最近验证失败：${String(event.data?.summary || '').slice(0, 140)}`;
    }
  }
  const last = thread.events[thread.events.length - 1];
  return last ? `最近事件：${last.type}` : '';
}

function makePauseQuestions(thread: AgentThread, kind: 'no_progress' | 'budget' | 'blocked' | 'manual', reason: string): LoopQuestion[] {
  const parts = [
    thread.dynamicPlan ? `当前目标：${thread.dynamicPlan.goal}` : '',
    recentProblemSummary(thread),
    thread.blockedCount > 0 ? `已连续 ${thread.blockedCount} 次遇到同类阻塞，上次的指引没有解决问题，可能需要换一种方案或手动接管。` : '',
  ].filter(Boolean);
  return [{
    header: kind === 'no_progress' ? '缺少信息' : kind === 'budget' ? '预算用尽' : kind === 'blocked' ? '执行受阻' : '需要确认',
    question: reason,
    kind: 'choice',
    context: parts.length ? parts.join('；') : undefined,
    options: [
      { label: '继续，使用合理默认值', description: '允许智能体自行决定缺失信息并继续执行' },
      { label: '暂停，我来补充', description: '在输入框补充具体说明，回答后会自动继续' },
    ],
  }];
}

function hasSucceededChanges(thread: AgentThread): boolean {
  return thread.events.some((event) => event.type === 'tool_observation' && event.data?.status === 'succeeded' && event.data?.changes?.length);
}

export interface AgentLoopHooks {
  decide?: (thread: AgentThread, run: RunContext, bundle: CapabilityBundleVersion) => Promise<LoopDecision>;
  selfReview?: (thread: AgentThread, run: RunContext) => Promise<{ issues: string[] }>;
}

/** 主循环：一次用户输入 = 一个 Turn，循环到完成/提问/审批/阻塞/预算耗尽。 */
export async function runTurn(thread: AgentThread, run: RunContext, components: HarnessComponents, hooks: AgentLoopHooks = {}) {
  if (thread.status === 'executing' || thread.status === 'awaiting_operation_approval') return;
  if (!(await acquireAgentThreadLease(thread.id))) return;
  const events = components.events;
  try {
    thread.status = 'executing';
    thread.controlSignal = undefined;
    events.resetMetrics(thread);
    thread.recoveryCycles = 0;
    const turnId = thread.turnId || `paturn_${randomUUID()}`;
    thread.turnId = turnId;
    const lastUserInput = [...thread.messages].reverse().find((message) => message.role === 'user')?.content || '';
    const turn = { id: turnId, userInput: lastUserInput, status: 'preparing' as TurnStatus, startedAt: new Date().toISOString() };
    const existing = thread.turns.findIndex((item) => item.id === turnId);
    if (existing >= 0) thread.turns[existing] = turn; else thread.turns.push(turn);
    events.emit(thread, 'turn.started', { turnId, status: 'preparing' });
    events.save(thread);

    const bundle = components.bundle.get(thread);
    if (!bundle) throw new Error('能力包不存在');

    const lastUserMessage = [...thread.messages].reverse().find((message) => message.role === 'user');
    if (!thread.dynamicPlan || (thread.dynamicPlanPromptId && lastUserMessage && thread.dynamicPlanPromptId !== lastUserMessage.id)) {
      try {
        const plan = await components.plan.initialize(thread, run);
        events.emit(thread, 'plan_ready', { goal: plan.goal });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        thread.status = 'failed';
        markTurn(thread, 'failed', message);
        events.emit(thread, 'turn_failed', { turnId, stage: 'planning', error: message, retryable: true });
        events.save(thread);
        return;
      }
    }

    let fingerprint = progressFingerprint(thread);
    let consecutiveReads = 0;
    let gateRequiresWrite = false;
    let hasWritten = false;
    while (true) {
      await renewAgentThreadLease(thread.id);
      await components.context.compactIfNeeded(thread, bundle, run);
      markTurn(thread, 'running_model');

      if (thread.controlSignal === 'pause') {
        thread.status = 'paused';
        thread.controlSignal = undefined;
        events.emit(thread, 'execution_paused', { reason: 'user_paused' });
        events.save(thread);
        return;
      }
      if (thread.controlSignal === 'stop') {
        thread.status = 'stopped';
        thread.controlSignal = undefined;
        thread.pendingApproval = undefined;
        markTurn(thread, 'cancelled');
        events.emit(thread, 'execution_stopped', {});
        events.save(thread);
        return;
      }
      if (thread.pendingSteer) {
        events.message(thread, 'user', 'prompt', thread.pendingSteer, thread.turnId);
        events.emit(thread, 'steer_applied', { prompt: thread.pendingSteer });
        thread.consecutiveNoProgress = 0;
        thread.blockedCount = 0;
        thread.blockedConditionFingerprint = undefined;
        thread.decisionSteps = 0;
        thread.pendingSteer = undefined;
        events.save(thread);
      }

      if (budgetExhausted(thread, bundle.budget.maxDecisionSteps)) {
        const reason = `决策步预算（${bundle.budget.maxDecisionSteps}）已用完，请确认是否继续或调整目标。`;
        pauseWithQuestions(thread, components, makePauseQuestions(thread, 'budget', reason), reason);
        events.emit(thread, 'budget_paused', { kind: 'decision_steps', max: bundle.budget.maxDecisionSteps });
        return;
      }
      if (stalled(thread)) {
        if (thread.consecutiveNoProgress >= NO_PROGRESS_THRESHOLD * NO_PROGRESS_ESCALATION_FACTOR) {
          markBlocked(thread, components, `连续 ${thread.consecutiveNoProgress} 步没有进展，自动继续未能解决，需要你决定下一步。`);
          return;
        }
        recordBlockedCondition(thread, blockingFingerprint('no_progress', '连续无进展未解决'));
        const lastGateFailure = [...thread.events].reverse().find((event) => event.type === 'gate_failed' && /目标交付物缺失/.test(JSON.stringify(event.data)));
        const gateHint = lastGateFailure ? ` 最近门禁缺口：${String(lastGateFailure.data?.failures?.join('；') || '').slice(0, 300)}` : '';
        events.observe(thread, {
          toolName: 'loop.nudge',
          scope: 'project',
          status: 'failed',
          summary: `连续 ${NO_PROGRESS_THRESHOLD} 步没有进展（自动继续）：请立即换一种方案推进当前目标。缺少必要信息时先做一次只读获取真实字段/现状，然后直接调用写工具；对可自行决定的信息选择合理默认值并记录决策，不要重复此前的只读调用，也不要就同一问题再次提问。${gateHint}`,
          changes: [],
          evidence: [],
          unresolved: ['必须推进目标或使用合理默认值'],
          error: { category: 'no_progress', message: '连续无进展（自动继续）', retryable: true },
        });
        events.emit(thread, 'no_progress_auto_continue', { blockedCount: thread.blockedCount, consecutiveNoProgress: thread.consecutiveNoProgress });
        fingerprint = recordProgress(thread, fingerprint);
        continue;
      }
      if (thread.blockedCount >= BLOCKED_THRESHOLD) {
        markBlocked(thread, components, thread.blockedConditionFingerprint || '同一问题重复出现');
        return;
      }

      let decision: LoopDecision;
      try {
        decision = hooks.decide ? await hooks.decide(thread, run, bundle) : await components.model.decide(thread, run, bundle);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        thread.decisionSteps += 1;
        const failureClass = classifyFailureMessage(message);
        recordBlockedCondition(thread, blockingFingerprint(failureClass, message));
        events.emit(thread, 'decision_failed', { error: message, failureClass, attempt: thread.blockedCount });
        if (thread.blockedCount >= BLOCKED_THRESHOLD) {
          markBlocked(thread, components, `连续决策失败：${message}`);
          return;
        }
        fingerprint = recordProgress(thread, fingerprint);
        continue;
      }
      thread.decisionSteps += 1;

      if (decision.action === 'ask_user') {
        pauseWithQuestions(thread, components, decision.questions, decision.summary || '需要你补充信息');
        return;
      }
      if (decision.action === 'complete') {
        if (gateRequiresWrite) {
          // 门禁失败后禁止空转：必须先执行写工具补齐交付物，不能直接再次声明完成。
          events.observe(thread, {
            toolName: 'verify.gate',
            scope: 'project',
            status: 'failed',
            summary: '完成门禁未通过后必须先执行写工具补齐交付物，禁止直接再次声明完成。请立即创建缺失的表单/数据表/规则/数据等交付物后再试。',
            changes: [],
            evidence: [],
            unresolved: ['先写后完成'],
            error: { category: 'no_progress', message: '门禁未通过后直接声明完成被拒绝', retryable: true },
          });
          fingerprint = recordProgress(thread, fingerprint);
          continue;
        }
        markTurn(thread, 'verifying');
        events.emit(thread, 'verification.started', { kind: 'final' });
        if (thread.selfReviewedPlanKey !== thread.dynamicPlan?.updatedAt && hasSucceededChanges(thread)) {
          const review = await (hooks.selfReview || components.verification.selfReview)(thread, run);
          if (review.issues.length) {
            const message = `完成前自审发现问题：${review.issues.join('；')}`;
            events.observe(thread, {
              toolName: 'verify.self_review',
              scope: 'project',
              status: 'failed',
              summary: message,
              changes: [],
              evidence: review.issues,
              unresolved: review.issues,
              error: { category: 'validation', message, retryable: true },
            });
            thread.recoveryCycles += 1;
            events.emit(thread, 'self_review_failed', { issues: review.issues, recoveryCycles: thread.recoveryCycles });
            if (thread.recoveryCycles >= recoveryBudget(bundle)) {
              pauseWithQuestions(thread, components, makePauseQuestions(thread, 'blocked', `完成前自审连续未通过且恢复预算已用尽，请人工处理：${review.issues.join('；')}`), `完成前自审未通过：${review.issues.join('；')}`);
              return;
            }
            fingerprint = recordProgress(thread, fingerprint);
            continue;
          }
          thread.selfReviewedPlanKey = thread.dynamicPlan?.updatedAt;
          events.emit(thread, 'self_review_passed', { planKey: thread.selfReviewedPlanKey });
        }
        const gate = await components.verification.final(thread, run);
        for (const item of gate.evidence) {
          events.emit(thread, 'gate_evidence', { kind: item.kind, summary: item.summary });
        }
        if (gate.passed) {
          thread.status = 'completed';
          markTurn(thread, 'completed');
          events.message(thread, 'assistant', 'answer', decision.finalAnswer || `已完成：${thread.dynamicPlan?.goal || ''}`, thread.turnId);
          events.emit(thread, 'thread_completed', { finalAnswer: decision.finalAnswer || '' });
          events.save(thread);
          return;
        }
        const message = `完成门禁未通过：${gate.failures.join('；')}`;
        events.observe(thread, {
          toolName: 'verify.final',
          scope: 'project',
          status: 'failed',
          summary: message,
          changes: [],
          evidence: [],
          unresolved: gate.failures,
          error: { category: 'validation', message, retryable: true },
        });
        events.emit(thread, 'gate_failed', { failures: gate.failures, blockedCount: thread.blockedCount, recoveryCycles: thread.recoveryCycles });
        gateRequiresWrite = true;
        recordBlockedCondition(thread, blockingFingerprint('validation', message));
        thread.recoveryCycles += 1;
        if (thread.recoveryCycles >= recoveryBudget(bundle)) {
          pauseWithQuestions(thread, components, makePauseQuestions(thread, 'blocked', `完成门禁连续未通过且恢复预算已用尽，请人工处理：${message}`), message);
          return;
        }
        fingerprint = recordProgress(thread, fingerprint);
        continue;
      }

      // action === 'act'
      if (decision.batchReads?.length && decision.toolName) {
        const allReadOnly = decision.batchReads.every((read) => !components.isWriteTool(String(read.toolName || '')));
        if (allReadOnly) {
          decision.toolName = undefined;
          decision.arguments = undefined;
        } else {
          decision.batchReads = undefined;
        }
        events.emit(thread, 'decision_normalized', { reason: 'toolName_and_batchReads', resolved: allReadOnly ? 'batch_reads' : 'tool_name' });
      }
      if (decision.batchReads?.length) {
        const invalid = decision.batchReads.find((read) => components.isWriteTool(String(read.toolName || '')));
        if (invalid) {
          events.observe(thread, {
            toolName: invalid.toolName,
            scope: decision.scope,
            status: 'failed',
            summary: `batchReads 只能包含只读工具：${invalid.toolName} 是写工具，本轮已拒绝。`,
            changes: [],
            evidence: [],
            unresolved: ['批量只读只能放只读工具，写操作请用 toolName'],
            error: { category: 'tool_scope', message: '批量只读包含写工具', retryable: true },
          });
          events.bumpMetric(thread, { invalidToolCalls: 1 });
          fingerprint = recordProgress(thread, fingerprint);
          continue;
        }
        markTurn(thread, 'running_tool');
        await components.reads.batch(thread, run, decision, bundle);
        consecutiveReads += 1;
        fingerprint = recordProgress(thread, fingerprint);
        continue;
      }
      if (decision.toolName === 'context.read_artifact') {
        const observation = await components.reads.readArtifact(thread, decision);
        if (!observation) {
          events.observe(thread, {
            toolName: 'context.read_artifact',
            scope: 'project',
            status: 'failed',
            summary: `artifact ${String(decision.arguments?.artifactId || '（未提供）')} 不存在`,
            changes: [],
            evidence: [],
            unresolved: ['检查 artifactId 或稍后重试'],
            error: { category: 'invalid_arguments', message: 'artifact 不存在', retryable: false },
          });
          events.bumpMetric(thread, { invalidToolCalls: 1 });
        } else {
          events.observe(thread, observation);
          events.bumpMetric(thread, { toolCalls: 1 });
        }
        consecutiveReads += 1;
        fingerprint = recordProgress(thread, fingerprint);
        continue;
      }

      const wasRead = decision.toolName ? !components.isWriteTool(decision.toolName) && decision.toolName !== 'plan.update' : false;
      if (wasRead && !hasWritten && consecutiveReads >= READ_BEFORE_WRITE_LIMIT && !components.isVerificationRead(decision.toolName || '')) {
        events.observe(thread, {
          toolName: decision.toolName,
          scope: decision.scope,
          status: 'failed',
          summary: `连续 ${READ_BEFORE_WRITE_LIMIT} 次只读调用没有推进目标，本轮已拒绝只读工具 ${decision.toolName}。请立即调用写工具完成当前目标，或调用 plan.update 说明卡点。`,
          changes: [],
          evidence: [],
          unresolved: ['必须调用写工具、验证工具或暂停'],
          error: { category: 'no_progress', message: '连续只读调用被拒绝', retryable: true },
        });
        recordBlockedCondition(thread, blockingFingerprint('no_progress', '连续只读调用被拒绝'));
        fingerprint = recordProgress(thread, fingerprint);
        continue;
      }

      const toolStartedAt = Date.now();
      events.emit(thread, 'tool.started', { toolName: decision.toolName, scope: decision.scope });
      markTurn(thread, 'running_tool');
      let outcome: 'succeeded' | 'failed' | 'waiting' | 'refreshed';
      try {
        outcome = await components.recovery.executeWithRecovery(thread, run, decision, bundle);
        events.emit(thread, 'tool.completed', { toolName: decision.toolName, status: outcome, durationMs: Date.now() - toolStartedAt });
      } catch (error) {
        events.emit(thread, 'tool.completed', { toolName: decision.toolName, status: 'failed', durationMs: Date.now() - toolStartedAt });
        const message = error instanceof Error ? error.message : String(error);
        const failureClass = classifyFailureMessage(message);
        events.observe(thread, {
          toolName: decision.toolName,
          scope: decision.scope,
          status: 'failed',
          summary: message,
          changes: [],
          evidence: [],
          unresolved: [message],
          error: { category: failureClass, message, retryable: false },
        });
        recordBlockedCondition(thread, blockingFingerprint(failureClass, message));
        if (thread.blockedCount >= BLOCKED_THRESHOLD) {
          markBlocked(thread, components, message);
          return;
        }
        fingerprint = recordProgress(thread, fingerprint);
        continue;
      }

      if (outcome === 'waiting') {
        markTurn(thread, 'waiting_approval');
        return;
      }

      if (outcome === 'succeeded') {
        // 按实际执行的工具判定：lint 触发自动写规则时，tool_call 记录的是 rule_code.update（写）。
        const executedTool = [...thread.events].reverse().find((event) => event.type === 'tool_call')?.data?.toolName as string | undefined;
        const executedWrite = Boolean(executedTool && components.isWriteTool(executedTool));
        if (!executedWrite) {
          consecutiveReads += 1;
        } else {
          consecutiveReads = 0;
          gateRequiresWrite = false;
          hasWritten = true;
          if (executedTool !== 'plan.update') {
            const projectId = components.toolProjectId(thread, decision);
            if (projectId && decision.scope) {
              markTurn(thread, 'verifying');
              await components.verification.afterWrite(thread, run, decision.scope, projectId);
            }
          }
        }
      } else {
        const message = lastFailureMessage(thread);
        recordBlockedCondition(thread, blockingFingerprint(lastFailureClass(thread), message));
        if (thread.blockedCount >= BLOCKED_THRESHOLD) {
          markBlocked(thread, components, message || '连续失败');
          return;
        }
      }

      fingerprint = recordProgress(thread, fingerprint);
    }
  } finally {
    await components.events.flushMetrics(thread).catch(() => undefined);
    await releaseAgentThreadLease(thread.id);
  }
}

function pauseWithQuestions(thread: AgentThread, components: HarnessComponents, questions: LoopDecision['questions'], reason: string) {
  const events = components.events;
  thread.status = 'paused';
  const resolved = (questions?.length ? questions : makePauseQuestions(thread, 'manual', reason)).map((question) => ({ ...question }));
  events.message(thread, 'assistant', 'question', resolved.map((item) => item.question).join('\n') || reason, thread.turnId, resolved);
  events.emit(thread, 'question_asked', { questions: resolved, reason });
  events.bumpMetric(thread, { pauses: 1 });
  markTurn(thread, 'failed', reason);
  events.save(thread);
}

function markBlocked(thread: AgentThread, components: HarnessComponents, reason: string) {
  const events = components.events;
  thread.status = 'blocked';
  const questions = makePauseQuestions(thread, 'blocked', `任务卡住了：${reason}。请告诉我如何处理。`);
  events.message(thread, 'assistant', 'question', questions[0].question, thread.turnId, questions);
  events.emit(thread, 'thread_blocked', { reason, blockedCount: thread.blockedCount });
  markTurn(thread, 'failed', reason);
  events.save(thread);
}

function recoveryBudget(bundle: CapabilityBundleVersion) {
  return bundle.budget?.maxRecoveryCycles ?? 6;
}

function lastFailureClass(thread: AgentThread): string {
  for (const event of [...thread.events].reverse()) {
    if (event.type === 'tool_observation' && event.data?.status === 'failed' && event.data?.error?.category) return String(event.data.error.category);
    if (event.type === 'tool.failed' && event.data?.failureClass) return String(event.data.failureClass);
  }
  return 'unknown';
}

function lastFailureMessage(thread: AgentThread): string {
  for (const event of [...thread.events].reverse()) {
    if (event.type === 'tool_observation' && event.data?.status === 'failed' && event.data?.summary) return String(event.data.summary);
    if (event.type === 'tool.failed' && event.data?.error) return String(event.data.error);
  }
  return '';
}

/** 失败分类（harness 通用规则，与工具系统解耦）。 */
export function classifyFailureMessage(message: string, code?: string): string {
  if (code === 'PROJECT_REVISION_CONFLICT' || /REVISION_CONFLICT|revision 冲突|项目在.*更新/i.test(message)) return 'revision_conflict';
  if (/FORBIDDEN|无权|权限/.test(message)) return 'permission';
  if (/INVALID_ARGUMENT|REQUIRED_ARGUMENT|INVALID_ID|INVALID_.*|缺少|参数/.test(message)) return 'invalid_arguments';
  if (/VALIDATION|校验未通过|语法|结构问题/.test(message)) return 'validation';
  if (/不在.*作用域|白名单/.test(message)) return 'tool_scope';
  if (/无法连接|未运行|timeout|超时|暂不可用|暂时/.test(message)) return 'transient';
  if (/用户拒绝|用户明确/.test(message)) return 'user_rejected';
  return 'unknown';
}
