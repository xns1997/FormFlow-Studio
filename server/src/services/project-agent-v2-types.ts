import type { McpRole } from './formflow-tool-registry';

export type AgentPhase = 'idle' | 'grounding' | 'analyzing_requirements' | 'clarifying' | 'planning' | 'awaiting_plan_approval' | 'executing' | 'recovering' | 'awaiting_operation_approval' | 'paused' | 'completed' | 'failed' | 'stopped';
export type AgentTaskAccess = 'read' | 'write';
export type AgentTaskStatus = 'pending' | 'running' | 'passed' | 'failed' | 'paused' | 'blocked' | 'superseded' | 'cancelled';
export type AgentTaskOrigin = 'planned' | 'recovery' | 'diagnostic' | 'steer' | 'loop' | 'action';
export type AgentFailureClass = 'transient' | 'revision_conflict' | 'tool_scope' | 'invalid_arguments' | 'validation' | 'permission' | 'user_rejected' | 'specialist_failure';
export type ProjectAgentSessionScope = 'project' | 'unbound' | 'all';
export type AgentRequirementStatus = 'supported' | 'capability_gap' | 'needs_user_input' | 'verified' | 'failed';
export type AgentEvidenceKind = 'tool_result' | 'structural_validation' | 'semantic_validation' | 'scenario_result' | 'requirement_coverage' | 'delivery_preview';

export interface AgentRequirement {
  id: string;
  statement: string;
  domain: McpRole;
  acceptanceScenarios: string[];
  resourceIds?: string[];
  risk: 'normal' | 'high';
  capabilityStatus: AgentRequirementStatus;
  taskIds: string[];
  evidenceArtifactIds: string[];
  failureReason?: string;
}

export interface AgentRequirementCoverage { total: number; planned: number; supported: number; verified: number; failed: number; capabilityGaps: number; needsUserInput: number; planComplete: boolean; complete: boolean; }

export interface AgentQuestion {
  id: string;
  turnId?: string;
  createdAt?: string;
  header: string;
  question: string;
  kind: 'choice' | 'text';
  options?: Array<{ label: string; description?: string }>;
}

export interface AgentArtifact {
  id: string;
  taskId?: string;
  kind: 'grounding' | 'tool_result' | 'verification' | 'summary' | 'structural_validation' | 'semantic_validation' | 'scenario_result' | 'requirement_coverage';
  title: string;
  data: unknown;
  createdAt: string;
}

export interface AgentTaskNode {
  id: string;
  role: McpRole;
  title: string;
  instruction: string;
  access: AgentTaskAccess;
  dependsOn: string[];
  acceptance: string[];
  status: AgentTaskStatus;
  attempt: number;
  maxAttempts: number;
  startRevision?: string;
  endRevision?: string;
  output?: string;
  error?: string;
  evidenceArtifactIds: string[];
  requirementIds?: string[];
  evidenceKinds?: AgentEvidenceKind[];
  verificationScenarioIds?: string[];
  origin?: AgentTaskOrigin;
  generation?: number;
  supersedesTaskId?: string;
  strategyKey?: string;
  failureClass?: AgentFailureClass;
  blockedBy?: string[];
  projectId?: string;
  roundId?: string;
  stepId?: string;
  decisionReason?: string;
  revisionConflictCount?: number;
  expertRepairCount?: number;
  policyCorrectionCount?: number;
  policyCorrectionFingerprint?: string;
  blockedReason?: string;
  resumeContext?: string;
  assistsTaskId?: string;
  assistance?: {
    status: 'needed' | 'assigned' | 'resolved';
    reason: string;
    depth: number;
    triedRoles: McpRole[];
    helperTaskId?: string;
    helperRole?: McpRole;
    requestedRole?: McpRole;
  };
  remediation?: {
    gateTaskId: string;
    diagnosticFingerprints: string[];
    diagnostics: Array<{ severity?: string; code?: string; path?: string; message?: string }>;
  };
}

export interface AgentRoundExpertDecision {
  role: McpRole;
  decision: 'run' | 'skip';
  reason: string;
  taskId?: string;
  task?: {
    title: string;
    instruction: string;
    access: AgentTaskAccess;
    projectId?: string;
    dependsOn: string[];
    acceptance: string[];
    requirementIds: string[];
    evidenceKinds: AgentEvidenceKind[];
    verificationScenarioIds: string[];
    supersedesTaskId?: string;
  };
}

export interface AgentAssignment {
  role: McpRole;
  title: string;
  instruction: string;
  access: AgentTaskAccess;
  projectId?: string;
  acceptance: string[];
  requirementIds: string[];
  evidenceKinds: AgentEvidenceKind[];
  verificationScenarioIds: string[];
  supersedesTaskId?: string;
  assistsRole?: McpRole;
  assistsAction?: string;
}

export interface NextActionDecision {
  action: 'assign' | 'complete' | 'ask_user' | 'abort';
  summary: string;
  assignments: AgentAssignment[];
  questions?: Array<Omit<AgentQuestion, 'id' | 'turnId' | 'createdAt'>>;
  finalAnswer?: string;
  reason?: string;
}

export interface AgentObservation {
  id: string;
  stepId: string;
  taskId?: string;
  role?: McpRole;
  status: 'succeeded' | 'failed' | 'blocked' | 'waiting_confirmation';
  action: string;
  summary: string;
  changes: string[];
  evidence: string[];
  unresolved: string[];
  error?: { category: string; message: string; retryable: boolean; suggestion?: string };
  createdAt: string;
}

