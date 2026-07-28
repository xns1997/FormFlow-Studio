import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';
import { isMcpRole, listFormFlowTools, type McpRole } from './formflow-tool-registry';
import { serverDataPath } from '../config/paths';
import { env } from '../config/env';

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

const STORE_PATH = process.env.PROJECT_AGENT_V2_STORE_PATH || serverDataPath('configs', 'project-agent-v2.json');
const BUNDLE_PATH = process.env.PROJECT_AGENT_BUNDLE_STORE_PATH || serverDataPath('configs', 'project-agent-capability-bundles.json');
const LEGACY_STORE_PATH = process.env.PROJECT_AGENT_STORE_PATH || serverDataPath('configs', 'project-agent-sessions.json');
const listeners = new Map<string, Set<(event: AgentEvent) => void>>();
const liveSessions = new Map<string, AgentSessionV2>();
const leases = new Set<string>();
const leaseOwners = new Map<string, string>();
const mirrorQueues = new Map<string, Promise<void>>();
let pool: Pool | undefined;
let initialization: Promise<void> | undefined;

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')) as T; } catch { return fallback; }
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temp, path);
}

export function clearLegacyProjectAgentSessions() {
  if (existsSync(LEGACY_STORE_PATH)) writeJson(LEGACY_STORE_PATH, []);
}
clearLegacyProjectAgentSessions();

function sessions() { return readJson<AgentSessionV2[]>(STORE_PATH, []); }
function bundles() { return readJson<CapabilityBundleVersion[]>(BUNDLE_PATH, []); }

