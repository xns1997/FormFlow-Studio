export type ProjectAgentRole = 'project' | 'data' | 'form' | 'workflow' | 'behavior' | 'quality' | 'delivery';
export type ProjectAgentPhase = 'grounding' | 'clarifying' | 'planning' | 'awaiting_plan_approval' | 'executing' | 'recovering' | 'awaiting_operation_approval' | 'paused' | 'completed' | 'failed' | 'stopped';
export type ProjectAgentConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type ProjectAgentSessionScope = 'project' | 'unbound' | 'all';

export interface ProjectAgentTask {
  id: string; role: ProjectAgentRole; title: string; instruction: string; access: 'read' | 'write'; dependsOn: string[];
  acceptance: string[]; status: string; attempt: number; maxAttempts: number; startRevision?: string; endRevision?: string;
  output?: string; error?: string; evidenceArtifactIds: string[];
  requirementIds?: string[]; evidenceKinds?: string[]; verificationScenarioIds?: string[];
  origin?: 'planned' | 'recovery' | 'diagnostic' | 'steer'; generation?: number; supersedesTaskId?: string; strategyKey?: string; failureClass?: string; blockedBy?: string[]; projectId?: string;
}
export interface ProjectAgentRequirement { id: string; statement: string; domain: ProjectAgentRole; acceptanceScenarios: string[]; risk: 'normal' | 'high'; capabilityStatus: 'supported' | 'capability_gap' | 'needs_user_input' | 'verified' | 'failed'; taskIds: string[]; evidenceArtifactIds: string[]; failureReason?: string; }
export interface ProjectAgentRequirementCoverage { total: number; supported: number; verified: number; failed: number; capabilityGaps: number; needsUserInput: number; complete: boolean; }
export interface ProjectAgentPlan { id: string; revision: number; goal: string; successCriteria: string[]; summary: string; assumptions: string[]; risks: string[]; tasks: ProjectAgentTask[]; status: 'pending' | 'confirmed' | 'superseded' | 'executed'; parentPlanId?: string; revisionReason?: string; approvalRequired?: boolean; automaticRevision?: boolean; }
export interface ProjectAgentQuestion { id: string; header: string; question: string; kind: 'choice' | 'text'; options?: Array<{ label: string; description?: string }>; }
export interface ProjectAgentEvent { seq: number; type: string; data: any; createdAt: string; }
export interface ProjectAgentSessionV2 {
  schemaVersion: 2; id: string; projectId?: string; projectIds?: string[]; projectRevisions?: Record<string, string>; phase: ProjectAgentPhase; checkpointRevision?: string; activePlanId?: string; plans: ProjectAgentPlan[];
  questions: ProjectAgentQuestion[];
  requirements?: ProjectAgentRequirement[];
  requirementCoverage?: ProjectAgentRequirementCoverage;
  pendingApproval?: { id: string; toolName: string; taskId: string; confirmation: { summary?: string; impact?: unknown } };
  artifacts: Array<{ id: string; taskId?: string; kind?: string; title: string; data: unknown }>;
  events: ProjectAgentEvent[];
  recovery?: { cycles: number; maxCycles: number; dynamicTasks: number; maxDynamicTasks: number; strategies: Record<string, number>; lastFailureTaskId?: string; lastFailureClass?: string };
}

export interface ProjectAgentSessionSummary extends ProjectAgentSessionV2 { title: string; createdAt: string; updatedAt: string; }

export interface ProjectAgentActivityState {
  active: boolean;
  label: string;
  detail: string;
  startedAt?: number;
  lastEventAt?: number;
  stale: boolean;
}

export interface ProjectAgentTaskLineage {
  id: string;
  rootTaskId: string;
  taskIds: string[];
  tasks: ProjectAgentTask[];
  representative: ProjectAgentTask;
  totalAttempts: number;
  firstPlanIndex: number;
}

