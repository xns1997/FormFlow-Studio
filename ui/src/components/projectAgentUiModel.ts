/**
 * Thread-based project agent UI model (V5 dynamic single-loop).
 */

export type ProjectAgentRole = 'project' | 'data' | 'form' | 'workflow' | 'behavior' | 'quality' | 'delivery';
export type ProjectAgentStatus = 'idle' | 'executing' | 'awaiting_operation_approval' | 'paused' | 'completed' | 'blocked' | 'stopped' | 'failed';
export type ProjectAgentConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type ProjectAgentSessionScope = 'project' | 'unbound' | 'all';
export type ProjectAgentHistoryStatus = 'active' | 'attention' | 'completed';
export type ProjectAgentMessageKind = 'prompt' | 'commentary' | 'answer' | 'question' | 'approval';
export type ProjectAgentTurnStatus = 'created' | 'preparing' | 'running_model' | 'running_tool' | 'waiting_approval' | 'verifying' | 'completed' | 'failed' | 'cancelled';

export interface ProjectAgentTurn {
  id: string;
  userInput: string;
  status: ProjectAgentTurnStatus;
  startedAt: string;
  completedAt?: string;
  failureReason?: string;
}

export interface ProjectAgentDynamicPlan {
  goal: string;
  successCriteria: string[];
  summary: string;
  steps: string[];
  assumptions: string[];
  risks: string[];
  updatedAt: string;
  updatedBy: 'model' | 'system';
}

export interface ProjectAgentQuestion {
  header: string;
  question: string;
  kind: 'choice' | 'text';
  context?: string;
  taskId?: string;
  taskTitle?: string;
  options?: Array<{ label: string; description?: string }>;
}

export interface ProjectAgentConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  kind: ProjectAgentMessageKind;
  content: string;
  questions?: ProjectAgentQuestion[];
  turnId?: string;
  createdAt: string;
}

export interface ProjectAgentEvidence {
  id: string;
  kind: string;
  summary: string;
  createdAt: string;
}

export interface ProjectAgentTurnMetrics {
  modelCalls: number;
  toolCalls: number;
  invalidToolCalls: number;
  approvals: number;
  approvalRejections: number;
  retries: number;
  compactions: number;
  pauses: number;
  tokenUsage: { prompt: number; completion: number };
  startedAt: string;
  updatedAt: string;
}

export interface ProjectAgentApproval {
  id: string;
  toolName: string;
  turnId: string;
  scope: ProjectAgentRole;
  projectId?: string;
  arguments: Record<string, any>;
  confirmation: { token: string; expiresAt: string; summary: string; impact: unknown };
  createdAt: string;
}

export interface ProjectAgentEvent {
  id: string;
  seq: number;
  type: string;
  data: any;
  createdAt: string;
}