export function initializeProjectAgentV2Store() {
  if (initialization) return initialization;
  initialization = (async () => {
    if (env.mode === 'cloud' && env.databaseUrl) {
      const candidate = new Pool({ connectionString: env.databaseUrl, max: 6, connectionTimeoutMillis: 3_000 });
      await candidate.query(`CREATE TABLE IF NOT EXISTS formflow_project_agent_v2_sessions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, project_id TEXT, phase TEXT NOT NULL, payload JSONB NOT NULL, archived BOOLEAN NOT NULL DEFAULT FALSE, lease_owner TEXT, lease_expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await candidate.query(`CREATE TABLE IF NOT EXISTS formflow_project_agent_v2_plans (session_id TEXT NOT NULL REFERENCES formflow_project_agent_v2_sessions(id) ON DELETE CASCADE,id TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,payload JSONB NOT NULL,PRIMARY KEY(session_id,id))`);
      await candidate.query(`CREATE TABLE IF NOT EXISTS formflow_project_agent_v2_tasks (session_id TEXT NOT NULL REFERENCES formflow_project_agent_v2_sessions(id) ON DELETE CASCADE,plan_id TEXT NOT NULL,id TEXT NOT NULL,status TEXT NOT NULL,access TEXT NOT NULL,payload JSONB NOT NULL,PRIMARY KEY(session_id,id))`);
      await candidate.query(`CREATE TABLE IF NOT EXISTS formflow_project_agent_v2_events (session_id TEXT NOT NULL REFERENCES formflow_project_agent_v2_sessions(id) ON DELETE CASCADE,seq BIGINT NOT NULL,type TEXT NOT NULL,payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL,PRIMARY KEY(session_id,seq))`);
      await candidate.query(`CREATE TABLE IF NOT EXISTS formflow_project_agent_v2_artifacts (session_id TEXT NOT NULL REFERENCES formflow_project_agent_v2_sessions(id) ON DELETE CASCADE,id TEXT NOT NULL,task_id TEXT,kind TEXT NOT NULL,payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL,PRIMARY KEY(session_id,id))`);
      await candidate.query(`CREATE TABLE IF NOT EXISTS formflow_project_agent_v2_approvals (session_id TEXT PRIMARY KEY REFERENCES formflow_project_agent_v2_sessions(id) ON DELETE CASCADE,id TEXT NOT NULL,payload JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await candidate.query(`CREATE TABLE IF NOT EXISTS formflow_project_agent_capability_versions (id TEXT PRIMARY KEY, bundle_id TEXT NOT NULL, version INTEGER NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), published_at TIMESTAMPTZ, UNIQUE(bundle_id, version))`);
      const [sessionRows, bundleRows] = await Promise.all([candidate.query('SELECT payload FROM formflow_project_agent_v2_sessions ORDER BY created_at'), candidate.query('SELECT payload FROM formflow_project_agent_capability_versions ORDER BY created_at')]);
      if (sessionRows.rows.length) writeJson(STORE_PATH, sessionRows.rows.map((row) => row.payload));
      if (bundleRows.rows.length) writeJson(BUNDLE_PATH, bundleRows.rows.map((row) => row.payload));
      pool = candidate;
    }
    const recovered = sessions(); let changed = false;
    for (const session of recovered) {
      if (!Array.isArray(session.steps)) { session.steps = []; changed = true; }
      if (!Array.isArray(session.observations)) { session.observations = []; changed = true; }
      if (!Array.isArray(session.requirements)) { session.requirements = []; changed = true; }
      if (!session.requirementCoverage || session.requirementCoverage.planned === undefined) {
        const tasks = session.plans?.find((plan) => plan.id === session.activePlanId)?.tasks || [];
        const planned = session.requirements.filter((requirement) => tasks.some((task) => task.requirementIds?.includes(requirement.id))).length;
        const verified = session.requirements.filter((requirement) => requirement.capabilityStatus === 'verified').length;
        const failed = session.requirements.filter((requirement) => requirement.capabilityStatus === 'failed').length;
        const capabilityGaps = session.requirements.filter((requirement) => requirement.capabilityStatus === 'capability_gap').length;
        const needsUserInput = session.requirements.filter((requirement) => requirement.capabilityStatus === 'needs_user_input').length;
        session.requirementCoverage = { total: session.requirements.length, planned, supported: session.requirements.length - verified - failed - capabilityGaps - needsUserInput, verified, failed, capabilityGaps, needsUserInput, planComplete: session.requirements.length > 0 && planned === session.requirements.length, complete: session.requirements.length > 0 && verified === session.requirements.length }; changed = true;
      }
      if (session.requirementRevision === undefined) { session.requirementRevision = 0; changed = true; }
      for (const plan of session.plans || []) for (const task of plan.tasks || []) {
        task.requirementIds ||= []; task.evidenceKinds ||= []; task.verificationScenarioIds ||= [];
        if (task.status === 'passed' && task.failureClass) { task.failureClass = undefined; task.error = undefined; changed = true; }
      }
      const isEmptyGroundingSession = session.phase === 'grounding'
        && !session.turnId
        && !(session.messages || []).length
        && !(session.events || []).length
        && !(session.plans || []).length;
      if (isEmptyGroundingSession) {
        session.phase = 'idle'; changed = true;
      } else if (session.phase === 'executing' || session.phase === 'recovering') {
        session.phase = 'paused'; for (const plan of session.plans) for (const task of plan.tasks) if (task.status === 'running') task.status = 'pending';
        session.events.push({ id: `pae_${randomUUID()}`, seq: (session.events.at(-1)?.seq || 0) + 1, type: 'execution_recovered', data: { checkpointRevision: session.checkpointRevision }, createdAt: new Date().toISOString() }); changed = true;
      } else if (session.phase === 'grounding' || session.phase === 'analyzing_requirements' || session.phase === 'planning') {
        const error = '上次规划请求因服务重启或连接中断而未完成'; session.phase = 'failed'; session.questions = [];
        session.events.push({ id: `pae_${randomUUID()}`, seq: (session.events.at(-1)?.seq || 0) + 1, type: 'turn_failed', data: { turnId: session.turnId, stage: 'planning', error, retryable: true, recovered: true }, createdAt: new Date().toISOString() });
        session.events.push({ id: `pae_${randomUUID()}`, seq: (session.events.at(-1)?.seq || 0) + 1, type: 'phase_changed', data: { phase: 'failed', stage: 'planning', error, retryable: true, recovered: true }, createdAt: new Date().toISOString() }); changed = true;
      }
    }
    if (changed) { writeJson(STORE_PATH, recovered); recovered.forEach(mirrorSession); }
    recovered.forEach((session) => liveSessions.set(session.id, session));
  })();
  return initialization;
}

function mirrorSession(value: AgentSessionV2) {
  if (!pool) return;
  const snapshot = structuredClone(value); const job = async () => {
    const client = await pool!.connect(); try { await client.query('BEGIN');
      await client.query(`INSERT INTO formflow_project_agent_v2_sessions(id,tenant_id,user_id,project_id,phase,payload,archived,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET project_id=EXCLUDED.project_id,phase=EXCLUDED.phase,payload=EXCLUDED.payload,archived=EXCLUDED.archived,updated_at=EXCLUDED.updated_at`, [snapshot.id, snapshot.tenantId, snapshot.userId, snapshot.projectId || null, snapshot.phase, JSON.stringify(snapshot), snapshot.archived, snapshot.createdAt, snapshot.updatedAt]);
      for (const plan of snapshot.plans) { await client.query(`INSERT INTO formflow_project_agent_v2_plans(session_id,id,revision,status,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(session_id,id) DO UPDATE SET status=EXCLUDED.status,payload=EXCLUDED.payload`, [snapshot.id, plan.id, plan.revision, plan.status, JSON.stringify(plan)]); for (const task of plan.tasks) { const storageTaskId = `${plan.id}:${task.id}`; await client.query(`INSERT INTO formflow_project_agent_v2_tasks(session_id,plan_id,id,status,access,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(session_id,id) DO UPDATE SET plan_id=EXCLUDED.plan_id,status=EXCLUDED.status,access=EXCLUDED.access,payload=EXCLUDED.payload`, [snapshot.id, plan.id, storageTaskId, task.status, task.access, JSON.stringify(task)]); } }
      const lastEvent = await client.query('SELECT COALESCE(MAX(seq),0) AS seq FROM formflow_project_agent_v2_events WHERE session_id=$1', [snapshot.id]); const persistedSeq = Number(lastEvent.rows[0]?.seq || 0);
      for (const event of snapshot.events.filter((item) => item.seq > persistedSeq)) await client.query(`INSERT INTO formflow_project_agent_v2_events(session_id,seq,type,payload,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(session_id,seq) DO NOTHING`, [snapshot.id, event.seq, event.type, JSON.stringify(event.data), event.createdAt]);
      for (const artifact of snapshot.artifacts) await client.query(`INSERT INTO formflow_project_agent_v2_artifacts(session_id,id,task_id,kind,payload,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(session_id,id) DO UPDATE SET payload=EXCLUDED.payload`, [snapshot.id, artifact.id, artifact.taskId || null, artifact.kind, JSON.stringify(artifact.data), artifact.createdAt]);
      if (snapshot.pendingApproval) await client.query(`INSERT INTO formflow_project_agent_v2_approvals(session_id,id,payload) VALUES($1,$2,$3) ON CONFLICT(session_id) DO UPDATE SET id=EXCLUDED.id,payload=EXCLUDED.payload,updated_at=NOW()`, [snapshot.id, snapshot.pendingApproval.id, JSON.stringify(snapshot.pendingApproval)]); else await client.query('DELETE FROM formflow_project_agent_v2_approvals WHERE session_id=$1', [snapshot.id]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); } finally { client.release(); }
  };
  const previous = mirrorQueues.get(snapshot.id) || Promise.resolve(); const next = previous.then(job, job); mirrorQueues.set(snapshot.id, next); void next.finally(() => { if (mirrorQueues.get(snapshot.id) === next) mirrorQueues.delete(snapshot.id); });
}
function mirrorBundle(value: CapabilityBundleVersion) {
  void pool?.query(`INSERT INTO formflow_project_agent_capability_versions(id,bundle_id,version,owner_id,status,payload,created_at,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,payload=EXCLUDED.payload,published_at=EXCLUDED.published_at`, [value.id, value.bundleId, value.version, value.ownerId, value.status, JSON.stringify(value), value.createdAt, value.publishedAt || null]);
}

export function defaultCapabilityBundle(ownerId = 'system'): CapabilityBundleVersion {
  const now = new Date().toISOString();
  const roleNames: Record<McpRole, string> = { project: '项目专家', data: '数据专家', form: '表单专家', workflow: '流程专家', behavior: '行为规则专家', quality: '质量专家', delivery: '交付专家' };
  const roleDescriptions: Record<McpRole, string> = {
    project: '负责项目创建、初始化、导入和元信息。', data: '负责数据源、工作表、主键和业务数据。', form: '负责表单、控件、布局和字段绑定。', workflow: '负责工作流、节点、连线和流程校验。',
    behavior: '负责事件、联动、规则语法和规则测试。', quality: '负责 Mock 数据、回归测试和质量门禁。', delivery: '负责输出、项目包和交付预检。',
  };
  return {
    id: 'cap_default_v1', bundleId: 'cap_default', version: 1, ownerId, name: 'FormFlow 标准能力包', description: '按需规划并调用七个领域 MCP。', status: 'published',
    agents: [
      { role: 'coordinator', name: '项目统筹', description: '负责理解目标、判断下一步和组织专家协作。', instructions: '先查证，再决策；每次只选择当前真正需要的行动。', tools: [], toolMode: 'selected', knowledge: [] },
      ...(['project', 'data', 'form', 'workflow', 'behavior', 'quality', 'delivery'] as McpRole[]).map((role) => ({ role, name: roleNames[role], description: roleDescriptions[role], instructions: '严格限定领域，完成后提供工具结果、验收证据和未解决问题。', tools: [], toolMode: 'all' as const, knowledge: [] })),
    ],
    context: { recentMessages: 8, maxSummaryChars: 6000 }, budget: { maxParallelReads: 4, maxAttempts: 3, maxToolSteps: 32, maxRecoveryCycles: 6, maxDynamicTasks: 24, maxLoopRounds: 24, maxDecisionSteps: 24 }, createdAt: now, publishedAt: now,
  };
}

function ensureDefaultBundle() {
  const items = bundles();
  if (!items.some((item) => item.id === 'cap_default_v1')) writeJson(BUNDLE_PATH, [defaultCapabilityBundle(), ...items]);
}

export function listCapabilityBundles(ownerId: string) { ensureDefaultBundle(); return bundles().filter((item) => item.ownerId === ownerId || item.ownerId === 'system'); }
export function getCapabilityBundle(id: string, ownerId: string) { return listCapabilityBundles(ownerId).find((item) => item.id === id); }
export function saveCapabilityBundleDraft(input: Partial<CapabilityBundleVersion> & { name: string }, ownerId: string) {
  ensureDefaultBundle(); const items = bundles(); const now = new Date().toISOString();
  const bundleId = input.bundleId || `cap_${randomUUID()}`;
  const existing = input.id ? items.find((item) => item.id === input.id && item.ownerId === ownerId && item.status === 'draft') : undefined;
  const value: CapabilityBundleVersion = {
    id: existing?.id || `capv_${randomUUID()}`, bundleId, version: existing?.version || Math.max(0, ...items.filter((item) => item.bundleId === bundleId).map((item) => item.version)) + 1,
    ownerId, name: input.name.trim(), description: String(input.description || ''), status: 'draft', agents: input.agents?.length ? input.agents : defaultCapabilityBundle(ownerId).agents,
    context: input.context || { recentMessages: 8, maxSummaryChars: 6000 }, budget: input.budget || { maxParallelReads: 4, maxAttempts: 3, maxToolSteps: 32 }, createdAt: existing?.createdAt || now,
  };
  const next = existing ? items.map((item) => item.id === existing.id ? value : item) : [...items, value]; writeJson(BUNDLE_PATH, next); mirrorBundle(value); return value;
}
export function publishCapabilityBundle(id: string, ownerId: string) {
  const items = bundles(); const draft = items.find((item) => item.id === id && item.ownerId === ownerId && item.status === 'draft');
  if (!draft) throw new Error('能力包草稿不存在'); validateCapabilityBundle(draft);
  const value = { ...draft, status: 'published' as const, publishedAt: new Date().toISOString() };
  writeJson(BUNDLE_PATH, items.map((item) => item.id === id ? value : item)); mirrorBundle(value); return value;
}

export function validateCapabilityBundle(bundle: CapabilityBundleVersion) {
  if (!bundle.name.trim()) throw new Error('能力包名称不能为空');
  if (bundle.budget.maxParallelReads < 1 || bundle.budget.maxParallelReads > 4) throw new Error('只读并发必须在 1 到 4 之间');
  if (bundle.budget.maxAttempts < 1 || bundle.budget.maxAttempts > 3) throw new Error('任务最大尝试次数必须在 1 到 3 之间');
  if ((bundle.budget.maxRecoveryCycles ?? 6) < 1 || (bundle.budget.maxRecoveryCycles ?? 6) > 12) throw new Error('恢复周期必须在 1 到 12 之间');
  if ((bundle.budget.maxDynamicTasks ?? 24) < 1 || (bundle.budget.maxDynamicTasks ?? 24) > 48) throw new Error('动态任务上限必须在 1 到 48 之间');
  if ((bundle.budget.maxLoopRounds ?? 24) < 1 || (bundle.budget.maxLoopRounds ?? 24) > 64) throw new Error('Loop 最大轮数必须在 1 到 64 之间');
  if ((bundle.budget.maxDecisionSteps ?? bundle.budget.maxLoopRounds ?? 24) < 1 || (bundle.budget.maxDecisionSteps ?? bundle.budget.maxLoopRounds ?? 24) > 64) throw new Error('最大决策步数必须在 1 到 64 之间');
  for (const agent of bundle.agents) {
    if (agent.tools.includes('release.apply')) throw new Error('能力包不得启用 release.apply');
    if (agent.role === 'coordinator' && agent.tools.length) throw new Error('coordinator 不得配置项目写工具');
    if (!agent.name?.trim()) throw new Error(`专家 ${agent.role} 名称不能为空`);
    if (!agent.instructions?.trim()) throw new Error(`专家 ${agent.role} 提示词不能为空`);
    const knowledgeIds = new Set<string>();
    for (const item of agent.knowledge || []) {
      if (!item.id?.trim() || !item.title?.trim() || !item.content?.trim()) throw new Error(`专家 ${agent.role} 的知识条目不完整`);
      if (knowledgeIds.has(item.id)) throw new Error(`专家 ${agent.role} 存在重复知识 ID：${item.id}`);
      knowledgeIds.add(item.id);
    }
    if (agent.toolMode && !['all', 'selected'].includes(agent.toolMode)) throw new Error(`专家 ${agent.role} 的工具授权模式无效`);
    if (agent.role !== 'coordinator') {
      if (!isMcpRole(agent.role)) throw new Error(`未知智能体角色：${agent.role}`);
      const allowed = new Set(listFormFlowTools(agent.role).map((tool) => tool.name)); const unknown = agent.tools.find((tool) => !allowed.has(tool)); if (unknown) throw new Error(`工具 ${unknown} 不属于 ${agent.role} 角色`);
    }
  }
  const roles = bundle.agents.map((agent) => agent.role);
  if (new Set(roles).size !== roles.length) throw new Error('能力包不能重复注册同一专家');
  for (const role of ['coordinator', 'project', 'data', 'form', 'workflow', 'behavior', 'quality', 'delivery']) if (!roles.includes(role as McpRole | 'coordinator')) throw new Error(`能力包缺少 ${role} 专家`);
  return { valid: true };
}

export function sessionProjectIds(session: Pick<AgentSessionV2, 'projectId' | 'projectIds'>) {
  return [...new Set([...(session.projectIds || []), ...(session.projectId ? [session.projectId] : [])].map(String).filter(Boolean))];
}

export function setSessionProjectScope(session: AgentSessionV2, projectIds: string[], currentProjectId?: string) {
  const normalized = [...new Set(projectIds.map(String).map((id) => id.trim()).filter(Boolean))];
  if (currentProjectId && !normalized.includes(currentProjectId)) throw new Error('当前项目必须包含在限定项目范围内');
  session.projectIds = normalized;
  session.projectId = currentProjectId || normalized[0];
  session.projectRevisions = Object.fromEntries(Object.entries(session.projectRevisions || {}).filter(([id]) => normalized.includes(id)));
  session.checkpointRevision = session.projectId ? session.projectRevisions?.[session.projectId] : undefined;
  return session;
}

export function createAgentSessionV2(input: { tenantId: string; userId: string; projectId?: string; projectIds?: string[]; title?: string; profileId: string; capabilityBundleVersionId?: string }) {
  ensureDefaultBundle(); const bundle = getCapabilityBundle(input.capabilityBundleVersionId || 'cap_default_v1', input.userId);
  if (!bundle || bundle.status !== 'published') throw new Error('请选择已发布且有权使用的能力包版本');
  const now = new Date().toISOString(); const value: AgentSessionV2 = {
    schemaVersion: 2, id: `pas2_${randomUUID()}`, tenantId: input.tenantId, userId: input.userId, projectId: input.projectId, projectIds: [...new Set([...(input.projectIds || []), ...(input.projectId ? [input.projectId] : [])])], projectRevisions: {}, title: input.title || '项目智能体 V2', profileId: input.profileId,
    capabilityBundleVersionId: bundle.id, phase: 'idle', plans: [], questions: [], requirements: [], requirementRevision: 0, requirementCoverage: { total: 0, planned: 0, supported: 0, verified: 0, failed: 0, capabilityGaps: 0, needsUserInput: 0, planComplete: false, complete: false }, messages: [], conversationSummary: '', artifacts: [], events: [], rounds: [], steps: [], observations: [], archived: false, createdAt: now, updatedAt: now,
  };
  writeJson(STORE_PATH, [...sessions(), value]); liveSessions.set(value.id, value); mirrorSession(value); return value;
}

export function listAgentSessionsV2(scope: { tenantId: string; userId: string; projectId?: string; sessionScope?: ProjectAgentSessionScope }) {
  const sessionScope = scope.sessionScope || (scope.projectId ? 'project' : 'unbound');
  if (sessionScope === 'project' && !scope.projectId) throw new Error('按项目查询会话时 projectId 不能为空');
  return sessions()
    .map((item) => liveSessions.get(item.id) || (liveSessions.set(item.id, item), item))
    .filter((item) => {
      if (item.archived || item.tenantId !== scope.tenantId || item.userId !== scope.userId) return false;
      if (sessionScope === 'all') return true;
      if (sessionScope === 'unbound') return sessionProjectIds(item).length === 0;
      return sessionProjectIds(item).includes(String(scope.projectId));
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function projectAgentHistoryStatus(phase: AgentPhase): ProjectAgentHistoryStatus {
  if (['clarifying', 'awaiting_plan_approval', 'awaiting_operation_approval', 'paused', 'failed'].includes(phase)) return 'attention';
  if (['completed', 'stopped'].includes(phase)) return 'completed';
  return 'active';
}

function historySummary(session: AgentSessionV2): ProjectAgentHistorySummary {
  const plan = session.plans.find((item) => item.id === session.activePlanId) || session.plans.at(-1); const coverage = session.requirementCoverage;
  return { id: session.id, title: session.title, projectId: session.projectId, projectIds: sessionProjectIds(session), phase: session.phase, status: projectAgentHistoryStatus(session.phase), goal: plan?.goal || '',
    requirementCoverage: { total: coverage?.total || 0, verified: coverage?.verified || 0, failed: coverage?.failed || 0, complete: coverage?.complete || false },
    pinnedAt: session.pinnedAt, archived: session.archived, createdAt: session.createdAt, updatedAt: session.updatedAt };
}

function compareHistory(left: ProjectAgentHistorySummary, right: ProjectAgentHistorySummary) {
  const leftPinned = left.pinnedAt || ''; const rightPinned = right.pinnedAt || '';
  if (Boolean(leftPinned) !== Boolean(rightPinned)) return leftPinned ? -1 : 1;
  if (leftPinned !== rightPinned) return rightPinned.localeCompare(leftPinned);
  if (left.updatedAt !== right.updatedAt) return right.updatedAt.localeCompare(left.updatedAt);
  return right.id.localeCompare(left.id);
}

function historyCursor(item: ProjectAgentHistorySummary) { return Buffer.from(JSON.stringify({ p: item.pinnedAt || '', u: item.updatedAt, i: item.id }), 'utf8').toString('base64url'); }
function decodeHistoryCursor(value?: string) { if (!value) return undefined; try { const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); return { p: String(parsed.p || ''), u: String(parsed.u || ''), i: String(parsed.i || '') }; } catch { throw new Error('历史任务游标无效'); } }

export function listAgentSessionHistory(input: { tenantId: string; userId: string; q?: string; status?: ProjectAgentHistoryStatus; projectId?: string; archived?: boolean; cursor?: string; limit?: number }, canInclude?: (session: AgentSessionV2) => boolean): ProjectAgentHistoryPage {
  const query = String(input.q || '').trim().toLocaleLowerCase(); const limit = Math.max(1, Math.min(100, Number(input.limit) || 30)); const cursor = decodeHistoryCursor(input.cursor);
  const items = sessions().map((item) => liveSessions.get(item.id) || (liveSessions.set(item.id, item), item))
    .filter((item) => item.tenantId === input.tenantId && item.userId === input.userId && item.archived === Boolean(input.archived) && (!canInclude || canInclude(item)))
    .map(historySummary)
    .filter((item) => !input.status || item.status === input.status)
    .filter((item) => !input.projectId || (input.projectId === '__unbound__' ? item.projectIds.length === 0 : item.projectIds.includes(input.projectId)))
    .filter((item) => !query || `${item.title}\n${item.goal}\n${item.projectIds.join('\n')}`.toLocaleLowerCase().includes(query))
    .sort(compareHistory);
  let start = 0;
  if (cursor) { const exact = items.findIndex((item) => (item.pinnedAt || '') === cursor.p && item.updatedAt === cursor.u && item.id === cursor.i); if (exact >= 0) start = exact + 1; }
  const page = items.slice(start, start + limit); return { items: page, nextCursor: start + limit < items.length && page.length ? historyCursor(page.at(-1)!) : undefined };
}
export function findActiveProjectAgentSession(scope: { tenantId: string; userId: string; projectId: string }, excludeId?: string) {
  return listAgentSessionsV2({ ...scope, sessionScope: 'project' }).find((item) => item.id !== excludeId && ['executing', 'recovering', 'awaiting_operation_approval'].includes(item.phase));
}
export function getAgentSessionV2(id: string) { const live = liveSessions.get(id); if (live) return live; const value = sessions().find((item) => item.id === id); if (value) liveSessions.set(id, value); return value; }
export function saveAgentSessionV2(value: AgentSessionV2) { value.updatedAt = new Date().toISOString(); liveSessions.set(value.id, value); const items = sessions(); const index = items.findIndex((item) => item.id === value.id); if (index >= 0) items[index] = value; else items.push(value); writeJson(STORE_PATH, items); mirrorSession(value); return value; }
export function archiveAgentSessionV2(value: AgentSessionV2) { value.archived = true; return saveAgentSessionV2(value); }
export function restoreAgentSessionV2(value: AgentSessionV2) { value.archived = false; return saveAgentSessionV2(value); }
export async function deleteAgentSessionV2(value: AgentSessionV2) {
  if (leases.has(value.id)) throw new Error('任务仍在执行，请先等待安全暂停');
  await mirrorQueues.get(value.id)?.catch(() => undefined);
  if (pool) await pool.query('DELETE FROM formflow_project_agent_v2_sessions WHERE id=$1', [value.id]);
  writeJson(STORE_PATH, sessions().filter((item) => item.id !== value.id));
  liveSessions.delete(value.id); listeners.delete(value.id); leaseOwners.delete(value.id); leases.delete(value.id); mirrorQueues.delete(value.id);
  return { deleted: true as const, id: value.id };
}
export function updateAgentSessionMetadata(value: AgentSessionV2, input: { title?: string; pinned?: boolean }) {
  if (input.title !== undefined) { const title = input.title.trim(); if (!title || title.length > 80) throw new Error('历史任务名称必须为 1–80 个字符'); value.title = title; }
  if (input.pinned !== undefined) value.pinnedAt = input.pinned ? new Date().toISOString() : undefined;
  return saveAgentSessionV2(value);
}

export function appendAgentEvent(value: AgentSessionV2, type: string, data: any) {
  const event: AgentEvent = { id: `pae_${randomUUID()}`, seq: (value.events.at(-1)?.seq || 0) + 1, type, data, createdAt: new Date().toISOString() };
  value.events.push(event); if (value.events.length > 2000) value.events = value.events.slice(-2000); saveAgentSessionV2(value);
  for (const listener of listeners.get(value.id) || []) listener(event); return event;
}
export function setAgentPhase(value: AgentSessionV2, phase: AgentPhase, data: Record<string, unknown> = {}) { value.phase = phase; appendAgentEvent(value, 'phase_changed', { phase, ...data }); }
export function subscribeAgentEvents(id: string, listener: (event: AgentEvent) => void) { const set = listeners.get(id) || new Set(); set.add(listener); listeners.set(id, set); return () => { set.delete(listener); if (!set.size) listeners.delete(id); }; }
export function eventsAfter(value: AgentSessionV2, afterSeq = 0) { return value.events.filter((event) => event.seq > afterSeq); }

export async function acquireAgentLease(id: string) {
  if (leases.has(id)) return false;
  const owner = `${process.pid}:${randomUUID()}`;
  if (pool) { const result = await pool.query(`UPDATE formflow_project_agent_v2_sessions SET lease_owner=$2,lease_expires_at=NOW()+INTERVAL '45 seconds' WHERE id=$1 AND (lease_expires_at IS NULL OR lease_expires_at<NOW()) RETURNING id`, [id, owner]); if (!result.rows[0]) return false; }
  leaseOwners.set(id, owner);
  leases.add(id); return true;
}
export async function renewAgentLease(id: string) { const owner = leaseOwners.get(id); if (pool && owner) await pool.query(`UPDATE formflow_project_agent_v2_sessions SET lease_expires_at=NOW()+INTERVAL '45 seconds' WHERE id=$1 AND lease_owner=$2`, [id, owner]); }
export async function releaseAgentLease(id: string) { const owner = leaseOwners.get(id); leases.delete(id); leaseOwners.delete(id); if (pool && owner) await pool.query('UPDATE formflow_project_agent_v2_sessions SET lease_owner=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_owner=$2', [id, owner]); }
export function hasAgentLease(id: string) { return leases.has(id); }

export function validateTaskGraph(tasks: AgentTaskNode[]) {
  const ids = new Set(tasks.map((task) => task.id)); if (ids.size !== tasks.length) throw new Error('任务 ID 必须唯一');
  for (const task of tasks) { if (task.dependsOn.some((id) => !ids.has(id))) throw new Error(`任务 ${task.id} 引用了不存在的依赖`); if (task.dependsOn.includes(task.id)) throw new Error(`任务 ${task.id} 不能依赖自身`); }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string) => { if (visiting.has(id)) throw new Error('任务图存在循环依赖'); if (visited.has(id)) return; visiting.add(id); const task = tasks.find((item) => item.id === id)!; task.dependsOn.forEach(visit); visiting.delete(id); visited.add(id); };
  tasks.forEach((task) => visit(task.id));
  const dependsOn = (task: AgentTaskNode, target: string, seen = new Set<string>()): boolean => task.dependsOn.some((id) => id === target || (!seen.has(id) && (seen.add(id), dependsOn(tasks.find((item) => item.id === id)!, target, seen))));
  const writes = tasks.filter((task) => task.access === 'write' && !['superseded', 'cancelled'].includes(task.status)); for (let index = 1; index < writes.length; index += 1) if (writes[index - 1].status !== 'passed' && writes[index].assistsTaskId !== writes[index - 1].id && !dependsOn(writes[index], writes[index - 1].id)) throw new Error(`写任务 ${writes[index].id} 必须依赖或先解决前一个写任务 ${writes[index - 1].id}`);
  return { valid: true };
}

export function selectRunnableTaskBatch(tasks: AgentTaskNode[], maxParallelReads: number) {
  const ready = tasks.filter((task) => task.status === 'pending' && task.dependsOn.every((id) => tasks.find((item) => item.id === id)?.status === 'passed'));
  const reads = ready.filter((task) => task.access === 'read').slice(0, Math.max(1, Math.min(4, maxParallelReads)));
  return reads.length ? reads : ready.find((task) => task.access === 'write') ? [ready.find((task) => task.access === 'write')!] : [];
}

export function compactConversation(value: AgentSessionV2, maxChars: number, recentMessages: number) {
  const old = value.messages.slice(0, Math.max(0, value.messages.length - recentMessages));
  if (!old.length) return;
  const addition = old.map((item) => `${item.role === 'user' ? '用户' : '智能体'}：${item.content}`).join('\n');
  value.conversationSummary = `${value.conversationSummary}\n${addition}`.trim().slice(-maxChars);
  value.messages = value.messages.slice(-recentMessages);
  appendAgentEvent(value, 'context_compacted', { summarizedMessages: old.length, summaryChars: value.conversationSummary.length });
}

export function addAgentArtifact(value: AgentSessionV2, artifact: Omit<AgentArtifact, 'id' | 'createdAt'>) {
  const next: AgentArtifact = { id: `paa_${randomUUID()}`, createdAt: new Date().toISOString(), ...artifact }; value.artifacts.push(next); saveAgentSessionV2(value); return next;
}