export type ProjectAgentActivityKind = 'task' | 'tool' | 'verification' | 'quality' | 'approval' | 'recovery' | 'error' | 'technical';
export type ProjectAgentActivityStatus = 'running' | 'passed' | 'failed' | 'warning' | 'neutral';
export interface ProjectAgentActivityItem {
  id: string;
  kind: ProjectAgentActivityKind;
  status: ProjectAgentActivityStatus;
  title: string;
  detail?: string;
  createdAt: string;
  eventSeqs: number[];
  events: ProjectAgentEvent[];
  technicalEvents: ProjectAgentEvent[];
  hiddenFromSummary?: boolean;
}

export const roleLabels: Record<ProjectAgentRole, string> = { project: '项目专家', data: '数据专家', form: '表单专家', workflow: '流程专家', behavior: '行为规则专家', quality: '质量专家', delivery: '交付专家' };
export const phaseLabels: Record<ProjectAgentPhase, string> = { grounding: '检查项目', clarifying: '等待补充', planning: '生成计划', awaiting_plan_approval: '等待确认计划', executing: '执行中', recovering: '自动恢复中', awaiting_operation_approval: '等待操作确认', paused: '已暂停', completed: '已完成', failed: '失败', stopped: '已停止' };

const activeAgentPhases = new Set<ProjectAgentPhase>(['grounding', 'planning', 'executing', 'recovering']);

function eventTimestamp(value?: string) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function projectAgentActivityState(session: ProjectAgentSessionV2 | null, now = Date.now()): ProjectAgentActivityState {
  if (!session || !activeAgentPhases.has(session.phase)) return { active: false, label: '', detail: '', stale: false };
  const plan = activeProjectAgentPlan(session); const runningTask = plan?.tasks.find((task) => task.status === 'running');
  const lastEvent = session.events[session.events.length - 1];
  const phaseStart = [...session.events].reverse().find((event) => event.type === 'phase_changed' && event.data?.phase === session.phase)
    || [...session.events].reverse().find((event) => ['turn_started', 'task_started', 'recovery_started'].includes(event.type));
  const startedAt = eventTimestamp(phaseStart?.createdAt) || eventTimestamp(lastEvent?.createdAt);
  const lastEventAt = eventTimestamp(lastEvent?.createdAt);
  const stale = Boolean(lastEventAt && now - lastEventAt >= 60_000);
  const label = session.phase === 'grounding' ? '正在检查项目现状'
    : session.phase === 'planning' ? '正在生成可确认的任务图'
      : session.phase === 'recovering' ? '正在诊断失败并调整执行策略'
        : runningTask ? `正在执行：${runningTask.title}` : '正在调度下一项任务';
  const detail = lastEvent ? `最近进度：${summarizeProjectAgentEvent(lastEvent)}` : '请求已提交，正在等待第一个执行事件';
  return { active: true, label, detail, startedAt, lastEventAt, stale };
}

export function activeProjectAgentPlan(session: ProjectAgentSessionV2) {
  return session.plans.find((item) => item.id === session.activePlanId) || session.plans[session.plans.length - 1];
}

export function projectAgentSessionStorageKey(projectId?: string) { return `formflow.projectAgent.activeSession.${projectId || 'global'}`; }

export function isAffirmativePlanConfirmation(value: string) {
  return ['确认', '确认执行', '执行', '继续'].includes(value.trim().replace(/[。！!]+$/, ''));
}

export function requiresPauseBeforeSessionSwitch(phase: ProjectAgentPhase) {
  return phase === 'executing' || phase === 'recovering';
}

export function chooseInitialProjectAgentSession<T extends { id: string }>(sessions: T[], rememberedId?: string | null) {
  return sessions.find((item) => item.id === rememberedId) || sessions[0];
}

export function sessionProjectScope(session: { projectId?: string; projectIds?: string[] }) { return [...new Set([...(session.projectIds || []), ...(session.projectId ? [session.projectId] : [])])]; }

