/**
 * Agent Core public API. The v4 route and consumers import from here.
 */
export type {
  AgentPlan, AgentTask, AgentThread, AgentEvidence, CapabilityBundleVersion,
  FailureClass, LoopDecision, LoopObservation, LoopQuestion, PendingApproval,
  RunContext, ScopeConfig, ThreadEvent, ThreadHistoryPage, ThreadHistorySummary,
  ThreadHistoryStatus, ThreadMessage, ThreadStatus, TaskAccess, TaskStatus, AgentMode,
} from './types';

export {
  acquireAgentThreadLease, addThreadMessage, appendAgentThreadEvent, archiveAgentThread,
  createAgentThread, defaultCapabilityBundle, deleteAgentThread, findActiveProjectThread,
  getAgentThread, getCapabilityBundle, hasAgentThreadLease, initializeAgentStore,
  listAgentThreads, listCapabilityBundles, listThreadHistory, publishCapabilityBundle,
  releaseAgentThreadLease, renewAgentThreadLease, restoreAgentThread, saveAgentThread,
  saveCapabilityBundleDraft, setAgentThreadProjectScope, subscribeAgentThreadEvents,
  threadEventsAfter, threadProjectIds, updateAgentThreadMetadata, validateBundle, setAgentThreadMode,
} from './store';

export { chat, streamChat } from './llm';
export { ground, planTurn, replanWithFeedback, confirmPlan, validatePlanTasks } from './planner';
export {
  appendToolObservation, classifyFailure, executeAction, executePlan, recordToolResult,
  shouldAutoApproveOperation,
} from './loop';
export { runFinalGates, verifyCompletedTask, GateFailure } from './gates';
export {
  evaluateToolPolicy, isReleaseApply, isWriteTool, resolveScope, stableIdempotencyKey,
  toolProjectId, toolRisk,
} from './policy';
export { skillCatalog, skillDocument, effectiveScopeTools, skillFor, structuredToolDocs } from './skills';
