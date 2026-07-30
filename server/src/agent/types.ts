// ─── Re-export all V2 types ───────────────────────────────────────────────────
export type {
  AgentPhase,
  AgentTaskAccess,
  AgentTaskStatus,
  AgentTaskOrigin,
  AgentFailureClass,
  ProjectAgentSessionScope,
  AgentRequirementStatus,
  AgentEvidenceKind,
  AgentRequirement,
  AgentRequirementCoverage,
  AgentQuestion,
  AgentArtifact,
  AgentTaskNode,
  AgentRoundExpertDecision,
  AgentAssignment,
  NextActionDecision,
  AgentObservation,
  AgentOrchestrationStep,
  AgentOrchestrationRound,
  AgentOrchestrationState,
  AgentPlanRevision,
  AgentEvent,
  PendingApproval,
  CapabilityAgentConfig,
  CapabilityAgentKnowledge,
  CapabilityBundleVersion,
  AgentSessionV2,
  ProjectAgentHistoryStatus,
  ProjectAgentHistorySummary,
  ProjectAgentHistoryPage,
} from '../services/project-agent-v2-types';

// ─── Re-export key types from V2 store (functions, not re-declared types) ─────
// Note: AgentSessionV2, AgentPlanRevision, AgentTaskNode, etc. are already
// re-exported above from v2-types. The store re-exports them transitively.
// Consumers should import those types from this file (agent/types).
// Store-specific exports are available directly from the store module.

// ─── Re-export McpRole ────────────────────────────────────────────────────────
export type { McpRole } from '../services/formflow-tool-registry';

// ─── Imports for V3-specific types ────────────────────────────────────────────
import type { AuthRequest } from '../middleware/auth';
import type { ProjectStateCheckSummary } from '../services/project-agent-state-check';
import type { AgentRequirementCoverage, AgentAssignment } from '../services/project-agent-v2-types';
import type { McpRole } from '../services/formflow-tool-registry';

// ─── V3-specific types ────────────────────────────────────────────────────────

/** RunContext — the execution context for a single turn */
export interface RunContext {
  tenantId: string;
  userId: string;
  user?: AuthRequest['user'];
  requestId: string;
}

/** QuickObservation — lightweight observation (0 MCP calls) */
export interface QuickObservation {
  coverage: AgentRequirementCoverage;
  progress: { total: number; passed: number; failed: number; blocked: number; pending: number };
  failures: Array<{ taskId: string; role: McpRole; title: string; error: string; failureClass?: string }>;
  blockers: string[];
}

/** TaskObservation — medium observation (1-2 MCP calls) */
export interface TaskObservation extends QuickObservation {
  validation: { valid: boolean; issueCount: number; issues: string[] };
}

/** DeepObservation — full observation (3xN MCP calls) */
export interface DeepObservation {
  projectState: ProjectStateCheckSummary;
  quick: QuickObservation;
}

/** Reflection — self-reflection result */
export interface Reflection {
  needAdjustment: boolean;
  reason?: string;
  suggestion?: string;
  pattern?: string;
}

/** DecisionEngine result */
export interface DecisionResult {
  action: 'assign' | 'complete' | 'ask_user' | 'abort';
  summary: string;
  assignments: AgentAssignment[];
  questions?: Array<{
    header: string;
    question: string;
    kind: 'choice' | 'text';
    options?: Array<{ label: string; description?: string }>;
  }>;
  finalAnswer?: string;
  reason?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const PROJECT_AGENT_ROLES: McpRole[] = [
  'project', 'data', 'form', 'workflow', 'behavior', 'quality', 'delivery',
];

export const ROLE_TITLES: Record<McpRole, string> = {
  project: '项目专家',
  data: '数据专家',
  form: '表单专家',
  workflow: '流程专家',
  behavior: '行为规则专家',
  quality: '质量专家',
  delivery: '交付专家',
};

export const DEFAULT_MAX_DECISION_STEPS = 24;
export const MAX_NO_PROGRESS_STEPS = 2;