export function groupProjectAgentSessions<T extends { projectId?: string; projectIds?: string[] }>(sessions: T[], currentProjectId?: string) {
  return {
    currentProject: currentProjectId ? sessions.filter((item) => sessionProjectScope(item).includes(currentProjectId)) : [],
    unbound: sessions.filter((item) => sessionProjectScope(item).length === 0),
    otherProjects: sessions.filter((item) => sessionProjectScope(item).length > 0 && (!currentProjectId || !sessionProjectScope(item).includes(currentProjectId))),
  };
}

export function taskStatus(value: string): 'passed' | 'failed' | 'running' | 'paused' | 'blocked' | 'superseded' | 'pending' {
  if (value === 'cancelled') return 'superseded';
  if (value === 'passed' || value === 'failed' || value === 'running' || value === 'paused' || value === 'blocked' || value === 'superseded') return value;
  return 'pending';
}

export const taskStatusLabels: Record<ReturnType<typeof taskStatus>, string> = {
  passed: '已完成', failed: '失败', running: '执行中', paused: '已暂停', blocked: '受阻', superseded: '已替代', pending: '待执行',
};

export function buildProjectAgentTaskLineages(tasks: ProjectAgentTask[]): ProjectAgentTaskLineage[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const indexById = new Map(tasks.map((task, index) => [task.id, index]));
  const rootFor = (task: ProjectAgentTask) => {
    let current = task; const visited = new Set([task.id]);
    while (current.supersedesTaskId && byId.has(current.supersedesTaskId) && !visited.has(current.supersedesTaskId)) {
      visited.add(current.supersedesTaskId); current = byId.get(current.supersedesTaskId)!;
    }
    return current.id;
  };
  const grouped = new Map<string, ProjectAgentTask[]>();
  for (const task of tasks) { const root = rootFor(task); grouped.set(root, [...(grouped.get(root) || []), task]); }
  return [...grouped.entries()].map(([rootTaskId, lineageTasks]) => {
    const sorted = [...lineageTasks].sort((left, right) => (indexById.get(left.id) || 0) - (indexById.get(right.id) || 0));
    const supersededIds = new Set(sorted.map((task) => task.supersedesTaskId).filter(Boolean));
    const representative = [...sorted].reverse().find((task) => !supersededIds.has(task.id)) || sorted[sorted.length - 1];
    return {
      id: rootTaskId, rootTaskId, tasks: sorted, taskIds: sorted.map((task) => task.id), representative,
      totalAttempts: sorted.reduce((total, task) => total + Math.max(0, task.attempt || 0), 0),
      firstPlanIndex: Math.min(...sorted.map((task) => indexById.get(task.id) || 0)),
    };
  }).sort((left, right) => left.firstPlanIndex - right.firstPlanIndex);
}

export function lineageForTask(lineages: ProjectAgentTaskLineage[], taskId?: string) {
  return taskId ? lineages.find((lineage) => lineage.taskIds.includes(taskId)) : undefined;
}

export function groupProjectAgentTaskLineages(lineages: ProjectAgentTaskLineage[], currentLineageId?: string) {
  const remaining = [...lineages].sort((left, right) => left.id === currentLineageId ? -1 : right.id === currentLineageId ? 1 : left.firstPlanIndex - right.firstPlanIndex);
  return {
    running: remaining.filter((lineage) => taskStatus(lineage.representative.status) === 'running'),
    attention: remaining.filter((lineage) => ['failed', 'blocked', 'paused'].includes(taskStatus(lineage.representative.status))),
    pending: remaining.filter((lineage) => taskStatus(lineage.representative.status) === 'pending'),
    completed: remaining.filter((lineage) => ['passed', 'superseded'].includes(taskStatus(lineage.representative.status))),
  };
}

function eventDetail(event: ProjectAgentEvent) {
  const error = event.data?.error;
  if (typeof error === 'string') return error;
  if (error?.message) return `${error.code ? `${error.code}：` : ''}${error.message}`;
  const resultError = event.data?.result?.error;
  if (resultError?.message) return `${resultError.code ? `${resultError.code}：` : ''}${resultError.message}`;
  if (event.data?.summary) return String(event.data.summary);
  if (event.data?.reason) return String(event.data.reason);
  if (event.data?.revision) return `revision ${String(event.data.revision).slice(0, 12)}`;
  return undefined;
}

