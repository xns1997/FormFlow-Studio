/**
 * Agent Core public API. The v4 route and consumers import from here.
 */
export type {
  AgentPlan, AgentTask, AgentThread, AgentEvidence, CapabilityBundleVersion,
  FailureClass, LoopDecision, LoopObservation, LoopQuestion, PendingApproval,
  RunContext, ScopeConfig, ThreadEvent, ThreadHistoryPage, ThreadHistorySummary,
  ThreadHistoryStatus, ThreadMessage, ThreadStatus, TaskAccess, TaskStatus, AgentMode,
  ArtifactMeta, LoopBatchRead, TestBaseline, ThreadContext, TurnMetrics,
} from './types';
export { MAX_BATCH_READS } from './types';

export {
  acquireAgentThreadLease, addThreadMessage, appendAgentThreadEvent, archiveAgentThread,
  createAgentThread, defaultCapabilityBundle, deleteAgentThread, findActiveProjectThread,
  getAgentThread, getCapabilityBundle, hasAgentThreadLease, initializeAgentStore,
  listAgentThreads, listCapabilityBundles, listThreadHistory, publishCapabilityBundle,
  releaseAgentThreadLease, renewAgentThreadLease, restoreAgentThread, saveAgentThread,
  saveCapabilityBundleDraft, setAgentThreadProjectScope, subscribeAgentThreadEvents,
  threadEventsAfter, threadProjectIds, updateAgentThreadMetadata, validateBundle, setAgentThreadMode,
  bumpThreadMetric, compactThreadMessages, readAgentArtifact, resetThreadMetrics,
  setThreadContext, storeAgentArtifact, flushThreadMetrics, listThreadMetrics,
} from './store';

export { chat, streamChat } from './llm';
export { ground, planTurn, replanWithFeedback, replanRemaining, confirmPlan, validatePlanTasks } from './planner';
export {
  appendToolObservation, classifyFailure, executeAction, executePlan, recordToolResult,
  shouldAutoApproveOperation,
} from './loop';
export { runFinalGates, verifyCompletedTask, captureTestBaseline, testGateApplies, GateFailure } from './gates';
export { maybeCompactContext, structuredThreadContext, maxPromptChars } from './context';
export { createProjectCheckpoint, listThreadCheckpoints, restoreProjectCheckpoint } from './checkpoints';
export {
  evaluateToolPolicy, isReleaseApply, isWriteTool, resolveScope, stableIdempotencyKey,
  toolProjectId, toolRisk,
} from './policy';
export { skillCatalog, skillDocument, effectiveScopeTools, skillFor, structuredToolDocs } from './skills';
