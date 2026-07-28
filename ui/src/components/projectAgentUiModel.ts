export type ProjectAgentRole = 'project' | 'data' | 'form' | 'workflow' | 'behavior' | 'quality' | 'delivery';
export type ProjectAgentPhase = 'idle' | 'grounding' | 'analyzing_requirements' | 'clarifying' | 'planning' | 'awaiting_plan_approval' | 'executing' | 'recovering' | 'awaiting_operation_approval' | 'paused' | 'completed' | 'failed' | 'stopped';
export type ProjectAgentConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type ProjectAgentSessionScope = 'project' | 'unbound' | 'all';
export type ProjectAgentHistoryStatus = 'active' | 'attention' | 'completed';
export type ProjectAgentMessageKind = 'user' | 'question' | 'plan_summary' | 'completion' | 'assistant';
export interface ProjectAgentConversationMessage { id: string; role: 'user' | 'assistant'; content: string; createdAt?: string; turnId?: string; kind?: ProjectAgentMessageKind; }

export interface ProjectAgentTask {
  id: string; role: ProjectAgentRole; title: string; instruction: string; access: 'read' | 'write'; dependsOn: string[];
  acceptance: string[]; status: string; attempt: number; maxAttempts: number; startRevision?: string; endRevision?: string;
  output?: string; error?: string; evidenceArtifactIds: string[];
  requirementIds?: string[]; evidenceKinds?: string[]; verificationScenarioIds?: string[];
  origin?: 'planned' | 'recovery' | 'diagnostic' | 'steer' | 'loop' | 'action'; generation?: number; supersedesTaskId?: string; strategyKey?: string; failureClass?: string; blockedBy?: string[]; projectId?: string; roundId?: string; stepId?: string; decisionReason?: string; revisionConflictCount?: number; expertRepairCount?: number; assistsTaskId?: string; assistance?: { status: 'needed' | 'assigned' | 'resolved'; reason: string; depth: number; triedRoles: ProjectAgentRole[]; helperTaskId?: string; helperRole?: ProjectAgentRole; requestedRole?: ProjectAgentRole };
}
export interface ProjectAgentRoundDecision { role: ProjectAgentRole; decision: 'run' | 'skip'; reason: string; taskId?: string; task?: { title: string; instruction: string; access: 'read' | 'write'; projectId?: string }; }
export interface ProjectAgentRound { id: string; turnId?: string; index: number; status: 'planning' | 'running' | 'completed' | 'waiting' | 'failed'; action?: 'continue' | 'complete' | 'ask_user' | 'abort'; summary?: string; decisions: ProjectAgentRoundDecision[]; taskIds: string[]; cancelledTaskIds?: string[]; progressed?: boolean; startedAt: string; completedAt?: string; }
export interface ProjectAgentObservation { id: string; stepId: string; taskId?: string; role?: ProjectAgentRole; status: 'succeeded' | 'failed' | 'blocked' | 'waiting_confirmation'; action: string; summary: string; changes: string[]; evidence: string[]; unresolved: string[]; error?: { category: string; message: string; retryable: boolean; suggestion?: string }; createdAt: string; }
export interface ProjectAgentActionStep { id: string; turnId?: string; index: number; status: 'deciding' | 'running' | 'completed' | 'waiting' | 'failed'; action?: 'assign' | 'complete' | 'ask_user' | 'abort'; summary?: string; progressed?: boolean; inputFingerprint?: string; taskIds: string[]; observationIds: string[]; startedAt: string; completedAt?: string; }
export interface ProjectAgentRequirement { id: string; statement: string; domain: ProjectAgentRole; acceptanceScenarios: string[]; risk: 'normal' | 'high'; capabilityStatus: 'supported' | 'capability_gap' | 'needs_user_input' | 'verified' | 'failed'; taskIds: string[]; evidenceArtifactIds: string[]; failureReason?: string; }
export interface ProjectAgentRequirementCoverage { total: number; planned: number; supported: number; verified: number; failed: number; capabilityGaps: number; needsUserInput: number; planComplete: boolean; complete: boolean; }
export interface ProjectAgentPlan { id: string; turnId?: string; revision: number; goal: string; successCriteria: string[]; summary: string; assumptions: string[]; risks: string[]; tasks: ProjectAgentTask[]; status: 'pending' | 'confirmed' | 'superseded' | 'executed'; createdAt?: string; requirementRevision?: number; parentPlanId?: string; revisionReason?: string; approvalRequired?: boolean; automaticRevision?: boolean; }
export interface ProjectAgentQuestion { id: string; turnId?: string; createdAt?: string; header: string; question: string; kind: 'choice' | 'text'; options?: Array<{ label: string; description?: string }>; }
export interface ProjectAgentEvent { seq: number; type: string; data: any; createdAt: string; }
export interface ProjectAgentSessionV2 {
  schemaVersion: 2; id: string; projectId?: string; projectIds?: string[]; projectRevisions?: Record<string, string>; phase: ProjectAgentPhase; checkpointRevision?: string; activePlanId?: string; plans: ProjectAgentPlan[];
  questions: ProjectAgentQuestion[];
  requirements?: ProjectAgentRequirement[];
  requirementCoverage?: ProjectAgentRequirementCoverage;
  requirementRevision?: number;
  pendingApproval?: { id: string; toolName: string; taskId: string; confirmation: { summary?: string; impact?: unknown } };
  artifacts: Array<{ id: string; taskId?: string; kind?: string; title: string; data: unknown }>;
  events: ProjectAgentEvent[];
  messages?: ProjectAgentConversationMessage[];
  recovery?: { cycles: number; maxCycles: number; dynamicTasks: number; maxDynamicTasks: number; strategies: Record<string, number>; lastFailureTaskId?: string; lastFailureClass?: string };
  orchestration?: { currentRound: number; maxRounds: number; currentStep?: number; maxDecisionSteps?: number; consecutiveNoProgress: number; maxNoProgressRounds: number; lastProgressFingerprint?: string; status: 'idle' | 'running' | 'waiting' | 'completed' | 'failed' | 'stopped' };
  rounds?: ProjectAgentRound[];
  steps?: ProjectAgentActionStep[];
  observations?: ProjectAgentObservation[];
  pinnedAt?: string;
}