function semanticActivity(event: ProjectAgentEvent): Omit<ProjectAgentActivityItem, 'id' | 'eventSeqs' | 'events' | 'technicalEvents'> | undefined {
  const toolName = event.data?.toolName || event.data?.tool_name || event.data?.name;
  const exact: Record<string, [ProjectAgentActivityKind, ProjectAgentActivityStatus, string]> = {
    task_started: ['task', 'running', '开始执行任务'], task_completed: ['task', 'passed', '任务通过验收'], task_failed: ['error', 'failed', '任务执行失败'], task_paused: ['task', 'warning', '任务已安全暂停'],
    verification_started: ['verification', 'running', '开始验收'], verification_completed: ['verification', 'passed', '验收通过'], verification_failed: ['verification', 'failed', '验收未通过'],
    quality_gate_failed: ['quality', 'failed', '质量门禁未通过'], quality_gate_passed: ['quality', 'passed', '质量门禁通过'], quality_remediation_scheduled: ['quality', 'running', '已安排质量修复'], remediation_verification_started: ['quality', 'running', '开始修复复检'], remediation_verification_completed: ['quality', 'passed', '修复复检通过'], remediation_verification_failed: ['quality', 'failed', '修复复检未通过'],
    approval_required: ['approval', 'warning', '等待操作确认'], approval_decided: ['approval', event.data?.approved === false ? 'failed' : 'passed', event.data?.approved === false ? '操作已拒绝' : '操作已确认'], operation_blocked: ['approval', 'failed', '操作已阻止'],
    recovery_started: ['recovery', 'running', '开始自动恢复'], recovery_blocked: ['recovery', 'warning', '自动恢复等待处理'], recovery_exhausted: ['recovery', 'failed', '自动恢复次数已用尽'], strategy_changed: ['recovery', 'neutral', '已切换修复策略'], task_graph_revised: ['recovery', 'passed', '任务计划已调整'],
    tool_preflight_failed: ['tool', 'failed', `工具参数预检未通过${toolName ? ` · ${toolName}` : ''}`], tool_rejected: ['tool', 'failed', `工具调用已拒绝${toolName ? ` · ${toolName}` : ''}`], tool_failure_repeated: ['tool', 'failed', `重复工具错误已停止${toolName ? ` · ${toolName}` : ''}`],
    requirement_verified: ['verification', 'passed', '需求场景已验证'], capability_gap_detected: ['verification', 'failed', '发现能力或验收缺口'], semantic_gate_failed: ['quality', 'failed', '项目语义门禁未通过'],
  };
  const mapped = exact[event.type];
  if (mapped) return { kind: mapped[0], status: mapped[1], title: mapped[2], detail: eventDetail(event), createdAt: event.createdAt };
  if (event.type === 'tool_started') return { kind: 'tool', status: 'running', title: `调用工具${toolName ? ` · ${toolName}` : ''}`, createdAt: event.createdAt };
  if (event.type === 'tool_completed') {
    const failed = event.data?.result?.ok === false;
    return { kind: 'tool', status: failed ? 'failed' : 'passed', title: `${failed ? '工具执行失败' : '工具执行完成'}${toolName ? ` · ${toolName}` : ''}`, detail: eventDetail(event), createdAt: event.createdAt };
  }
  return undefined;
}

