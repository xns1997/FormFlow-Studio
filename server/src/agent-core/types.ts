/**
 * Agent Core domain types.
 *
 * Single-loop project agent: a thread owns one active plan (goal contract +
 * task checklist), a message list, and a monotonic event stream. There is no
 * coordinator/expert dual-track and no gRPC agent runtime; the loop calls
 * MCP tools directly under role scopes.
 */
import type { AuthUser } from '../middleware/auth';
import type { McpRole } from '../services/tool-shared';

// ─── Thread / plan / task ─────────────────────────────────────────────────────

export type ThreadStatus =
  | 'idle'
  | 'planning'
  | 'awaiting_plan_approval'
  | 'executing'
  | 'awaiting_operation_approval'
  | 'paused'
  | 'completed'
  | 'blocked'
  | 'stopped'
  | 'failed';

export type AgentMode = 'plan' | 'goal';

export type ThreadMessageKind = 'prompt' | 'commentary' | 'answer' | 'question' | 'approval';

export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  kind: ThreadMessageKind;
  content: string;
  /** 结构化问题（暂停等待用户补充时携带上下文与建议选项）。 */
  questions?: LoopQuestion[];
  turnId?: string;
  createdAt: string;
}

export type TaskAccess = 'read' | 'write';
export type TaskStatus = 'pending' | 'running' | 'passed' | 'failed' | 'blocked' | 'superseded' | 'cancelled';
export type FailureClass =
  | 'transient'
  | 'revision_conflict'
  | 'tool_scope'
  | 'invalid_arguments'
  | 'validation'
  | 'permission'
  | 'user_rejected'
  | 'no_progress'
  | 'blocked'
  | 'budget_exhausted'
  | 'unknown';

export type EvidenceKind = 'tool_result' | 'structural_validation' | 'semantic_validation' | 'scenario_result' | 'formal_verification' | 'delivery_preview' | 'requirement_coverage';

export interface AgentEvidence {
  id: string;
  kind: EvidenceKind;
  summary: string;
  data?: unknown;
  createdAt: string;
}

export interface AgentTask {
  id: string;
  title: string;
  instruction: string;
  scope: McpRole;
  access: TaskAccess;
  projectId?: string;
  acceptance: string[];
  status: TaskStatus;
  attempt: number;
  maxAttempts: number;
  toolSteps: number;
  startRevision?: string;
  endRevision?: string;
  evidence: AgentEvidence[];
  error?: string;
  failureClass?: FailureClass;
  createdAt: string;
  updatedAt: string;
}

export type PlanStatus = 'pending' | 'confirmed' | 'rejected' | 'executed' | 'superseded';

export interface AgentPlan {
  id: string;
  revision: number;
  request: string;
  goal: string;
  successCriteria: string[];
  summary: string;
  assumptions: string[];
  risks: string[];
  tasks: AgentTask[];
  status: PlanStatus;
  rejectReason?: string;
  createdAt: string;
  confirmedAt?: string;
}

export interface PendingApproval {
  id: string;
  toolName: string;
  taskId: string;
  scope: McpRole;
  arguments: Record<string, any>;
  projectId?: string;
  projectRevision?: string;
  confirmation: { token: string; expiresAt: string; summary: string; impact: unknown };
  createdAt: string;
}

export interface ThreadEvent {
  id: string;
  seq: number;
  type: string;
  data: any;
  createdAt: string;
}

