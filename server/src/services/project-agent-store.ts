import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { serverDataPath } from '../config/paths';
import { isMcpRole, type McpRole } from './formflow-tool-registry';

export type ProjectAgentStage = 'blueprint' | 'project_data' | 'form_binding' | 'workflow_binding' | 'behavior_binding' | 'mock_test' | 'quality_repair' | 'release_preview' | 'complete';
export type ProjectAgentMode = 'plan' | 'execute';
export type ProjectAgentExecutionState = 'idle' | 'running' | 'pause_requested' | 'paused' | 'stop_requested' | 'stopped' | 'reset_requested' | 'completed' | 'failed';

export interface ProjectAgentMessage { id: string; role: 'user' | 'assistant'; content: string; createdAt: string; }
export interface ProjectAgentTask { id: string; role: McpRole; instruction: string; acceptance: string[]; status: 'pending' | 'running' | 'passed' | 'failed'; retryCount?: number; maxRetries?: number; }
export interface ProjectAgentPlan { id: string; request: string; summary: string; assumptions: string[]; risks: string[]; tasks: ProjectAgentTask[]; status: 'pending' | 'confirmed' | 'executed'; createdAt: string; confirmedAt?: string; executedAt?: string; }
export interface ProjectAgentSpecialistRun { id: string; taskId: string; role: McpRole; runId?: string; status: 'running' | 'passed' | 'failed' | 'waiting_confirmation'; attempt?: number; input: string; output?: string; startRevision?: string; endRevision?: string; error?: string; createdAt: string; updatedAt: string; }
export interface ProjectAgentSession {
  id: string;
  tenantId: string;
  userId: string;
  projectId?: string;
  title: string;
  profileId: string;
  agentMode: ProjectAgentMode;
  executionState: ProjectAgentExecutionState;
  proposedPlan?: ProjectAgentPlan;
  blueprint?: string;
  blueprintConfirmed: boolean;
  currentStage: ProjectAgentStage;
  stageResults: Array<{ stage: ProjectAgentStage; status: 'pending' | 'running' | 'passed' | 'failed'; summary: string; updatedAt: string }>;
  checkpointRevision?: string;
  currentRole?: McpRole;
  delegationQueue: ProjectAgentTask[];
  specialistRuns: ProjectAgentSpecialistRun[];
  pendingConfirmation?: { runId: string; toolCallId: string; toolName: string; role: McpRole; taskId: string; routeIndex?: number; arguments: Record<string, unknown>; confirmation: any };
  activeRunId?: string;
  messages: ProjectAgentMessage[];
  audit: Array<{ type: string; data: unknown; createdAt: string }>;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

const STORE_PATH = process.env.PROJECT_AGENT_STORE_PATH || serverDataPath('configs', 'project-agent-sessions.json');
function readAll(): ProjectAgentSession[] {
  if (!existsSync(STORE_PATH)) return [];
  try {
    const value = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
    return Array.isArray(value) ? value.map((item) => {
      const pendingValid = item.pendingConfirmation && isMcpRole(item.pendingConfirmation.role) && item.pendingConfirmation.taskId;
      const executionState: ProjectAgentExecutionState = ['idle', 'running', 'pause_requested', 'paused', 'stop_requested', 'stopped', 'reset_requested', 'completed', 'failed'].includes(item.executionState) ? item.executionState : item.currentRole ? 'running' : item.currentStage === 'complete' ? 'completed' : 'idle';
      return { delegationQueue: [], specialistRuns: [], ...item, executionState, currentRole: isMcpRole(item.currentRole) ? item.currentRole : undefined, agentMode: item.agentMode === 'execute' ? 'execute' : 'plan', pendingConfirmation: pendingValid ? item.pendingConfirmation : undefined, activeRunId: pendingValid ? item.activeRunId : undefined };
    }) : [];
  } catch { return []; }
}
function writeAll(value: ProjectAgentSession[]) {
  mkdirSync(dirname(STORE_PATH), { recursive: true }); const temp = `${STORE_PATH}.${process.pid}.tmp`; writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`); renameSync(temp, STORE_PATH);
}

export function createProjectAgentSession(input: { tenantId: string; userId: string; projectId?: string; profileId?: string; title?: string; agentMode?: ProjectAgentMode }) {
  const now = new Date().toISOString();
  const session: ProjectAgentSession = {
    id: `pas_${randomUUID()}`, tenantId: input.tenantId, userId: input.userId, projectId: input.projectId,
    title: input.title || '项目编排', profileId: input.profileId || 'default-cloud', agentMode: input.agentMode || 'plan', executionState: 'idle', blueprintConfirmed: Boolean(input.projectId),
    currentStage: input.projectId ? 'quality_repair' : 'blueprint', stageResults: [], delegationQueue: [], specialistRuns: [], messages: [], audit: [], archived: false, createdAt: now, updatedAt: now,
  };
  writeAll([...readAll(), session]); return session;
}
export function listProjectAgentSessions(scope: { tenantId: string; userId: string; projectId?: string }) {
  return readAll().filter((item) => !item.archived && item.tenantId === scope.tenantId && item.userId === scope.userId && (!scope.projectId || item.projectId === scope.projectId));
}
export function getProjectAgentSession(id: string) { return readAll().find((item) => item.id === id); }
export function saveProjectAgentSession(session: ProjectAgentSession) {
  session.updatedAt = new Date().toISOString(); const items = readAll(); const index = items.findIndex((item) => item.id === session.id); if (index >= 0) items[index] = session; else items.push(session); writeAll(items); return session;
}
export function addProjectAgentMessage(session: ProjectAgentSession, role: 'user' | 'assistant', content: string) {
  session.messages.push({ id: `pam_${randomUUID()}`, role, content, createdAt: new Date().toISOString() });
  if (session.messages.length === 1) session.title = content.slice(0, 32);
}
export function recordProjectAgentEvents(session: ProjectAgentSession, events: Array<{ type: string; data: unknown }>) {
  session.audit.push(...events.map((event) => ({ ...event, createdAt: new Date().toISOString() })));
  session.audit = session.audit.slice(-500);
}