export function buildProjectAgentActivity(events: ProjectAgentEvent[], taskIds: string[]): ProjectAgentActivityItem[] {
  const ids = new Set(taskIds);
  const relevant = [...events].filter((event) => ids.has(event.data?.taskId) || ids.has(event.data?.sourceTaskId) || ids.has(event.data?.qualityTaskId) || ids.has(event.data?.gateTaskId)).sort((left, right) => left.seq - right.seq);
  const activities: ProjectAgentActivityItem[] = []; let pendingTechnical: ProjectAgentEvent[] = [];
  const appendTechnical = (event: ProjectAgentEvent) => { const latest = activities[activities.length - 1]; if (latest) latest.technicalEvents.push(event); else pendingTechnical.push(event); };
  for (const event of relevant) {
    if (['message_delta', 'node_started', 'node_completed', 'tool_call', 'tool_result', 'coverage_updated'].includes(event.type)) { appendTechnical(event); continue; }
    const semantic = semanticActivity(event);
    if (!semantic) { appendTechnical(event); continue; }
    if (event.type === 'tool_completed') {
      const toolName = event.data?.toolName || event.data?.tool_name;
      const running = [...activities].reverse().find((item) => item.kind === 'tool' && item.status === 'running' && (!toolName || item.title.endsWith(`· ${toolName}`)));
      if (running) {
        running.status = semantic.status; running.title = semantic.title; running.detail = semantic.detail; running.createdAt = event.createdAt;
        running.eventSeqs.push(event.seq); running.events.push(event); running.technicalEvents.push(...pendingTechnical); pendingTechnical = []; continue;
      }
    }
    activities.push({ id: `activity-${event.seq}`, ...semantic, eventSeqs: [event.seq], events: [event], technicalEvents: pendingTechnical }); pendingTechnical = [];
  }
  if (pendingTechnical.length) {
    const latest = activities[activities.length - 1];
    if (latest) latest.technicalEvents.push(...pendingTechnical);
    else activities.push({ id: `activity-technical-${pendingTechnical[0].seq}`, kind: 'technical', status: 'neutral', title: '模型执行详情', createdAt: pendingTechnical[0].createdAt, eventSeqs: [], events: [], technicalEvents: pendingTechnical, hiddenFromSummary: true });
  }
  return activities;
}

export function chooseCurrentTaskId(session: ProjectAgentSessionV2): string | undefined {
  const tasks = activeProjectAgentPlan(session)?.tasks || [];
  const approvalTaskId = session.pendingApproval?.taskId;
  if (approvalTaskId && tasks.some((task) => task.id === approvalTaskId)) return approvalTaskId;
  return tasks.find((task) => task.status === 'running')?.id
    || tasks.find((task) => task.origin === 'recovery' && task.status === 'pending')?.id
    || tasks.find((task) => task.status === 'failed')?.id
    || tasks.find((task) => task.status === 'blocked')?.id
    || tasks.find((task) => task.status === 'paused')?.id
    || tasks.find((task) => !['passed', 'completed', 'superseded', 'cancelled'].includes(task.status))?.id
    || [...tasks].reverse().find((task) => ['passed', 'completed'].includes(task.status))?.id;
}

export function groupProjectAgentTasks(tasks: ProjectAgentTask[], currentTaskId?: string) {
  const remaining = tasks.filter((task) => task.id !== currentTaskId);
  return {
    pending: remaining.filter((task) => !['passed', 'completed', 'failed', 'blocked', 'superseded', 'cancelled'].includes(task.status)),
    completed: remaining.filter((task) => ['passed', 'completed'].includes(task.status)),
    failed: remaining.filter((task) => ['failed', 'blocked', 'superseded', 'cancelled'].includes(task.status)),
  };
}

export function dependencySummary(task: ProjectAgentTask, tasks: ProjectAgentTask[]) {
  if (!task.dependsOn.length) return '无前置依赖';
  const labels = task.dependsOn.map((id) => tasks.find((item) => item.id === id)?.title || id);
  return `${labels.length} 个依赖：${labels.join('、')}`;
}