export interface ProjectAgentHistorySummary {
  id: string; title: string; projectId?: string; projectIds: string[]; phase: ProjectAgentPhase; status: ProjectAgentHistoryStatus; goal: string;
  requirementCoverage: { total: number; verified: number; failed: number; complete: boolean };
  pinnedAt?: string; archived: boolean; createdAt: string; updatedAt: string;
}
export interface ProjectAgentHistoryPage { items: ProjectAgentHistorySummary[]; nextCursor?: string; }

export type ProjectAgentTimelineEntry =
  | { id: string; type: 'message'; turnId: string; at: string; message: ProjectAgentConversationMessage }
  | { id: string; type: 'planning'; turnId: string; at: string; plan: ProjectAgentPlan }
  | { id: string; type: 'round'; turnId: string; at: string; round: ProjectAgentRound }
  | { id: string; type: 'action'; turnId: string; at: string; step: ProjectAgentActionStep }
  | { id: string; type: 'task'; turnId: string; at: string; task: ProjectAgentTask; roundId?: string }
  | { id: string; type: 'question'; turnId: string; at: string; questions: ProjectAgentQuestion[] }
  | { id: string; type: 'approval'; turnId: string; at: string; taskId: string; approval: NonNullable<ProjectAgentSessionV2['pendingApproval']> }
  | { id: string; type: 'summary'; turnId: string; at: string; event: ProjectAgentEvent };

export interface ProjectAgentTimelineTurn { id: string; startedAt: string; entries: ProjectAgentTimelineEntry[]; }

