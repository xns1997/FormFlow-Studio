/**
 * Agent Core public API. The v4 route and consumers import from here.
 */
export type {
  AgentThread, AgentEvidence, CapabilityBundleVersion, DynamicPlan,
  FailureClass, LoopDecision, LoopObservation, LoopQuestion, PendingApproval,
  RunContext, ScopeConfig, ThreadEvent, ThreadHistoryPage, ThreadHistorySummary,
  ThreadHistoryStatus, ThreadMessage, ThreadStatus, TurnRecord, TurnStatus,
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
  threadEventsAfter, threadProjectIds, updateAgentThreadMetadata, validateBundle,
  bumpThreadMetric, compactThreadMessages, readAgentArtifact, resetThreadMetrics,
  setThreadContext, storeAgentArtifact, flushThreadMetrics, listThreadMetrics,
} from './store';

export { chat, streamChat } from './llm';
export { ground, initializeDynamicPlan, validateDynamicPlan, applyDynamicPlanUpdate } from './planner';
export {
  appendToolObservation, classifyFailure, executeAction, runTurn, recordToolResult,
} from './loop';
export { runFinalGates, verifyProjectAfterWrite, captureTestBaseline, testGateApplies, GateFailure } from './gates';
export { maybeCompactContext, structuredThreadContext, maxPromptChars } from './context';
export { createProjectCheckpoint, listThreadCheckpoints, restoreProjectCheckpoint } from './checkpoints';
export {
  evaluateToolPolicy, isReleaseApply, isWriteTool, resolveScope, stableIdempotencyKey,
  toolProjectId, toolRisk, shouldAutoApproveOperation,
} from './policy';
export { skillCatalog, skillDocument, effectiveScopeTools, skillFor, structuredToolDocs, generalLoopSkill } from './skills';