export interface ProjectAgentThread {
  schemaVersion: 2;
  id: string;
  tenantId: string;
  userId: string;
  projectIds: string[];
  currentProjectId?: string;
  projectRevisions: Record<string, string>;
  title: string;
  profileId: string;
  capabilityBundleVersionId: string;
  status: ProjectAgentStatus;
  turnId?: string;
  dynamicPlan?: ProjectAgentDynamicPlan;
  turns: ProjectAgentTurn[];
  messages: ProjectAgentConversationMessage[];
  summary: string;
  events: ProjectAgentEvent[];
  pendingApproval?: ProjectAgentApproval;
  consecutiveNoProgress: number;
  blockedConditionFingerprint?: string;
  blockedCount: number;
  decisionSteps: number;
  recoveryCycles?: number;
  checkpointRefs?: string[];
  turnMetrics?: ProjectAgentTurnMetrics;
  context?: {
    goal: string;
    constraints: string[];
    decisions: string[];
    verification: string[];
    remainingWork: string[];
    userCorrections: string[];
    updatedAt: string;
  };
  testBaseline?: { capturedAt: string; passed: boolean; failures: string[] };
  selfReviewedPlanKey?: string;
  pinnedAt?: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAgentHistorySummary {
  id: string;
  title: string;
  projectIds: string[];
  status: ProjectAgentHistoryStatus;
  goal: string;
  taskProgress: { total: number; passed: number; failed: number; complete: boolean };
  pinnedAt?: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAgentHistoryPage {
  items: ProjectAgentHistorySummary[];
  nextCursor?: string;
}

export interface ProjectAgentScopeConfig {
  role: ProjectAgentRole;
  name: string;
  description: string;
  instructions: string;
  tools: string[];
  toolMode: 'all' | 'selected';
  knowledge: Array<{ id: string; title: string; content: string; enabled: boolean }>;
  effectiveTools?: Array<{ name: string; title: string; risk: string }>;
  availableTools?: Array<{ name: string; title: string; risk: string }>;
  skillPreview?: string;
}

export interface ProjectAgentBundle {
  id: string;
  bundleId: string;
  version: number;
  ownerId: string;
  name: string;
  description: string;
  status: 'draft' | 'published';
  scopes: ProjectAgentScopeConfig[];
  context: { recentMessages: number; maxSummaryChars: number };
  budget: { maxDecisionSteps: number; maxAttempts: number; maxToolSteps: number; maxRecoveryCycles: number };
  createdAt: string;
  publishedAt?: string;
}

export interface ProjectAgentActivityState {
  active: boolean;
  label: string;
  detail: string;
  startedAt?: number;
  lastEventAt?: number;
  stale: boolean;
}

/** 线程状态 → 中文名。 */
export const statusLabels: Record<ProjectAgentStatus, string> = {
  idle: '等待输入', executing: '执行中',
  awaiting_operation_approval: '等待操作确认', paused: '已暂停', completed: '已完成', blocked: '已受阻', stopped: '已停止', failed: '失败',
};
/** 状态栏等紧凑场景使用的短标签。 */
/** 线程状态 → 短中文名。 */
export const statusLabelsShort: Record<ProjectAgentStatus, string> = {
  idle: '待', executing: '执行',
  awaiting_operation_approval: '待批准', paused: '暂停', completed: '完成', blocked: '受阻', stopped: '停止', failed: '失败',
};
/** 状态符号：配合 title 提示使用，减少视觉文字。 */
/** 线程状态 → 符号。 */
export const statusSymbols: Record<ProjectAgentStatus, string> = {
  idle: '·', executing: '⚙',
  awaiting_operation_approval: '⚠', paused: '⏸', completed: '✓', blocked: '✕', stopped: '⏹', failed: '!',
};
const activeStatuses = new Set<ProjectAgentStatus>(['executing']);

function eventTimestamp(value?: string) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

/** 计算线程当前活动状态（运行/等待/暂停/完成）。 */
export function projectAgentActivityState(thread: ProjectAgentThread | null, now = Date.now()): ProjectAgentActivityState {
  if (!thread || !activeStatuses.has(thread.status)) return { active: false, label: '', detail: '', stale: false };
  const lastEvent = thread.events[thread.events.length - 1];
  const startedAt = eventTimestamp(thread.updatedAt) || eventTimestamp(lastEvent?.createdAt);
  const lastEventAt = eventTimestamp(lastEvent?.createdAt);
  const stale = Boolean(lastEventAt && now - lastEventAt >= 60_000);
  return {
    active: true,
    label: thread.turnId ? '正在执行当前 Turn' : '正在判断下一步',
    detail: lastEvent ? humanEventSummary(lastEvent) : '正在处理中',
    startedAt,
    lastEventAt,
    stale,
  };
}

function sentence(value?: string) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return /[。！？]$/.test(clean) ? clean : `${clean}。`;
}

/**
 * Renders an evidence/summary value as readable text. Evidence summaries may
 * be objects or JSON strings (older threads), so we never let React render a
 * raw object (which would show `[object Object]`).
 */
/** 摘要文本截断：返回短版与全文。 */
export function formatSummaryText(value: unknown, maxShort = 140): { short: string; full: string } {
  let full = '';
  if (typeof value === 'string') {
    full = value;
  } else if (value == null) {
    full = '';
  } else if (typeof value === 'object') {
    try {
      full = JSON.stringify(value, null, 2);
    } catch {
      full = String(value);
    }
  } else {
    full = String(value);
  }
  const trimmed = full.trim();
  if ((trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      full = JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      // 不是合法 JSON，保留原文。
    }
  }
  const short = full.replace(/\s+/g, ' ').trim();
  return {
    short: short.length > maxShort ? `${short.slice(0, maxShort)}…` : short,
    full,
  };
}

const EVIDENCE_KIND_LABELS: Record<string, string> = {
  tool_result: '工具结果',
  structural_validation: '结构校验',
  semantic_validation: '语义校验',
  formal_verification: '形式化验证',
  scenario_result: '场景结果',
  delivery_preview: '交付预检',
  requirement_coverage: '需求覆盖',
};

/** 证据种类 → 中文标签。 */
export function evidenceKindLabel(kind?: string) {
  return (kind && EVIDENCE_KIND_LABELS[kind]) || '证据';
}

/** 事件 → 人类可读摘要。 */
export function humanEventSummary(event: ProjectAgentEvent) {
  const exact: Record<string, string> = {
    turn_started: '请求已提交。', grounding_completed: '项目现状已查看。', tool_call: '正在调用工具。', tool_observation: '已获得执行反馈。',
    revision_refreshed: '已刷新项目最新 revision。', approval_required: '破坏性操作等待确认。', approval_decided: '操作确认已完成。', operation_blocked: '操作被策略阻止。',
    gate_failed: '完成门禁未通过。', thread_completed: '目标已完成。', thread_blocked: '执行受阻，等待处理。', question_asked: '需要你补充信息。',
    execution_paused: '执行已暂停。', execution_stopped: '执行已停止。', steer_applied: '已按新要求转向。', decision_failed: '决策失败，正在重试。',
    budget_paused: '决策预算已用尽。', recovery_reset: '已重置恢复状态。', context_compacted: '对话已压缩。', turn_failed: '本轮处理失败。',
    'turn.started': '开始新的一轮。', 'plan.generating': '正在生成动态计划。', 'plan.updated': '动态计划已更新。', plan_ready: '动态计划已就绪。',
    'verification.started': '开始验证。', 'verification.completed': '验证通过。', 'verification.failed': '验证未通过。',
    no_progress_auto_continue: '无进展，自动继续。', recovery_retry: '自动恢复重试。', 'artifact.stored': '结果已转存 artifact。',
    gate_evidence: '门禁证据。', approval_refreshed: '确认已刷新。', thread_failed: '本轮处理失败。',
    self_review_failed: '自审发现问题。', self_review_passed: '自审通过。', test_baseline_captured: '测试基线已捕获。',
  };
  if (exact[event.type]) return exact[event.type];
  const value = event.data?.summary ?? event.data?.reason ?? event.data?.error ?? event.type;
  if (typeof value === 'string' && !value.startsWith('{') && !value.startsWith('[')) return sentence(value);
  return sentence(formatSummaryText(value).short);
}

/** 事件摘要（供日志列表展示）。 */
export function summarizeProjectAgentEvent(event: ProjectAgentEvent) {
  return humanEventSummary(event);
}

/** 会话切换前是否需要暂停（运行中状态需要）。 */
export function requiresPauseBeforeSessionSwitch(status: ProjectAgentStatus) {
  return status === 'executing';
}

/** 线程绑定的项目 ID 集合。 */
export function threadProjectScope(thread: Pick<ProjectAgentThread, 'projectIds' | 'currentProjectId'>) {
  return [...new Set([...(thread.projectIds || []), ...(thread.currentProjectId ? [thread.currentProjectId] : [])])];
}

/** 会话绑定的项目 ID 集合。 */
export function sessionProjectScope(session: { projectIds?: string[]; currentProjectId?: string }) {
  return [...new Set([...(session.projectIds || []), ...(session.currentProjectId ? [session.currentProjectId] : [])])];
}

/** 历史项按时间分组（今天/本周/更早）。 */
export function groupProjectAgentHistoryByTime<T extends { pinnedAt?: string; updatedAt: string }>(items: T[], now = Date.now()) {
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = startToday.getTime() - 6 * 86_400_000;
  return {
    pinned: items.filter((item) => item.pinnedAt),
    today: items.filter((item) => !item.pinnedAt && new Date(item.updatedAt).getTime() >= startToday.getTime()),
    recent: items.filter((item) => { const time = new Date(item.updatedAt).getTime(); return !item.pinnedAt && time < startToday.getTime() && time >= sevenDaysAgo; }),
    earlier: items.filter((item) => !item.pinnedAt && new Date(item.updatedAt).getTime() < sevenDaysAgo),
  };
}

/** 选择初始会话（记忆的 id 优先，否则首个）。 */
export function chooseInitialProjectAgentSession<T extends { id: string }>(sessions: T[], rememberedId?: string | null) {
  return sessions.find((item) => item.id === rememberedId) || sessions[0];
}

/** 会话记忆的 localStorage 键。 */
export function projectAgentSessionStorageKey(projectId?: string) {
  return `formflow.projectAgent.activeThread.${projectId || 'global'}`;
}

/** 面板宽度钳制到视口允许范围。 */
export function clampProjectAgentWidth(width: number, viewportWidth: number) {
  const available = Math.max(320, viewportWidth - 24);
  return Math.round(Math.min(920, available, Math.max(viewportWidth <= 760 ? 320 : 520, width)));
}

export interface ProjectAgentActivityItem {
  id: string;
  kind: 'tool' | 'verification' | 'approval' | 'recovery' | 'error' | 'neutral';
  status: 'running' | 'passed' | 'failed' | 'warning' | 'neutral';
  title: string;
  detail?: string;
  createdAt: string;
}

/** 事件流 → 活动列表（去重、排序、聚合）。 */
export function buildProjectAgentActivity(events: ProjectAgentEvent[]): ProjectAgentActivityItem[] {
  const mapping: Record<string, [ProjectAgentActivityItem['kind'], ProjectAgentActivityItem['status'], string]> = {
    tool_call: ['tool', 'running', '调用工具'],
    tool_observation: ['tool', 'neutral', '获得执行反馈'],
    revision_refreshed: ['tool', 'neutral', '刷新项目 revision'],
    approval_required: ['approval', 'warning', '等待操作确认'],
    approval_decided: ['approval', 'passed', '操作确认完成'],
    operation_blocked: ['approval', 'failed', '操作被策略阻止'],
    gate_failed: ['verification', 'failed', '完成门禁未通过'],
    thread_completed: ['verification', 'passed', '目标已完成'],
    question_asked: ['recovery', 'warning', '需要用户补充'],
    decision_failed: ['recovery', 'warning', '决策失败，正在重试'],
    budget_paused: ['recovery', 'warning', '预算已用尽'],
    'plan.updated': ['verification', 'neutral', '动态计划已更新'],
    'verification.failed': ['verification', 'failed', '验证未通过'],
    'verification.completed': ['verification', 'passed', '验证通过'],
    steer_applied: ['recovery', 'neutral', '已应用转向'],
    no_progress_auto_continue: ['recovery', 'warning', '无进展自动继续'],
  };
  return events.map((event) => {
    const mapped = mapping[event.type];
    const toolName = event.data?.toolName ? ` · ${event.data.toolName}` : '';
    return {
      id: `activity-${event.seq}`,
      kind: mapped ? mapped[0] : 'neutral',
      status: mapped ? mapped[1] : 'neutral',
      title: mapped ? mapped[2] : humanEventSummary(event),
      detail: event.type === 'tool_observation' ? event.data?.summary : undefined,
      createdAt: event.createdAt,
    };
  });
}

// ─── Workbench surface model (HIG: concise surface, click for details) ──────

export type SurfaceItemKind = 'message' | 'plan' | 'event' | 'approval' | 'blocked';
export type SurfaceState = 'idle' | 'passed' | 'failed' | 'running' | 'blocked' | 'attention';

export interface SurfaceItem {
  key: string;
  kind: SurfaceItemKind;
  state: SurfaceState;
  title: string;
  meta: string;
  ref: { messageId?: string; eventSeq?: number; approvalId?: string };
}

/** 计划进度（v2 无任务清单：仅返回动态计划步骤数，percent 恒为 0）。 */
export function planProgress(thread: ProjectAgentThread) {
  const total = thread.dynamicPlan?.steps?.length || 0;
  return { total, passed: 0, percent: 0 };
}

/** 构建会话界面条目（卡片/消息/问答）。 */
export function buildSurfaceItems(thread: ProjectAgentThread): SurfaceItem[] {
  const items: SurfaceItem[] = [];
  for (const message of thread.messages) {
    if (message.role === 'user') {
      items.push({ key: `message:${message.id}`, kind: 'message', state: 'idle', title: message.content.split('\n')[0].slice(0, 80), meta: '', ref: { messageId: message.id } });
    } else if (message.kind === 'answer') {
      items.push({ key: `message:${message.id}`, kind: 'message', state: 'passed', title: message.content.split('\n')[0].slice(0, 80), meta: '完成', ref: { messageId: message.id } });
    } else if (message.kind === 'question') {
      const question = message.questions?.[0];
      items.push({ key: `message:${message.id}`, kind: 'message', state: 'attention', title: question?.question?.split('\n')[0].slice(0, 80) || message.content.split('\n')[0].slice(0, 80), meta: question?.header || '需要你决定', ref: { messageId: message.id } });
    } else if (message.kind === 'commentary') {
      items.push({ key: `message:${message.id}`, kind: 'message', state: 'idle', title: message.content.split('\n')[0].slice(0, 80), meta: '', ref: { messageId: message.id } });
    }
  }
  if (thread.dynamicPlan) {
    const plan = thread.dynamicPlan;
    items.push({
      key: `plan:${plan.updatedAt}`,
      kind: 'plan',
      state: 'running',
      title: plan.goal,
      meta: `动态计划 · ${new Date(plan.updatedAt).toLocaleTimeString('zh-CN')}`,
      ref: {},
    });
  }
  if (thread.pendingApproval) {
    const approval = thread.pendingApproval;
    items.push({
      key: `approval:${approval.id}`,
      kind: 'approval',
      state: 'attention',
      title: approval.confirmation.summary || approval.toolName,
      meta: `${approval.toolName} · 需要确认`,
      ref: { approvalId: approval.id },
    });
  }
  if (thread.status === 'blocked') {
    items.push({ key: 'thread:blocked', kind: 'blocked', state: 'blocked', title: '任务受阻', meta: thread.blockedConditionFingerprint || '同一问题重复出现', ref: {} });
  }
  return items;
}

/** 时间线白名单：只展示有意义的执行事件，避免 model.started 等噪音刷屏。 */
const TIMELINE_EVENT_TYPES = new Set([
  'tool_call', 'tool_observation', 'verification.started', 'verification.completed', 'verification.failed',
  'gate_failed', 'gate_evidence', 'approval_required', 'approval_decided', 'approval_refreshed',
  'plan.updated', 'question_asked', 'thread_blocked', 'thread_completed', 'execution_paused', 'execution_stopped',
  'context_compacted', 'artifact.stored', 'decision_failed', 'recovery_retry', 'no_progress_auto_continue',
  'turn.started', 'thread_failed', 'tool.completed',
]);

function eventState(type: string): SurfaceState {
  if (/failed|blocked|paused|question/.test(type)) return 'failed';
  if (/completed|passed|decided/.test(type)) return 'passed';
  if (/started|required|updated|retry|auto_continue/.test(type)) return 'running';
  return 'idle';
}

/** 事件流 → 执行时间线条目（时间正序，保留可追溯性）。 */
export function buildTimelineItems(thread: ProjectAgentThread, limit = 60): SurfaceItem[] {
  return thread.events
    .filter((event) => TIMELINE_EVENT_TYPES.has(event.type))
    .slice(-limit)
    .map((event) => {
      const time = new Date(event.createdAt).toLocaleTimeString('zh-CN', { hour12: false });
      const duration = Number(event.data?.durationMs);
      const durationText = Number.isFinite(duration) && duration > 0 ? ` · ${formatDuration(duration)}` : '';
      return {
        key: `event:${event.seq}`,
        kind: 'event' as const,
        state: eventState(event.type),
        title: humanEventSummary(event),
        meta: `${time}${durationText}`,
        ref: { eventSeq: event.seq },
      };
    });
}

export interface AgentActivityState {
  active: boolean;
  label: string;
  spinner: boolean;
  toolName?: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  'plan.generating': '正在生成动态计划…',
  'plan.updated': '计划已更新',
  'model.started': '模型思考中…',
  'model.completed': '模型已给出决策',
  'tool.started': '正在调用工具…',
  'tool.completed': '工具执行完成',
  tool_call: '正在调用工具…',
  tool_observation: '正在处理工具结果…',
  'verification.started': '正在验证…',
  'verification.completed': '验证通过',
  'verification.failed': '验证未通过，正在修复…',
  gate_failed: '门禁未通过，正在修复…',
  thread_blocked: '已受阻',
  thread_completed: '已完成',
  context_compacted: '上下文已压缩',
  recovery_retry: '正在自动重试…',
  no_progress_auto_continue: '无进展，正在换方案…',
  argument_resolved: '正在补全参数…',
  'artifact.stored': '结果已转存…',
  'checkpoint.created': '已建立检查点',
  batch_reads_completed: '批量读取完成',
};

/** 从线程最新事件推导「正在干什么」：运行中返回 spinner + 人类可读动作。 */
export function buildActivityState(thread: ProjectAgentThread | null, now = Date.now()): AgentActivityState {
  if (!thread || thread.status !== 'executing') return { active: false, label: '', spinner: false };
  const last = thread.events[thread.events.length - 1];
  const type = last?.type || '';
  let label = ACTIVITY_LABELS[type] || '';
  let toolName: string | undefined;
  if (type === 'tool_call' || type === 'tool.started') {
    toolName = String(last?.data?.toolName || '');
    label = `正在调用 ${toolName}…`;
  } else if (type === 'tool.completed') {
    toolName = String(last?.data?.toolName || '');
    label = `工具 ${toolName} 执行完成`;
  } else if (!label) {
    label = '正在执行…';
  }
  return { active: true, label, spinner: true, toolName };
}

/** 毫秒 → 人类可读时长（"42s" / "3m 5s"）。 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/** 当前 turn 已运行时长（毫秒）。 */
export function turnElapsedMs(thread: ProjectAgentThread | null, now = Date.now()): number {
  if (!thread) return 0;
  const startedAt = thread.turnMetrics?.startedAt || thread.turns.at(-1)?.startedAt || thread.updatedAt;
  const started = startedAt ? new Date(startedAt).getTime() : now;
  return Math.max(0, now - started);
}

/** 最近一个事件已持续时长（毫秒），用于「本步在干什么、用了多久」。 */
export function stepElapsedMs(thread: ProjectAgentThread | null, now = Date.now()): number {
  const last = thread?.events.at(-1);
  if (!last) return 0;
  return Math.max(0, now - new Date(last.createdAt).getTime());
}

export type UnifiedCardKind = 'plan' | 'message' | 'question' | 'approval' | 'event' | 'blocked';

/** 中栏统一卡片：计划/目标、消息、提问、审批、时间线事件、受阻——同一骨架，按 kind/state 区分。 */
export interface UnifiedCard {
  key: string;
  kind: UnifiedCardKind;
  state: SurfaceState;
  title: string;
  meta: string;
  body?: string;
  sender?: 'user' | 'agent';
  ref: { messageId?: string; eventSeq?: number };
}

/** 把线程的中栏内容抽象为统一卡片序列：计划置顶，消息与事件按时间交错，审批/受阻收尾。 */
export function buildUnifiedCards(thread: ProjectAgentThread): UnifiedCard[] {
  const cards: UnifiedCard[] = [];
  if (thread.dynamicPlan) {
    const plan = thread.dynamicPlan;
    const planState: UnifiedCard['state'] = thread.status === 'completed' ? 'passed'
      : thread.status === 'blocked' || thread.status === 'failed' ? 'blocked'
        : thread.status === 'executing' ? 'running'
          : 'idle';
    cards.push({
      key: 'card:plan',
      kind: 'plan',
      state: planState,
      title: plan.goal,
      meta: `动态计划 · ${new Date(plan.updatedAt).toLocaleTimeString('zh-CN', { hour12: false })}${plan.updatedBy === 'model' ? ' · 智能体修订' : ''}`,
      body: [
        plan.successCriteria.length ? `完成标准：${plan.successCriteria.join('；')}` : '',
        plan.steps.length ? `当前思路：${plan.steps.join(' → ')}` : '',
        plan.summary,
      ].filter(Boolean).join('\n'),
      ref: {},
    });
  }
  const merged: Array<{ time: number; order: number; card: UnifiedCard }> = [];
  thread.messages.forEach((message, index) => {
    const time = new Date(message.createdAt).getTime();
    if (message.kind === 'question') {
      const question = message.questions?.[0];
      merged.push({
        time, order: index,
        card: {
          key: `card:${message.id}`,
          kind: 'question',
          state: 'attention',
          title: question?.question?.split('\n')[0] || message.content.split('\n')[0],
          meta: question?.header || '需要你回答',
          body: question?.context || message.content,
          sender: 'agent',
          ref: { messageId: message.id },
        },
      });
    } else {
      const messageTime = new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour12: false });
      merged.push({
        time, order: index,
        card: {
          key: `card:${message.id}`,
          kind: 'message',
          state: message.kind === 'answer' ? 'passed' : 'idle',
          title: message.content.split('\n')[0].slice(0, 120),
          meta: messageTime,
          body: message.content,
          sender: message.role === 'user' ? 'user' : 'agent',
          ref: { messageId: message.id },
        },
      });
    }
  });
  let eventOrder = 0;
  // 验证是同一件事：verification.started 与其随后的 completed/failed 合并为一张卡，原地更新状态。
  const terminalByStartSeq = new Map<number, ProjectAgentEvent>();
  const consumedTerminal = new Set<number>();
  {
    const pendingStarts: ProjectAgentEvent[] = [];
    for (const event of thread.events) {
      if (event.type === 'verification.started') pendingStarts.push(event);
      else if ((event.type === 'verification.completed' || event.type === 'verification.failed') && pendingStarts.length) {
        const start = pendingStarts.pop() as ProjectAgentEvent;
        terminalByStartSeq.set(start.seq, event);
        consumedTerminal.add(event.seq);
      }
    }
  }
  for (const event of thread.events) {
    if (!TIMELINE_EVENT_TYPES.has(event.type)) continue;
    if (event.type === 'verification.started') {
      const terminal = terminalByStartSeq.get(event.seq);
      const startedClock = new Date(event.createdAt).toLocaleTimeString('zh-CN', { hour12: false });
      const terminalClock = terminal ? new Date(terminal.createdAt).toLocaleTimeString('zh-CN', { hour12: false }) : '';
      const elapsed = terminal ? Math.max(0, new Date(terminal.createdAt).getTime() - new Date(event.createdAt).getTime()) : 0;
      eventOrder += 1;
      merged.push({
        time: new Date(event.createdAt).getTime(),
        order: 100000 + eventOrder,
        card: {
          key: `card:verify:${event.seq}`,
          kind: 'event',
          state: terminal ? (terminal.type === 'verification.failed' ? 'failed' : 'passed') : 'running',
          title: terminal ? humanEventSummary(terminal) : '正在验证…',
          meta: terminal ? `${startedClock} → ${terminalClock}${elapsed > 0 ? ` · ${formatDuration(elapsed)}` : ''}` : startedClock,
          body: terminal?.data?.summary ? `验证：${formatSummaryText(String(terminal.data.summary), 120).short}` : undefined,
          ref: { eventSeq: (terminal ?? event).seq },
        },
      });
      continue;
    }
    if (consumedTerminal.has(event.seq)) continue;
    eventOrder += 1;
    const time = new Date(event.createdAt).getTime();
    const duration = Number(event.data?.durationMs);
    const meta = `${new Date(event.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}${Number.isFinite(duration) && duration > 0 ? ` · ${formatDuration(duration)}` : ''}`;
    const toolName = String(event.data?.toolName || '');
    merged.push({
      time, order: 100000 + eventOrder,
      card: {
        key: `card:event:${event.seq}`,
        kind: 'event',
        state: eventState(event.type),
        title: humanEventSummary(event),
        meta,
        body: toolName ? `工具：${toolName}` : undefined,
        ref: { eventSeq: event.seq },
      },
    });
  }
  merged.sort((left, right) => left.time - right.time || left.order - right.order);
  cards.push(...merged.map((entry) => entry.card));
  if (thread.pendingApproval) {
    const approval = thread.pendingApproval;
    cards.push({
      key: `card:approval:${approval.id}`,
      kind: 'approval',
      state: 'attention',
      title: approval.confirmation.summary || approval.toolName,
      meta: `${approval.toolName} · 需要确认`,
      ref: {},
    });
  }
  if (thread.status === 'blocked') {
    cards.push({
      key: 'card:blocked',
      kind: 'blocked',
      state: 'blocked',
      title: '任务受阻',
      meta: thread.blockedConditionFingerprint || '同一问题重复出现',
      ref: {},
    });
  }
  return cards;
}

/** 构建事件日志（最新在前，限长）。 */
export function buildEventLog(thread: ProjectAgentThread, limit = 40) {
  return [...thread.events].slice(-limit).map((event) => ({
    seq: event.seq,
    type: event.type,
    toolName: event.data?.toolName,
    summary: humanEventSummary(event),
    arguments: event.data?.arguments,
    createdAt: event.createdAt,
  }));
}

/** 按 ID 查找消息。 */
export function messageById(thread: ProjectAgentThread, id?: string) {
  return thread.messages.find((message) => message.id === id);
}

/** 线程按项目分组（当前项目在前）。 */
export function threadGroups(threads: ProjectAgentThread[], currentProjectId?: string) {
  return {
    current: currentProjectId ? threads.filter((thread) => threadProjectScope(thread).includes(currentProjectId)) : [],
    unbound: threads.filter((thread) => threadProjectScope(thread).length === 0),
    other: threads.filter((thread) => threadProjectScope(thread).length > 0 && (!currentProjectId || !threadProjectScope(thread).includes(currentProjectId))),
  };
}
