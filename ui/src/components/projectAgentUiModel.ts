/**
 * Thread-based project agent UI model (V4 single-loop).
 */

export type ProjectAgentRole = 'project' | 'data' | 'form' | 'workflow' | 'behavior' | 'quality' | 'delivery';
export type ProjectAgentStatus = 'idle' | 'planning' | 'awaiting_plan_approval' | 'executing' | 'awaiting_operation_approval' | 'paused' | 'completed' | 'blocked' | 'stopped' | 'failed';
export type ProjectAgentConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type ProjectAgentSessionScope = 'project' | 'unbound' | 'all';
export type ProjectAgentHistoryStatus = 'active' | 'attention' | 'completed';
export type ProjectAgentMessageKind = 'prompt' | 'commentary' | 'answer' | 'question' | 'approval';
export type ProjectAgentMode = 'plan' | 'goal';

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

export interface ProjectAgentTask {
  id: string;
  title: string;
  instruction: string;
  scope: ProjectAgentRole;
  access: 'read' | 'write';
  projectId?: string;
  acceptance: string[];
  status: 'pending' | 'running' | 'passed' | 'failed' | 'blocked' | 'superseded' | 'cancelled';
  attempt: number;
  maxAttempts: number;
  toolSteps: number;
  evidence: ProjectAgentEvidence[];
  error?: string;
  failureClass?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAgentPlan {
  id: string;
  revision: number;
  request: string;
  goal: string;
  successCriteria: string[];
  summary: string;
  assumptions: string[];
  risks: string[];
  tasks: ProjectAgentTask[];
  status: 'pending' | 'confirmed' | 'rejected' | 'executed' | 'superseded';
  rejectReason?: string;
  createdAt: string;
  confirmedAt?: string;
}

export interface ProjectAgentApproval {
  id: string;
  toolName: string;
  taskId: string;
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
  schemaVersion: 1;
  id: string;
  tenantId: string;
  userId: string;
  projectIds: string[];
  currentProjectId?: string;
  projectRevisions: Record<string, string>;
  title: string;
  profileId: string;
  capabilityBundleVersionId: string;
  mode: ProjectAgentMode;
  status: ProjectAgentStatus;
  turnId?: string;
  plan?: ProjectAgentPlan;
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
  selfReviewedPlanRevision?: number;
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

/** MCP 角色 → 中文名。 */
export const roleLabels: Record<ProjectAgentRole, string> = { project: '项目', data: '数据', form: '表单', workflow: '流程', behavior: '行为', quality: '质量', delivery: '交付' };
/** 线程状态 → 中文名。 */
export const statusLabels: Record<ProjectAgentStatus, string> = {
  idle: '等待输入', planning: '生成计划', awaiting_plan_approval: '等待确认计划', executing: '执行中',
  awaiting_operation_approval: '等待操作确认', paused: '已暂停', completed: '已完成', blocked: '已受阻', stopped: '已停止', failed: '失败',
};
/** 状态栏等紧凑场景使用的短标签。 */
/** 线程状态 → 短中文名。 */
export const statusLabelsShort: Record<ProjectAgentStatus, string> = {
  idle: '待', planning: '规划', awaiting_plan_approval: '待确认', executing: '执行',
  awaiting_operation_approval: '待批准', paused: '暂停', completed: '完成', blocked: '受阻', stopped: '停止', failed: '失败',
};
/** 状态符号：配合 title 提示使用，减少视觉文字。 */
/** 线程状态 → 符号。 */
export const statusSymbols: Record<ProjectAgentStatus, string> = {
  idle: '·', planning: '…', awaiting_plan_approval: '◎', executing: '⚙',
  awaiting_operation_approval: '⚠', paused: '⏸', completed: '✓', blocked: '✕', stopped: '⏹', failed: '!',
};
/** 模式 → 中文名。 */
export const modeLabels: Record<ProjectAgentMode, string> = { plan: '计划模式', goal: '目标模式' };
/** 模式 → 短中文名。 */
export const modeLabelsShort: Record<ProjectAgentMode, string> = { plan: '计划', goal: '目标' };
/** 任务状态 → 中文名。 */
export const taskStatusLabels: Record<ProjectAgentTask['status'], string> = {
  pending: '待执行', running: '执行中', passed: '已完成', failed: '失败', blocked: '受阻', superseded: '已替代', cancelled: '已取消',
};

const activeStatuses = new Set<ProjectAgentStatus>(['planning', 'executing']);

function eventTimestamp(value?: string) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

/** 计算线程当前活动状态（运行/等待/暂停/完成）。 */
export function projectAgentActivityState(thread: ProjectAgentThread | null, now = Date.now()): ProjectAgentActivityState {
  if (!thread || !activeStatuses.has(thread.status)) return { active: false, label: '', detail: '', stale: false };
  const runningTask = thread.plan?.tasks.find((task) => task.status === 'running');
  const lastEvent = thread.events[thread.events.length - 1];
  const startedAt = eventTimestamp(thread.updatedAt) || eventTimestamp(lastEvent?.createdAt);
  const lastEventAt = eventTimestamp(lastEvent?.createdAt);
  const stale = Boolean(lastEventAt && now - lastEventAt >= 60_000);
  return {
    active: true,
    label: runningTask ? `正在处理：${runningTask.title}` : thread.status === 'planning' ? '正在生成目标契约' : '正在判断下一步',
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
    turn_started: '请求已提交。', grounding_completed: '项目现状已查看。', plan_proposed: '目标契约已生成，等待确认。', plan_confirmed: '目标契约已确认，开始执行。',
    plan_rejected: '计划已按反馈重新生成。', plan_execution_started: '开始执行计划。', tool_call: '正在调用工具。', tool_observation: '已获得执行反馈。',
    revision_refreshed: '已刷新项目最新 revision。', approval_required: '破坏性操作等待确认。', approval_decided: '操作确认已完成。', operation_blocked: '操作被策略阻止。',
    task_started: '任务开始。', task_completed: '任务通过验收。', task_failed: '任务失败。', task_blocked: '任务受阻。', task_activity: '任务有新的进展。',
    gate_failed: '完成门禁未通过。', thread_completed: '目标已完成。', thread_blocked: '执行受阻，等待处理。', question_asked: '需要你补充信息。',
    execution_paused: '执行已暂停。', execution_stopped: '执行已停止。', steer_applied: '已按新要求转向。', decision_failed: '决策失败，正在重试。',
    budget_paused: '决策预算已用尽。', recovery_reset: '已重置恢复状态。', context_compacted: '对话已压缩。', turn_failed: '本轮处理失败。',
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

/** 归一化任务状态字符串。 */
export function taskStatus(value: string): ProjectAgentTask['status'] {
  if (['pending', 'running', 'passed', 'failed', 'blocked', 'superseded', 'cancelled'].includes(value)) return value as ProjectAgentTask['status'];
  return 'pending';
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

/** 选择当前活动任务 ID（进行中的任务优先）。 */
export function chooseCurrentTaskId(thread: ProjectAgentThread): string | undefined {
  const tasks = thread.plan?.tasks || [];
  if (thread.pendingApproval && tasks.some((task) => task.id === thread.pendingApproval!.taskId)) return thread.pendingApproval!.taskId;
  return tasks.find((task) => task.status === 'running')?.id
    || tasks.find((task) => task.status === 'failed')?.id
    || tasks.find((task) => task.status === 'blocked')?.id
    || tasks.find((task) => task.status === 'pending')?.id;
}

export interface ProjectAgentActivityItem {
  id: string;
  kind: 'task' | 'tool' | 'verification' | 'approval' | 'recovery' | 'error' | 'neutral';
  status: 'running' | 'passed' | 'failed' | 'warning' | 'neutral';
  title: string;
  detail?: string;
  createdAt: string;
}

/** 事件流 → 活动列表（去重、排序、聚合）。 */
export function buildProjectAgentActivity(events: ProjectAgentEvent[]): ProjectAgentActivityItem[] {
  const mapping: Record<string, [ProjectAgentActivityItem['kind'], ProjectAgentActivityItem['status'], string]> = {
    task_started: ['task', 'running', '任务开始'],
    task_completed: ['task', 'passed', '任务通过验收'],
    task_failed: ['error', 'failed', '任务失败'],
    task_blocked: ['error', 'warning', '任务受阻'],
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
    plan_proposed: ['verification', 'neutral', '目标契约已生成'],
    plan_confirmed: ['verification', 'passed', '计划已确认'],
    plan_rejected: ['verification', 'warning', '计划已重新生成'],
    steer_applied: ['recovery', 'neutral', '已应用转向'],
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

export type SurfaceItemKind = 'message' | 'plan' | 'task' | 'approval' | 'question' | 'completion' | 'blocked';
export type SurfaceState = 'idle' | 'passed' | 'failed' | 'running' | 'blocked' | 'attention';

export interface SurfaceItem {
  key: string;
  kind: SurfaceItemKind;
  state: SurfaceState;
  title: string;
  meta: string;
  ref: { messageId?: string; taskId?: string; approvalId?: string };
}

/** 计划进度（完成/总数）。 */
export function planProgress(thread: ProjectAgentThread) {
  const tasks = thread.plan?.tasks || [];
  const passed = tasks.filter((task) => task.status === 'passed').length;
  return { total: tasks.length, passed, percent: tasks.length ? Math.round((passed / tasks.length) * 100) : 0 };
}

function taskState(status: ProjectAgentTask['status']): SurfaceState {
  if (status === 'passed') return 'passed';
  if (status === 'failed' || status === 'blocked') return status === 'blocked' ? 'blocked' : 'failed';
  if (status === 'running') return 'running';
  return 'idle';
}

/** 构建会话界面条目（卡片/消息/问答）。 */
export function buildSurfaceItems(thread: ProjectAgentThread): SurfaceItem[] {
  const items: SurfaceItem[] = [];
  for (const message of thread.messages) {
    if (message.role === 'user') {
      items.push({ key: `message:${message.id}`, kind: 'message', state: 'idle', title: message.content.split('\n')[0].slice(0, 80), meta: '', ref: { messageId: message.id } });
    } else if (message.kind === 'answer') {
      items.push({ key: `message:${message.id}`, kind: 'completion', state: 'passed', title: message.content.split('\n')[0].slice(0, 80), meta: '完成', ref: { messageId: message.id } });
    } else if (message.kind === 'question') {
      const question = message.questions?.[0];
      items.push({ key: `message:${message.id}`, kind: 'question', state: 'attention', title: question?.question?.split('\n')[0].slice(0, 80) || message.content.split('\n')[0].slice(0, 80), meta: question?.header || '需要你决定', ref: { messageId: message.id } });
    } else if (message.kind === 'commentary') {
      items.push({ key: `message:${message.id}`, kind: 'message', state: 'idle', title: message.content.split('\n')[0].slice(0, 80), meta: '', ref: { messageId: message.id } });
    }
  }
  const plan = thread.plan;
  if (plan) {
    const progress = planProgress(thread);
    const statusText = plan.status === 'pending' ? '待确认' : plan.status === 'confirmed' ? '执行中' : plan.status === 'executed' ? '已完成' : plan.status === 'rejected' ? '已拒绝' : '已修订';
    items.push({ key: `plan:${plan.id}`, kind: 'plan', state: plan.status === 'pending' ? 'attention' : plan.status === 'executed' ? 'passed' : 'running', title: plan.goal, meta: `${statusText} · ${progress.passed}/${progress.total} 步`, ref: {} });
  }
  for (const task of plan?.tasks || []) {
    items.push({
      key: `task:${task.id}`,
      kind: 'task',
      state: taskState(task.status),
      title: task.title,
      meta: `${roleLabels[task.scope]} · ${taskStatusLabels[task.status]}${task.attempt ? ` · ×${task.attempt}` : ''}${task.evidence.length ? ` · ▦${task.evidence.length}` : ''}`,
      ref: { taskId: task.id },
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

/** 按 ID 查找任务。 */
export function taskById(thread: ProjectAgentThread, id?: string) {
  return thread.plan?.tasks.find((task) => task.id === id);
}

/** 线程按项目分组（当前项目在前）。 */
export function threadGroups(threads: ProjectAgentThread[], currentProjectId?: string) {
  return {
    current: currentProjectId ? threads.filter((thread) => threadProjectScope(thread).includes(currentProjectId)) : [],
    unbound: threads.filter((thread) => threadProjectScope(thread).length === 0),
    other: threads.filter((thread) => threadProjectScope(thread).length > 0 && (!currentProjectId || !threadProjectScope(thread).includes(currentProjectId))),
  };
}