export interface AgentOrchestrationStep {
  id: string;
  turnId?: string;
  index: number;
  status: 'deciding' | 'running' | 'completed' | 'waiting' | 'failed';
  action?: NextActionDecision['action'];
  summary?: string;
  inputFingerprint: string;
  outputFingerprint?: string;
  progressed?: boolean;
  taskIds: string[];
  observationIds: string[];
  decisionCorrectionCount?: number;
  startedAt: string;
  completedAt?: string;
}

export interface AgentOrchestrationRound {
  id: string;
  turnId?: string;
  index: number;
  status: 'planning' | 'running' | 'completed' | 'waiting' | 'failed';
  action?: 'continue' | 'complete' | 'ask_user' | 'abort';
  summary?: string;
  inputFingerprint: string;
  outputFingerprint?: string;
  progressed?: boolean;
  decisions: AgentRoundExpertDecision[];
  taskIds: string[];
  cancelledTaskIds?: string[];
  questions?: AgentQuestion[];
  startedAt: string;
  completedAt?: string;
}

export interface AgentOrchestrationState {
  currentRound: number;
  maxRounds: number;
  consecutiveNoProgress: number;
  maxNoProgressRounds: number;
  lastProgressFingerprint?: string;
  status: 'idle' | 'running' | 'waiting' | 'completed' | 'failed' | 'stopped';
  currentStep?: number;
  maxDecisionSteps?: number;
}

export interface AgentPlanRevision {
  id: string;
  turnId?: string;
  revision: number;
  request: string;
  goal: string;
  successCriteria: string[];
  summary: string;
  assumptions: string[];
  risks: string[];
  tasks: AgentTaskNode[];
  status: 'pending' | 'confirmed' | 'superseded' | 'executed';
  createdAt: string;
  confirmedAt?: string;
  parentPlanId?: string;
  revisionReason?: string;
  approvalRequired?: boolean;
  automaticRevision?: boolean;
  requirementRevision?: number;
}

export interface AgentEvent {
  id: string;
  seq: number;
  type: string;
  data: any;
  createdAt: string;
}

export interface PendingApproval {
  id: string;
  runId: string;
  toolCallId: string;
  toolName: string;
  taskId: string;
  role: McpRole;
  routeIndex: number;
  arguments: Record<string, any>;
  projectRevision?: string;
  confirmation: { token: string; summary?: string; impact?: unknown };
}

export interface CapabilityAgentConfig {
  role: McpRole | 'coordinator';
  name: string;
  description: string;
  instructions: string;
  profileId?: string;
  tools: string[];
  toolMode?: 'all' | 'selected';
  knowledge?: CapabilityAgentKnowledge[];
}

export interface CapabilityAgentKnowledge {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
}

export interface CapabilityBundleVersion {
  id: string;
  bundleId: string;
  version: number;
  ownerId: string;
  name: string;
  description: string;
  status: 'draft' | 'published';
  agents: CapabilityAgentConfig[];
  context: { recentMessages: number; maxSummaryChars: number };
  budget: { maxParallelReads: number; maxAttempts: number; maxToolSteps: number; maxRecoveryCycles?: number; maxDynamicTasks?: number; maxLoopRounds?: number; maxDecisionSteps?: number };
  createdAt: string;
  publishedAt?: string;
}

export interface AgentSessionV2 {
  schemaVersion: 2;
  id: string;
  tenantId: string;
  userId: string;
  projectId?: string;
  projectIds?: string[];
  projectRevisions?: Record<string, string>;
  title: string;
  profileId: string;
  capabilityBundleVersionId: string;
  phase: AgentPhase;
  turnId?: string;
  plans: AgentPlanRevision[];
  activePlanId?: string;
  questions: AgentQuestion[];
  requirements?: AgentRequirement[];
  requirementCoverage?: AgentRequirementCoverage;
  requirementRevision?: number;
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; createdAt: string; turnId?: string; kind?: 'user' | 'question' | 'plan_summary' | 'completion' | 'assistant' }>;
  conversationSummary: string;
  artifacts: AgentArtifact[];
  events: AgentEvent[];
  checkpointRevision?: string;
  pendingApproval?: PendingApproval;
  activeRunId?: string;
  controlSignal?: 'pause' | 'stop' | 'steer';
  pendingSteer?: string;
  recovery?: { cycles: number; maxCycles: number; dynamicTasks: number; maxDynamicTasks: number; strategies: Record<string, number>; lastFailureTaskId?: string; lastFailureClass?: AgentFailureClass };
  orchestration?: AgentOrchestrationState;
  rounds?: AgentOrchestrationRound[];
  steps?: AgentOrchestrationStep[];
  observations?: AgentObservation[];
  pinnedAt?: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProjectAgentHistoryStatus = 'active' | 'attention' | 'completed';
export interface ProjectAgentHistorySummary {
  id: string;
  title: string;
  projectId?: string;
  projectIds: string[];
  phase: AgentPhase;
  status: ProjectAgentHistoryStatus;
  goal: string;
  requirementCoverage: { total: number; verified: number; failed: number; complete: boolean };
  pinnedAt?: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface ProjectAgentHistoryPage { items: ProjectAgentHistorySummary[]; nextCursor?: string; }
