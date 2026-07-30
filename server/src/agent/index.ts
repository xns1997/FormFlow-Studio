/**
 * Agent module barrel export.
 *
 * This is the public API of the agent subsystem.
 * The V3 route file and other consumers should import from here.
 */

// Types
export type {
  RunContext,
  QuickObservation,
  TaskObservation,
  DeepObservation,
  Reflection,
  DecisionResult,
} from './types';

export {
  PROJECT_AGENT_ROLES,
  ROLE_TITLES,
  DEFAULT_MAX_DECISION_STEPS,
  MAX_NO_PROGRESS_STEPS,
} from './types';

// Re-export store types that consumers need
export type {
  AgentSessionV2,
  AgentPlanRevision,
  AgentTaskNode,
  AgentOrchestrationStep,
  NextActionDecision,
  AgentPhase,
  AgentTaskStatus,
  AgentFailureClass,
} from '../services/project-agent-v2-store';

// LLM Client
export { chat } from './llm-client';

// State Checker
export { ground, checkCurrentProjectState } from './state-checker';

// Verifier
export { verifyTask, QualityGateFailure, RemediationVerificationFailure, roleTitles } from './verifier';

// Specialist Runner
export {
  runSpecialist,
  allowedTools,
  prepareToolArguments,
  specialistContext,
  refreshRevision,
  taskProjectRevision,
  stableOperationKey,
  RevisionRecomputeBlocked,
  ExpertAssistanceRequired,
} from './specialist-runner';

// Decision Engine
export { requestNextAction } from './decision-engine';

// Recovery Engine
export {
  recoverFailedTask,
  requestRecoveryPatch,
  recoveryRevision,
  exhaustRecovery,
  pauseRecoveryForUser,
} from './recovery-engine';

// Orchestrator
export {
  planTurn,
  failPlanningTurn,
  executePlan,
  executeTask,
  executeStepTasks,
  requestTaskAssistance,
  blockTaskForRevisionChanges,
  activePlan,
  addMessage,
  questionMetadata,
} from './orchestrator';

// Observer
export { ProjectAgentObserver } from './observer';

// Reflector
export { generateReflection, generateStrategyAdjustments } from './reflector';

// V2 Compatibility
export {
  migrateV2toV3,
  v3toV2Compat,
  isV3Session,
  ensureV3,
} from './v2-compat';
export type { AgentSessionV3 } from './v2-compat';