export function shouldProjectAgentTimelineFollow(scrollHeight: number, scrollTop: number, clientHeight: number, threshold = 120) {
  return scrollHeight - scrollTop - clientHeight < threshold;
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

export interface ProjectAgentWorkNarrative {
  headline: string;
  detail: string;
  next: string;
  completedChecks: number;
  totalChecks: number;
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
export const phaseLabels: Record<ProjectAgentPhase, string> = { idle: '等待输入', grounding: '检查项目', analyzing_requirements: '理解需求', clarifying: '等待补充', planning: '生成计划', awaiting_plan_approval: '等待确认计划', executing: '执行中', recovering: '自动恢复中', awaiting_operation_approval: '等待操作确认', paused: '已暂停', completed: '已完成', failed: '失败', stopped: '已停止' };

const activeAgentPhases = new Set<ProjectAgentPhase>(['grounding', 'analyzing_requirements', 'planning', 'executing', 'recovering']);

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
  const label = session.phase === 'grounding' ? '我先看看项目现在是什么情况'
    : session.phase === 'analyzing_requirements' ? '我在把你的想法整理成清晰目标'
    : session.phase === 'planning' ? '我在核对完成标准和风险边界'
      : session.phase === 'recovering' ? '刚才遇到点问题，我正在查原因'
        : runningTask ? `我正在处理：${runningTask.title}` : '我在根据现有进展决定下一步';
  const detail = lastEvent ? humanEventSummary(lastEvent) : '我已经接到你的需求，正在开始处理。';
  return { active: true, label, detail, startedAt, lastEventAt, stale };
}

function sentence(value?: string) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return /[。！？]$/.test(clean) ? clean : `${clean}。`;
}

function humanReason(value?: string) {
  return sentence(value).replace(/^(分配|安排)(当前)?任务[：:\s]*/i, '').replace(/^(下一步|本次行动)[：:\s]*/i, '').replace(/。$/, '');
}

export function humanEventSummary(event: ProjectAgentEvent) {
  const exact: Record<string, string> = {
    turn_started: '我已经接到你的需求，先从项目现状开始。', grounding_started: '我正在查看项目里已经有哪些内容。', grounding_completed: '项目现状已经看过了，我继续整理目标。',
    requirements_analysis_started: '我在理解你真正想完成的业务结果。', requirements_analysis_completed: '目标和验收条件已经整理清楚。', plan_proposed: '我把目标、完成标准和风险边界整理好了。',
    decision_started: '我正在结合现有结果判断下一步。', action_selected: '下一步已经想清楚了，我开始处理。', action_completed: '这一步处理完了，我会先看结果再继续。',
    project_state_check_started: '在问你之前，我先重新核对项目现状。', project_state_check_completed: '项目现状已经核对过了。', question_reconsideration_started: '我再判断一下，这个问题能不能自己解决。',
    question_reconsideration_completed: event.data?.avoidedQuestion ? '项目里已经有答案，不用打断你，我继续处理。' : '项目里找不到这个决定，需要请你确认。',
    recovery_started: '这一步没有按预期完成，我正在找原因并调整办法。', task_investigating: '当前操作需要调整，专家正在核对原因。', task_correction_requested: '已经找到受限操作，专家会调整方法后继续。', expert_assistance_started: '协助专家正在解决当前阻断。', expert_assistance_assigned: '当前专家解决不了，我请更合适的专家先来处理。', task_resumed: '协助问题已经处理，原专家从卡住的位置继续。', expert_resumed_after_assistance: '协助问题已经处理，原专家接着往下做。',
    orchestration_completed: '所有要求都已经完成并通过检查。',
  };
  return exact[event.type] || sentence(summarizeProjectAgentEvent(event).replace(/大模型/g, '我').replace(/任务图/g, '处理安排').replace(/任务/g, '工作'));
}

export function projectAgentWorkNarrative(step: ProjectAgentActionStep, tasks: ProjectAgentTask[], observations: ProjectAgentObservation[] = []): ProjectAgentWorkNarrative {
  const completedChecks = tasks.reduce((count, task) => count + Math.min(task.acceptance.length, task.evidenceArtifactIds.length), 0);
  const totalChecks = tasks.reduce((count, task) => count + task.acceptance.length, 0);
  const latest = observations[observations.length - 1]; const first = tasks[0];
  if (step.status === 'deciding') return { headline: '我正在判断接下来先做什么', detail: '我会结合已经完成的内容和仍缺少的验收结果，只选择现在真正需要的一步。', next: '想清楚后，我会直接安排合适的专家处理。', completedChecks, totalChecks };
  if (step.status === 'waiting') return { headline: '这里需要你确认后才能继续', detail: latest?.summary || step.summary || '有一项业务决定无法从项目现状中确定。', next: '收到你的决定后，我会从这里接着处理，不会从头重来。', completedChecks, totalChecks };
  if (step.status === 'failed' || tasks.some((task) => ['failed', 'blocked'].includes(task.status))) return { headline: '这一步遇到了问题', detail: latest?.summary || first?.error || step.summary || '当前做法没有得到预期结果。', next: '我会先查清原因，必要时请另一位专家协助，再让原专家继续。', completedChecks, totalChecks };
  if (step.status === 'completed') return { headline: tasks.length === 1 ? `${tasks[0].title}已经处理好了` : '这一组工作已经处理好了', detail: latest?.summary || step.summary || '结果已经记录并通过当前步骤的检查。', next: '我会根据这次结果继续判断下一步，直到所有完成条件都满足。', completedChecks, totalChecks };
  const action = first?.access === 'read' ? '核对' : '处理';
  const reason = humanReason(first?.decisionReason);
  return { headline: first ? `我正在${action}：${first.title}` : '我正在处理当前这一步', detail: reason ? `我选择先做这一步，是因为${reason}。` : step.summary || first?.instruction || '我正在按当前项目状态推进。', next: '完成后我会先验收结果，再决定下一步。', completedChecks, totalChecks };
}