export interface AgentThread {
  schemaVersion: 1;
  id: string;
  tenantId: string;
  userId: string;
  projectIds: string[];
  currentProjectId?: string;
  projectRevisions: Record<string, string>;
  /** 执行期缓存的每个项目现状快照，用于减少模型为确认现状而反复只读。 */
  projectSnapshots?: Record<string, { capturedAt: string; summary: Record<string, unknown> }>;
  title: string;
  profileId: string;
  capabilityBundleVersionId: string;
  mode: AgentMode;
  status: ThreadStatus;
  turnId?: string;
  plan?: AgentPlan;
  messages: ThreadMessage[];
  summary: string;
  events: ThreadEvent[];
  pendingApproval?: PendingApproval;
  controlSignal?: 'pause' | 'stop' | 'steer';
  pendingSteer?: string;
  consecutiveNoProgress: number;
  blockedConditionFingerprint?: string;
  blockedCount: number;
  /** 自动恢复周期计数：瞬时重试/冲突重算/门禁自动修复均消耗。 */
  recoveryCycles: number;
  decisionSteps: number;
  /** 结构化上下文契约（压缩后保留）。 */
  context?: ThreadContext;
  /** artifact 索引（payload 存文件/PG）。 */
  artifacts?: Record<string, ArtifactMeta>;
  /** 当前 turn 的运行指标。 */
  turnMetrics?: TurnMetrics;
  /** 每个写任务执行前自动建立的检查点引用。 */
  checkpointRefs?: string[];
  /** 执行开始时的测试基线（写计划）。 */
  testBaseline?: TestBaseline;
  /** 已完成自审的计划 revision（避免重复自审）。 */
  selfReviewedPlanRevision?: number;
  pinnedAt?: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RunContext {
  tenantId: string;
  userId: string;
  user?: AuthUser;
  requestId: string;
}

// ─── Loop decision / observation ──────────────────────────────────────────────

export type LoopAction = 'act' | 'complete' | 'ask_user' | 'pause' | 'replan';

/** 一步决策内最多允许的批量只读调用数（写/破坏性仍一步一个）。 */
export const MAX_BATCH_READS = 3;

export interface LoopBatchRead {
  toolName: string;
  scope?: McpRole;
  arguments?: Record<string, any>;
  taskId?: string;
}

export interface LoopQuestion {
  header: string;
  question: string;
  kind: 'choice' | 'text';
  /** 为什么需要用户补充：当前任务、最近失败、进度等上下文。 */
  context?: string;
  /** 关联的计划步骤（任务），用于前端把提问与步骤交叉展示。 */
  taskId?: string;
  taskTitle?: string;
  options?: Array<{ label: string; description?: string }>;
}

export interface LoopDecision {
  action: LoopAction;
  summary: string;
  reason?: string;
  toolName?: string;
  scope?: McpRole;
  arguments?: Record<string, any>;
  /** 批量只读（最多 MAX_BATCH_READS 个，全部必须是只读工具）。 */
  batchReads?: LoopBatchRead[];
  /** replan 动作的原因/约束（action=replan 时必填）。 */
  replanReason?: string;
  taskId?: string;
  completeTaskIds?: string[];
  questions?: LoopQuestion[];
  finalAnswer?: string;
}

/** 结构化上下文契约：压缩后保留的关键状态（参考书 ContextManager 压缩建议）。 */
export interface ThreadContext {
  goal: string;
  constraints: string[];
  decisions: string[];
  verification: string[];
  remainingWork: string[];
  userCorrections: string[];
  updatedAt: string;
}

/** Artifact 索引条目；完整载荷存文件（本地）或 PG 表（云端）。 */
export interface ArtifactMeta {
  id: string;
  kind: string;
  size: number;
  summary: string;
  storedAt: string;
}

/** 每个 turn 的运行指标，用于「运行统计」与评测基线。 */
export interface TurnMetrics {
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

/** 执行开始前的测试基线：区分「预存失败」（不阻塞）与「引入失败」（阻塞）。 */
export interface TestBaseline {
  capturedAt: string;
  passed: boolean;
  failures: string[];
}

export interface LoopObservation {
  taskId?: string;
  toolName?: string;
  scope?: McpRole;
  status: 'succeeded' | 'failed' | 'waiting_confirmation' | 'refreshed';
  summary: string;
  changes: string[];
  evidence: string[];
  unresolved: string[];
  error?: { category: string; message: string; retryable: boolean; suggestion?: string };
}

// ─── Capability bundle (scope configs) ────────────────────────────────────────

export interface ScopeConfig {
  role: McpRole;
  name: string;
  description: string;
  instructions: string;
  tools: string[];
  toolMode: 'all' | 'selected';
  knowledge: Array<{ id: string; title: string; content: string; enabled: boolean }>;
}

export interface CapabilityBundleVersion {
  id: string;
  bundleId: string;
  version: number;
  ownerId: string;
  name: string;
  description: string;
  status: 'draft' | 'published';
  scopes: ScopeConfig[];
  context: { recentMessages: number; maxSummaryChars: number; maxPromptChars?: number };
  budget: { maxDecisionSteps: number; maxAttempts: number; maxToolSteps: number; maxRecoveryCycles: number };
  createdAt: string;
  publishedAt?: string;
}

// ─── History ──────────────────────────────────────────────────────────────────

export type ThreadHistoryStatus = 'active' | 'attention' | 'completed';

export interface ThreadHistorySummary {
  id: string;
  title: string;
  projectIds: string[];
  status: ThreadHistoryStatus;
  goal: string;
  taskProgress: { total: number; passed: number; failed: number; complete: boolean };
  pinnedAt?: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadHistoryPage {
  items: ThreadHistorySummary[];
  nextCursor?: string;
}
