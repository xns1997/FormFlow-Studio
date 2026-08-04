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
  decisionSteps: number;
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

export type LoopAction = 'act' | 'complete' | 'ask_user' | 'pause';

export interface LoopQuestion {
  header: string;
  question: string;
  kind: 'choice' | 'text';
  /** 为什么需要用户补充：当前任务、最近失败、进度等上下文。 */
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
  taskId?: string;
  completeTaskIds?: string[];
  questions?: LoopQuestion[];
  finalAnswer?: string;
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
  context: { recentMessages: number; maxSummaryChars: number };
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