export function activeProjectAgentPlan(session: ProjectAgentSessionV2) {
  return session.plans.find((item) => item.id === session.activePlanId) || session.plans[session.plans.length - 1];
}

function timelineTime(value?: string) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function buildProjectAgentTimeline(session: ProjectAgentSessionV2): ProjectAgentTimelineTurn[] {
  const messages = [...(session.messages || [])].sort((left, right) => timelineTime(left.createdAt) - timelineTime(right.createdAt));
  const userMessages = messages.filter((message) => message.role === 'user');
  const fallbackTurn = (at?: string) => {
    const timestamp = timelineTime(at); let found: ProjectAgentConversationMessage | undefined;
    for (const message of userMessages) if (timelineTime(message.createdAt) <= timestamp || !timestamp) found = message; else break;
    return found?.turnId || found?.id || 'legacy-turn';
  };
  const turnFor = (turnId: string | undefined, at?: string) => turnId || fallbackTurn(at);
  const entries: ProjectAgentTimelineEntry[] = [];
  const planTurns = new Set(session.plans.map((plan) => turnFor(plan.turnId, plan.createdAt)));
  const currentQuestionTurns = new Set((session.questions || []).map((question) => turnFor(question.turnId, question.createdAt)));
  for (const message of messages) {
    const turnId = turnFor(message.turnId, message.createdAt);
    if (message.kind === 'plan_summary' && planTurns.has(turnId)) continue;
    if (message.kind === 'question' && currentQuestionTurns.has(turnId)) continue;
    entries.push({ id: `message:${message.id}`, type: 'message', turnId, at: message.createdAt || '', message });
  }
  for (const plan of session.plans) entries.push({ id: `plan:${plan.id}`, type: 'planning', turnId: turnFor(plan.turnId, plan.createdAt), at: plan.createdAt || '', plan });
  const roundById = new Map((session.rounds || []).map((round) => [round.id, round]));
  const stepById = new Map((session.steps || []).map((step) => [step.id, step]));
  for (const step of session.steps || []) entries.push({ id: `action:${step.id}`, type: 'action', turnId: turnFor(step.turnId, step.startedAt), at: step.startedAt, step });
  for (const round of session.rounds || []) entries.push({ id: `round:${round.id}`, type: 'round', turnId: turnFor(round.turnId, round.startedAt), at: round.startedAt, round });
  const uniqueTasks = new Map<string, ProjectAgentTask>();
  for (const plan of session.plans) for (const task of plan.tasks) uniqueTasks.set(task.id, task);
  for (const task of uniqueTasks.values()) {
    const started = session.events.find((event) => event.type === 'task_started' && event.data?.taskId === task.id)?.createdAt;
    const round = task.roundId ? roundById.get(task.roundId) : undefined; const step = task.stepId ? stepById.get(task.stepId) : undefined;
    const plan = [...session.plans].reverse().find((item) => item.tasks.some((candidate) => candidate.id === task.id));
    const at = started || step?.startedAt || round?.startedAt || plan?.createdAt || '';
    entries.push({ id: `task:${task.id}`, type: 'task', turnId: turnFor(step?.turnId || round?.turnId || plan?.turnId, at), at, task, roundId: task.stepId || task.roundId });
  }
  if (session.questions?.length) {
    const first = session.questions[0]; const event = [...session.events].reverse().find((item) => item.type === 'question_requested'); const at = first.createdAt || event?.createdAt || '';
    entries.push({ id: `questions:${first.id}`, type: 'question', turnId: turnFor(first.turnId || event?.data?.turnId, at), at, questions: session.questions });
  }
  if (session.pendingApproval) {
    const event = [...session.events].reverse().find((item) => item.type === 'approval_required' && item.data?.approval?.id === session.pendingApproval?.id); const task = uniqueTasks.get(session.pendingApproval.taskId); const round = task?.roundId ? roundById.get(task.roundId) : undefined; const at = event?.createdAt || '';
    entries.push({ id: `approval:${session.pendingApproval.id}`, type: 'approval', turnId: turnFor(round?.turnId, at), at, taskId: session.pendingApproval.taskId, approval: session.pendingApproval });
  }
  const summaryTypes = new Set(['orchestration_stalled', 'orchestration_failed', 'loop_stalled', 'loop_failed', 'capability_gap_detected', 'recovery_exhausted']);
  for (const event of session.events.filter((item) => summaryTypes.has(item.type) || (item.type === 'turn_failed' && item.data?.stage === 'planning'))) entries.push({ id: `summary:${event.seq}`, type: 'summary', turnId: turnFor(event.data?.turnId, event.createdAt), at: event.createdAt, event });
  const priority: Record<ProjectAgentTimelineEntry['type'], number> = { message: 0, planning: 1, action: 2, round: 2, task: 3, question: 4, approval: 5, summary: 6 };
  entries.sort((left, right) => timelineTime(left.at) - timelineTime(right.at) || priority[left.type] - priority[right.type] || left.id.localeCompare(right.id));
  const turns = new Map<string, ProjectAgentTimelineTurn>();
  for (const entry of entries) {
    const existing = turns.get(entry.turnId); if (existing) existing.entries.push(entry);
    else turns.set(entry.turnId, { id: entry.turnId, startedAt: entry.at, entries: [entry] });
  }
  return [...turns.values()].sort((left, right) => timelineTime(left.startedAt) - timelineTime(right.startedAt));
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

export function groupProjectAgentHistoryByTime<T extends { pinnedAt?: string; updatedAt: string }>(items: T[], now = Date.now()) {
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0); const sevenDaysAgo = startToday.getTime() - 6 * 86_400_000;
  return {
    pinned: items.filter((item) => item.pinnedAt),
    today: items.filter((item) => !item.pinnedAt && new Date(item.updatedAt).getTime() >= startToday.getTime()),
    recent: items.filter((item) => { const time = new Date(item.updatedAt).getTime(); return !item.pinnedAt && time < startToday.getTime() && time >= sevenDaysAgo; }),
    earlier: items.filter((item) => !item.pinnedAt && new Date(item.updatedAt).getTime() < sevenDaysAgo),
  };
}

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
  return undefined;
}