export interface QualityRepairStep { key: 'diagnosis' | 'repair' | 'verification' | 'rerun'; label: string; state: 'pending' | 'running' | 'passed' | 'failed'; detail?: string; }
export function buildQualityRepairChain(session: ProjectAgentSessionV2, task?: ProjectAgentTask): QualityRepairStep[] {
  const events = session.events;
  const has = (...types: string[]) => events.some((event) => types.includes(event.type));
  const latest = (...types: string[]) => [...events].reverse().find((event) => types.includes(event.type));
  const diagnosis = latest('quality_gate_failed');
  const repair = latest('quality_remediation_scheduled', 'quality_repair_started', 'remediation_task_created');
  const verification = latest('remediation_verification_started', 'remediation_verification_completed', 'remediation_verification_failed');
  const rerun = latest('quality_gate_rerun_started', 'quality_gate_passed', 'quality_gate_failed');
  const relevant = task?.role === 'quality' || Boolean(diagnosis || repair || verification);
  if (!relevant) return [];
  const stateFor = (event: ProjectAgentEvent | undefined, passed: string[], failed: string[]): QualityRepairStep['state'] => !event ? 'pending' : failed.includes(event.type) ? 'failed' : passed.includes(event.type) ? 'passed' : 'running';
  return [
    { key: 'diagnosis', label: '质量诊断', state: diagnosis ? 'passed' : 'pending', detail: diagnosis?.data?.summary || diagnosis?.data?.error },
    { key: 'repair', label: '修复任务', state: stateFor(repair, ['quality_remediation_scheduled', 'remediation_task_created'], []), detail: repair?.data?.title },
    { key: 'verification', label: '修复复检', state: stateFor(verification, ['remediation_verification_completed'], ['remediation_verification_failed']) },
    { key: 'rerun', label: '质量专家复跑', state: !has('quality_gate_rerun_started', 'quality_gate_passed') ? 'pending' : stateFor(rerun, ['quality_gate_passed'], ['quality_gate_failed']) },
  ];
}

export function clampProjectAgentWidth(width: number, viewportWidth: number) {
  const available = Math.max(320, viewportWidth - 24);
  return Math.round(Math.min(920, available, Math.max(viewportWidth <= 760 ? 320 : 520, width)));
}

export function summarizeProjectAgentEvent(event: ProjectAgentEvent) {
  const labels: Record<string, string> = {
    turn_started: '请求已提交', grounding_started: '开始检查项目', grounding_completed: '项目检查完成', planning_attempt_started: '正在请求模型生成计划', planning_attempt_failed: '计划格式校验未通过，正在修正', plan_proposed: '任务图已生成',
    task_started: '任务开始', task_completed: '任务完成', task_failed: '任务失败', tool_started: '调用工具', tool_completed: '工具完成',
    tool_arguments_normalized: '工具参数已安全规范化', tool_preflight_failed: '工具参数预检未通过', tool_failure_repeated: '相同工具错误已停止重试', data_verification_completed: '数据源与主键验收通过',
    verification_started: '开始验收', verification_completed: '验收通过', verification_failed: '验收失败', approval_required: '等待操作确认',
    tool_rejected: '不安全或越界工具调用已拒绝，正在纠正', behavior_verification_completed: '行为规则写入后复检通过',
    failure_classified: '失败已分类', recovery_started: '开始自动恢复', task_graph_patch_proposed: '生成任务图补丁', task_graph_revised: '任务图已动态修订',
    task_blocked: '任务被依赖阻断', task_unblocked: '任务阻断已解除', strategy_rejected: '重复失败策略已拒绝', strategy_changed: '已切换执行策略', recovery_blocked: '自动恢复需要用户处理', recovery_exhausted: '自动恢复预算已耗尽',
    quality_gate_failed: '质量门禁未通过', quality_gate_passed: '质量门禁通过', remediation_verification_completed: '修复复检通过',
    requirements_compiled: '需求契约已编译', requirement_verified: '需求场景获得证据', capability_gap_detected: '发现未解决的能力或验收缺口', semantic_gate_failed: '项目语义门禁未通过', coverage_updated: '需求证据覆盖已更新',
  };
  const toolName = event.data?.toolName || event.data?.tool_name;
  return toolName ? `${labels[event.type] || event.type} · ${toolName}` : labels[event.type] || event.type;
}
