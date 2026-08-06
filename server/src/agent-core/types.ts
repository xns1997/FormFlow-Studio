/**
 * Agent Core domain types (v2, schemaVersion 2).
 *
 * Codex-style single-loop dynamic execution: a thread owns a dynamic plan
 * (display only), a message list, a monotonic event stream and a sequence of
 * turns. Each turn runs the model↔tool↔verification loop until completion,
 * a user question, an approval, or a terminal failure. v1 task-checklist
 * records are ignored entirely.
 */
import type { AuthUser } from '../middleware/auth';
import type { McpRole } from '../services/tool-shared';

// ─── Thread / dynamic plan / turn ────────────────────────────────────────────

export type ThreadStatus =
  | 'idle'
  | 'executing'
  | 'awaiting_operation_approval'
  | 'paused'
  | 'completed'
  | 'blocked'
  | 'stopped'
  | 'failed';

export type TurnStatus =
  | 'created'
  | 'preparing'
  | 'running_model'
  | 'running_tool'
  | 'waiting_approval'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

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

/**
 * 动态展示型计划：由 grounding 初始化、模型通过 plan.update 随时修订。
 * 仅用于展示与上下文，不约束执行、无需用户确认。
 */
export interface DynamicPlan {
  goal: string;
  successCriteria: string[];
  summary: string;
  /** 当前思路/剩余步骤的简要列表（展示用）。 */
  steps: string[];
  assumptions: string[];
  risks: string[];
  updatedAt: string;
  updatedBy: 'model' | 'system';
}

/** 一次用户输入对应的 Turn 记录（状态由事件流驱动）。 */
export interface TurnRecord {
  id: string;
  userInput: string;
  status: TurnStatus;
  startedAt: string;
  completedAt?: string;
  failureReason?: string;
}

export interface PendingApproval {
  id: string;
  toolName: string;
  turnId: string;
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
  schemaVersion: 2;
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
  status: ThreadStatus;
  turnId?: string;
  dynamicPlan?: DynamicPlan;
  /** 动态计划对应的最近用户消息 id（用于判断新输入是否需要重新规划）。 */
  dynamicPlanPromptId?: string;
  turns: TurnRecord[];
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
  /** 写操作前自动建立的检查点引用（按 projectId+revision 去重）。 */
  checkpointRefs?: string[];
  /** 执行开始时的测试基线。 */
  testBaseline?: TestBaseline;
  /** 已完成自审的动态计划 key（dynamicPlan.updatedAt），避免重复自审。 */
  selfReviewedPlanKey?: string;
  /** 当前 turn 的完成门禁模式：light（结构+交付物覆盖，跳过回归/预检）或 full（默认，完整门禁）。 */
  completionGate?: 'light' | 'full';
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

export type LoopAction = 'act' | 'ask_user' | 'complete';

/** 一步决策内最多允许的批量只读调用数（写/破坏性仍一步一个）。 */
export const MAX_BATCH_READS = 3;

export interface LoopBatchRead {
  toolName: string;
  scope?: McpRole;
  arguments?: Record<string, any>;
}

export interface LoopQuestion {
  header: string;
  question: string;
  kind: 'choice' | 'text';
  /** 为什么需要用户补充：当前目标、最近失败、进度等上下文。 */
  context?: string;
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
  total: number;
  nextCursor?: string;
}