function readableToolResult(event: ProjectAgentEvent) {
  const result = event.data?.result;
  return result?.__formflowTruncated && result.preview ? result.preview : result;
}

function toolBusinessFeedback(event: ProjectAgentEvent, running = false) {
  const toolName = String(event.data?.toolName || ''); const result = readableToolResult(event); const data = result?.data;
  const project = data?.project?.config || data?.project || data?.summary?.project; const projectName = typeof project?.name === 'string' ? project.name : undefined;
  const summary = data?.summary || data; const validation = data?.validation || (toolName.includes('validate') ? data : undefined);
  const counts = validation?.counts || data?.counts || {
    dataSources: Array.isArray(summary?.data) ? summary.data.length : undefined,
    forms: Array.isArray(summary?.forms) ? summary.forms.length : undefined,
    workflows: Array.isArray(summary?.workflows) ? summary.workflows.length : undefined,
    outputs: Array.isArray(summary?.outputs) ? summary.outputs.length : undefined,
  };
  const countParts = [
    Number.isFinite(counts?.dataSources) ? `${counts.dataSources} 张数据表` : '',
    Number.isFinite(counts?.forms) ? `${counts.forms} 个表单` : '',
    Number.isFinite(counts?.workflows) ? `${counts.workflows} 条流程` : '',
    Number.isFinite(counts?.outputs) ? `${counts.outputs} 个输出` : '',
  ].filter(Boolean);
  const exact: Record<string, [string, string]> = {
    'system.capabilities.get': ['确认可用工具与安全限制', `${Array.isArray(data?.roles) ? `${data.roles.length} 类专家能力` : '工具能力已就绪'}${Number.isFinite(data?.tools) ? `，当前角色可用 ${data.tools} 项工具` : ''}`],
    'catalog.templates.list': ['检查可用项目模板', Array.isArray(data) ? `找到 ${data.length} 个模板${data.length ? `：${data.slice(0, 3).map((item: any) => item?.name).filter(Boolean).join('、')}${data.length > 3 ? '等' : ''}` : ''}` : '模板目录已读取'],
    'project.list': ['检查现有项目', Array.isArray(data) ? `发现 ${data.length} 个可访问项目${data.length ? `：${data.slice(0, 3).map((item: any) => item?.name).filter(Boolean).join('、')}` : ''}` : '现有项目已检查'],
    'project.initialize': ['创建并初始化项目', [projectName ? `“${projectName}”` : '', countParts.join('、'), validation?.valid === true ? '结构校验通过' : ''].filter(Boolean).join(' · ')],
    'project.create': ['创建项目', projectName ? `已创建“${projectName}”` : '项目基础结构已建立'],
    'project.inspect': ['检查项目业务结构', [projectName ? `“${projectName}”` : '', countParts.join('、')].filter(Boolean).join(' · ')],
    'project.get': ['读取项目完整配置', [projectName ? `“${projectName}”` : '', countParts.join('、')].filter(Boolean).join(' · ')],
    'project.validate': [validation?.valid === false ? '项目校验未通过' : '项目校验通过', [countParts.join('、'), Array.isArray(validation?.errors) && validation.errors.length ? `${validation.errors.length} 个问题` : '结构、引用和业务语义均有效'].filter(Boolean).join(' · ')],
    'project.quality.inspect': ['检查项目质量', data?.valid === false ? `发现 ${data?.errors?.length || 1} 个质量问题` : '质量检查通过'],
    'release.preview': ['检查交付条件', data?.valid === false ? '仍有交付阻断项' : '交付预检通过，尚未发布'],
  };
  const operationLabels: Record<string, string> = { create: '创建', initialize: '初始化', import: '导入', update: '更新', upsert: '保存', delete: '删除', list: '检查', get: '读取', query: '查询', batch: '写入', validate: '验证', preview: '预览', generate: '生成', apply: '应用', inspect: '检查', export: '导出', run: '运行' };
  const domainLabels: Record<string, string> = { data_source: '数据表', data_sheet: '工作表', data_keys: '数据主键', data_rows: '业务数据', form: '表单', form_component: '表单控件', form_binding: '字段绑定', workflow: '业务流程', workflow_node: '流程节点', workflow_edge: '流程连线', behavior: '业务规则', rule_syntax: '规则语法', rule_test: '规则测试', rule_code: '规则代码', mock_data: 'Mock 数据', project_test: '项目测试', output: '输出配置', release: '交付条件', catalog: '资源目录', project: '项目' };
  const [domain, operation = ''] = toolName.split('.'); const fallbackTitle = `${operationLabels[operation] || '执行'}${domainLabels[domain] || '项目操作'}`;
  const [baseTitle, detail] = exact[toolName] || [fallbackTitle, '操作已完成'];
  return { title: running ? `正在${baseTitle}` : `已${baseTitle}`, detail: running ? undefined : detail || undefined };
}

