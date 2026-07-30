/**
 * Agent service cluster barrel export.
 *
 * Re-exports from the 13 agent service files to provide a unified import surface.
 * Future consolidation into fewer files can happen incrementally behind this barrel.
 */

// ─── Types ────────────────────────────────────────────────────────────────────
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
} from '../project-agent-v2-types';

// ─── Store ────────────────────────────────────────────────────────────────────
export {
  clearLegacyProjectAgentSessions,
  initializeProjectAgentV2Store,
  defaultCapabilityBundle,
  listCapabilityBundles,
  getCapabilityBundle,
  saveCapabilityBundleDraft,
  publishCapabilityBundle,
  validateCapabilityBundle,
  sessionProjectIds,
  setSessionProjectScope,
  createAgentSessionV2,
  listAgentSessionsV2,
  projectAgentHistoryStatus,
  listAgentSessionHistory,
  findActiveProjectAgentSession,
  getAgentSessionV2,
  saveAgentSessionV2,
  archiveAgentSessionV2,
  restoreAgentSessionV2,
  deleteAgentSessionV2,
  updateAgentSessionMetadata,
  appendAgentEvent,
  setAgentPhase,
  subscribeAgentEvents,
  eventsAfter,
  acquireAgentLease,
  renewAgentLease,
  releaseAgentLease,
  hasAgentLease,
  validateTaskGraph,
  selectRunnableTaskBatch,
  compactConversation,
  addAgentArtifact,
} from '../project-agent-v2-store';

// ─── Actions ──────────────────────────────────────────────────────────────────
export {
  PROJECT_AGENT_ROLES,
  DEFAULT_MAX_DECISION_STEPS,
  MAX_NO_PROGRESS_STEPS,
  nextActionSchema,
  parseNextActionDecision,
  validateNextActionDecision,
  decisionExpandsRisk,
  goalContractReady,
  actionProgressFingerprint,
  ensureActionState,
  createActionStep,
  materializeAssignments,
  prepareAssignments,
  reconcileInterruptedActions,
  observationForTask,
  recordObservation,
  resumeActionWithUserInput,
  completeActionStep,
  completionBlockers,
} from '../project-agent-actions';

// ─── Policy ───────────────────────────────────────────────────────────────────
export {
  shouldAutoApproveOperation,
  evaluateToolPolicy,
  operationAllowedByPlan,
} from '../project-agent-v2-policy';
export type { ToolPolicyOutcome } from '../project-agent-v2-policy';

// ─── Planning ─────────────────────────────────────────────────────────────────
export {
  PLANNING_MAX_ATTEMPTS,
  isStructuredPlanningError,
  planningRepairInstruction,
  validatePlannerTaskRoleBoundaries,
} from '../project-agent-v2-planning';

// ─── Context ──────────────────────────────────────────────────────────────────
export {
  compactAgentToolResult,
  compactToolObservation,
  toolFailureGuidance,
} from '../project-agent-v2-context';

// ─── Revision ─────────────────────────────────────────────────────────────────
export {
  MAX_REVISION_RECOMPUTES,
  applyRuntimeRevision,
  nextRevisionConflictCount,
  approvalRevisionChanged,
  requiresProjectStateRead,
  projectChangedToolObservation,
  revisionReadRequiredObservation,
} from '../project-agent-revision';

// ─── Expert Registry ──────────────────────────────────────────────────────────
export {
  SPECIALIST_BASE_PROMPT,
  expertEffectiveTools,
  specialistRoleInstructions,
  expertTeamKnowledge,
  expertTeamKnowledgePrompt,
  suggestedExpertRole,
  buildSpecialistSystemPrompt,
  expertKnowledge,
  enabledExpertKnowledgePrompt,
  buildExpertRegistry,
} from '../project-agent-expert-registry';
export type { ExpertRegistryKnowledge } from '../project-agent-expert-registry';

// ─── Expert Repair ────────────────────────────────────────────────────────────
export {
  MAX_CURRENT_EXPERT_REPAIRS,
  currentExpertRepairDecision,
} from '../project-agent-expert-repair';

// ─── Remediation ──────────────────────────────────────────────────────────────
export {
  qualityDiagnosticFingerprint,
  shouldRunQualityGate,
  qualityRemediationInstruction,
  replaceInvalidRemediationTask,
  supersedeInvalidCrossRoleRepairs,
  insertQualityRemediationTasks,
} from '../project-agent-v2-remediation';
export type { QualityDiagnostic } from '../project-agent-v2-remediation';

// ─── State Check ──────────────────────────────────────────────────────────────
export {
  summarizeCheckedProject,
  createProjectStateCheckSummary,
  compactProjectStateCheck,
} from '../project-agent-state-check';
export type { ProjectStateCheckReason, ProjectStateCheckItem, ProjectStateCheckSummary } from '../project-agent-state-check';

// ─── Recovery ─────────────────────────────────────────────────────────────────
export {
  DEFAULT_MAX_RECOVERY_CYCLES,
  DEFAULT_MAX_DYNAMIC_TASKS,
  classifyAgentFailure,
  isRecoverableFailure,
  ensureRecoveryState,
  resetRecoveryBudget,
  strategyKey,
  normalizeRecoveryPatch,
  syncBlockedTasks,
  serializeProjectWrites,
  applyRecoveryPatch,
  recoveryPatchExpandsRisk,
} from '../project-agent-v3-recovery';
export type { RecoveryAction, RecoveryTaskInput, AgentRecoveryPatch } from '../project-agent-v3-recovery';

// ─── Requirements ─────────────────────────────────────────────────────────────
export {
  materializeAnalyzedRequirements,
  refreshRequirementCoverage,
} from '../project-agent-requirements';

// ─── Tool Registry ────────────────────────────────────────────────────────────
export {
  validateMcpToolRegistry,
  listFormFlowTools,
  getFormFlowTool,
  executeFormFlowTool,
  registerExternalFormFlowTool,
} from '../formflow-tool-registry';
export {
  MCP_ROLES,
  MCP_ROLE_CATALOG,
  isMcpRole,
  resultSchema,
  anyObject,
} from '../formflow-tool-registry';
export type {
  JsonSchema,
  ToolRisk,
  McpRole,
  ToolContext,
  ToolResult,
  ToolWarning,
  FormFlowToolDefinition,
} from '../formflow-tool-registry';