function semanticActivity(event: ProjectAgentEvent): Omit<ProjectAgentActivityItem, 'id' | 'eventSeqs' | 'events' | 'technicalEvents'> | undefined {
  const exact: Record<string, [ProjectAgentActivityKind, ProjectAgentActivityStatus, string]> = {
    task_started: ['task', 'running', '开始执行任务'], task_completed: ['task', 'passed', '任务通过验收'], task_failed: ['error', 'failed', '任务执行失败'], task_paused: ['task', 'warning', '任务已安全暂停'],
    verification_started: ['verification', 'running', '开始验收'], verification_completed: ['verification', 'passed', '验收通过'], verification_failed: ['verification', 'failed', '验收未通过'],
    quality_gate_failed: ['quality', 'failed', '质量门禁未通过'], quality_gate_passed: ['quality', 'passed', '质量门禁通过'], quality_remediation_scheduled: ['quality', 'running', '已安排质量修复'], remediation_verification_started: ['quality', 'running', '开始修复复检'], remediation_verification_completed: ['quality', 'passed', '修复复检通过'], remediation_verification_failed: ['quality', 'failed', '修复复检未通过'],
    approval_required: ['approval', 'warning', '等待操作确认'], approval_decided: ['approval', event.data?.approved === false ? 'failed' : 'passed', event.data?.approved === false ? '操作已拒绝' : '操作已确认'], operation_blocked: ['approval', 'failed', '操作已阻止'],
    recovery_started: ['recovery', 'running', '开始自动恢复'], recovery_blocked: ['recovery', 'warning', '自动恢复等待处理'], recovery_exhausted: ['recovery', 'failed', '自动恢复次数已用尽'], strategy_changed: ['recovery', 'neutral', '已切换修复策略'], task_graph_revised: ['recovery', 'passed', '任务计划已调整'],
    tool_preflight_failed: ['tool', 'warning', '执行参数需要调整'], tool_rejected: ['tool', 'warning', '当前操作需要调整'], tool_failure_repeated: ['recovery', 'warning', '相同方法再次失败，专家正在更换策略'],
    task_investigating: ['recovery', 'running', '正在核对当前操作'], task_correction_requested: ['recovery', 'warning', '已调整处理方式'], decision_correction_requested: ['recovery', 'running', '正在修正下一步行动'], task_reconciled: ['recovery', 'passed', '已撤回未开始的无效行动'],
    expert_diagnosis_started: ['recovery', 'running', '操作未完成，专家正在分析原因'], expert_repair_started: ['recovery', 'running', '验收未通过，当前专家正在调整方案'], expert_repair_completed: ['recovery', 'passed', '专家已修正问题并通过验收'],
    expert_assistance_requested: ['recovery', 'warning', '当前专家需要其他专家协助'], expert_assistance_assigned: ['recovery', 'running', '已安排协助专家解决阻断'], expert_assistance_started: ['recovery', 'running', '协助专家正在解决阻断'], expert_assistance_completed: ['recovery', 'passed', '协助专家已解决阻断'], expert_assistance_failed: ['recovery', 'warning', '本次协助未解决阻断，正在重新分工'], task_resumed: ['recovery', 'running', '原专家从卡住的位置继续'], expert_resumed_after_assistance: ['recovery', 'running', '原专家正在基于协助结果继续'], expert_resumed_completed: ['recovery', 'passed', '原专家已完成后续工作'],
    tool_parameter_correction_requested: ['recovery', 'running', event.data?.repeated ? '参数仍不符合要求，专家正在重新读取契约' : '参数需要调整，专家正在纠正'], tool_parameter_correction_completed: ['tool', 'passed', '参数已纠正，操作继续执行'],
    revision_recompute_completed: ['recovery', 'passed', '已读取最新状态，继续执行'], revision_recompute_blocked: ['recovery', 'warning', '项目持续被修改，已安全暂停'], approval_invalidated: ['approval', 'warning', '项目已变化，原操作确认已失效'],
    project_state_check_started: ['verification', 'running', '提问前正在核对项目现状'], project_state_check_completed: ['verification', 'passed', '已核对项目现状'],
    question_reconsideration_started: ['verification', 'running', '正在判断是否仍需询问'], question_reconsideration_completed: ['verification', event.data?.avoidedQuestion ? 'passed' : 'warning', event.data?.avoidedQuestion ? '已从项目状态获得所需信息，继续执行' : '仍需要你作出业务决定'],
    requirement_verified: ['verification', 'passed', '需求场景已验证'], capability_gap_detected: ['verification', 'failed', '发现能力或验收缺口'], semantic_gate_failed: ['quality', 'failed', '项目语义门禁未通过'],
  };
  if (event.type === 'revision_recompute_started') return { kind: 'recovery', status: 'running', title: '检测到项目刚刚更新，正在重新核对当前操作', createdAt: event.createdAt };
  if (event.type === 'tool_rejected' && event.data?.reason === 'revision_read_required') return { kind: 'recovery', status: 'running', title: '正在重新读取目标资源', createdAt: event.createdAt };
  const mapped = exact[event.type];
  if (mapped) return { kind: mapped[0], status: mapped[1], title: mapped[2], detail: eventDetail(event), createdAt: event.createdAt };
  if (event.type === 'tool_started') { const copy = toolBusinessFeedback(event, true); return { kind: 'tool', status: 'running', title: copy.title, detail: copy.detail, createdAt: event.createdAt }; }
  if (event.type === 'tool_completed') {
    if (readableToolResult(event)?.status === 'confirmation_required') return undefined;
    if (event.data?.recoveringRevision) return { kind: 'recovery', status: 'warning', title: '检测到项目更新，正在重新核对', createdAt: event.createdAt };
    if (event.data?.expertInvestigating) return { kind: 'recovery', status: 'warning', title: '操作未完成，专家正在查找原因', detail: event.data?.result?.error?.message, createdAt: event.createdAt };
    const failed = event.data?.result?.ok === false;
    const copy = toolBusinessFeedback(event);
    return { kind: 'tool', status: failed ? 'failed' : 'passed', title: failed ? `未完成：${copy.title.replace(/^已/, '')}` : copy.title, detail: eventDetail(event) || copy.detail, createdAt: event.createdAt };
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
      const running = [...activities].reverse().find((item) => item.kind === 'tool' && item.status === 'running');
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
    turn_started: '请求已提交', grounding_started: '开始检查项目', grounding_completed: '项目检查完成', planning_attempt_started: '正在请求模型完善目标契约', planning_attempt_failed: '目标契约格式未通过，正在修正', plan_proposed: '目标契约已生成',
    task_started: '任务开始', task_completed: '任务完成', task_failed: '任务失败', tool_started: '调用工具', tool_completed: '工具完成',
    tool_arguments_normalized: '工具参数已安全规范化', tool_preflight_failed: '工具参数预检未通过', tool_failure_repeated: '相同工具错误已停止重试', data_verification_completed: '数据源与主键验收通过',
    verification_started: '开始验收', verification_completed: '验收通过', verification_failed: '验收失败', approval_required: '等待操作确认',
    tool_rejected: '不安全或越界工具调用已拒绝，正在纠正', behavior_verification_completed: '行为规则写入后复检通过',
    failure_classified: '失败已分类', recovery_started: '开始自动恢复', task_graph_patch_proposed: '生成任务图补丁', task_graph_revised: '任务图已动态修订',
    task_blocked: '任务被依赖阻断', task_unblocked: '任务阻断已解除', strategy_rejected: '重复失败策略已拒绝', strategy_changed: '已切换执行策略', recovery_blocked: '自动恢复需要用户处理', recovery_exhausted: '自动恢复预算已耗尽',
    quality_gate_failed: '质量门禁未通过', quality_gate_passed: '质量门禁通过', remediation_verification_completed: '修复复检通过',
    requirements_analysis_started: '大模型开始理解整体需求', requirements_analysis_attempt_started: '正在生成结构化需求契约', requirements_analysis_completed: '需求契约已生成', requirements_analysis_questions_requested: '需求分析需要补充决策', requirements_analysis_attempt_failed: '需求契约格式未通过，正在修正', requirement_verified: '需求场景获得证据', capability_gap_detected: '发现未解决的能力或验收缺口', semantic_gate_failed: '项目语义门禁未通过', coverage_updated: '需求证据覆盖已更新',
    decision_started: '正在判断下一步', action_selected: '已选择下一项行动', action_started: '开始处理当前行动', observation_recorded: '已获得新的执行反馈', action_completed: '当前行动已完成', orchestration_stalled: '连续两次行动没有取得进展', orchestration_completed: '目标已完成', orchestration_failed: '执行已停止',
    project_state_check_started: '提问前核对项目现状', project_state_check_completed: '项目现状核对完成', question_reconsideration_started: '重新判断是否需要询问', question_reconsideration_completed: '提问必要性复核完成',
    loop_started: '开始处理目标', round_planning_started: '正在判断下一步', round_planned: '已选择下一项行动', expert_selected: '已安排领域专家', expert_skipped: '无需处理', round_completed: '当前行动已完成', loop_stalled: '连续两次行动没有取得进展', loop_completed: '目标已完成', loop_failed: '执行已停止',
  };
  const toolName = event.data?.toolName || event.data?.tool_name;
  return toolName ? `${labels[event.type] || event.type} · ${toolName}` : labels[event.type] || event.type;
}
