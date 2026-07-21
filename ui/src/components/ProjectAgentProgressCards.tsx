import React, { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import MarkdownContent from './MarkdownContent';
import {
  activeProjectAgentPlan, buildProjectAgentActivity, buildProjectAgentTaskLineages, buildQualityRepairChain, chooseCurrentTaskId,
  dependencySummary, groupProjectAgentTaskLineages, lineageForTask, roleLabels, taskStatus, taskStatusLabels,
  type ProjectAgentActivityItem, type ProjectAgentPhase, type ProjectAgentPlan, type ProjectAgentSessionV2,
  type ProjectAgentTask, type ProjectAgentTaskLineage,
} from './projectAgentUiModel';

export type { ProjectAgentConnectionState, ProjectAgentEvent, ProjectAgentPhase, ProjectAgentPlan, ProjectAgentQuestion, ProjectAgentRole, ProjectAgentSessionV2, ProjectAgentTask } from './projectAgentUiModel';

function short(value?: string) { return value ? value.slice(0, 12) : '—'; }
function eventTime(value?: string) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''; }
function activityGlyph(status: ProjectAgentActivityItem['status']) { return status === 'passed' ? '✓' : status === 'failed' ? '!' : status === 'running' ? '↻' : status === 'warning' ? '‖' : '•'; }
function activityStatusLabel(status: ProjectAgentActivityItem['status']) { return status === 'passed' ? '完成' : status === 'failed' ? '失败' : status === 'running' ? '进行中' : status === 'warning' ? '需处理' : '记录'; }

function TaskListItem({ lineage, active, onSelect }: { lineage: ProjectAgentTaskLineage; active?: boolean; onSelect(): void }) {
  const task = lineage.representative; const status = taskStatus(task.status);
  return <button type="button" data-task-lineage={lineage.id} className={`project-agent-task-list-item ${status} ${active ? 'active' : ''}`} onClick={onSelect} aria-current={active ? 'true' : undefined}>
    <span className={`project-agent-task-state-icon ${status}`} aria-hidden="true">{status === 'passed' ? '✓' : status === 'failed' ? '!' : status === 'running' ? '↻' : status === 'paused' ? '‖' : status === 'blocked' ? '!' : '·'}</span>
    <span className="project-agent-task-list-copy"><strong>{task.title || roleLabels[task.role]}</strong><small>{roleLabels[task.role]} · {task.access === 'read' ? '只读' : '写入'}{lineage.tasks.length > 1 ? ` · ${lineage.tasks.length} 代任务` : lineage.totalAttempts > 0 ? ` · 尝试 ${lineage.totalAttempts}/${task.maxAttempts}` : ''}</small></span>
    <span className={`project-agent-card-status ${status}`}>{taskStatusLabels[status]}</span>
  </button>;
}

function RequirementCoverageCard({ session, plan, onSelectTask }: { session: ProjectAgentSessionV2; plan?: ProjectAgentPlan; onSelectTask?(taskId: string): void }) {
  const requirements = session.requirements || []; const coverage = session.requirementCoverage;
  if (!requirements.length) return null;
  const labels: Record<string, string> = { supported: '待验证', verified: '已验证', failed: '失败', capability_gap: '能力缺口', needs_user_input: '待决策' };
  return <details className="project-agent-requirement-coverage" open={session.phase === 'awaiting_plan_approval' || session.phase === 'failed'}>
    <summary><span><strong>需求覆盖</strong><small>{coverage ? `${coverage.verified}/${coverage.total} 项已验证` : `${requirements.length} 项需求`}</small></span><b>{coverage?.complete ? '完整' : '需处理'}</b></summary>
    <div className="project-agent-requirement-grid">{requirements.map((requirement) => {
      const tasks = (plan?.tasks || []).filter((task) => (task.requirementIds || requirement.taskIds || []).includes(requirement.id));
      return <article key={requirement.id} className={requirement.capabilityStatus}><header><span>{roleLabels[requirement.domain]}</span><b>{labels[requirement.capabilityStatus]}</b></header><p>{requirement.statement}</p><footer><small>{tasks.length} 个任务 · {requirement.evidenceArtifactIds?.length || 0} 份证据</small>{tasks[0] && <button type="button" onClick={() => onSelectTask?.(tasks[0].id)}>查看任务</button>}</footer></article>;
    })}</div>
  </details>;
}

function ActivityRow({ item }: { item: ProjectAgentActivityItem }) {
  const raw = [...item.events, ...item.technicalEvents].sort((left, right) => left.seq - right.seq);
  return <li className={item.status}>
    <span className="project-agent-activity-glyph" aria-hidden="true">{activityGlyph(item.status)}</span>
    <div className="project-agent-activity-copy"><div><strong>{item.title}</strong><span className={`project-agent-activity-state ${item.status}`}>{activityStatusLabel(item.status)}</span></div>{item.detail && <p>{item.detail}</p>}<small>{eventTime(item.createdAt)}{item.eventSeqs.length ? ` · 事件 #${item.eventSeqs.join('、#')}` : ''}</small>
      {raw.length > 0 && <details className="project-agent-technical-details"><summary>技术详情</summary><pre>{JSON.stringify(raw.map((event) => ({ seq: event.seq, type: event.type, createdAt: event.createdAt, data: event.data })), null, 2)}</pre></details>}
    </div>
  </li>;
}

function TaskActivity({ activities }: { activities: ProjectAgentActivityItem[] }) {
  if (!activities.length) return <p className="project-agent-muted">任务开始后，这里会显示工具、验收和错误进展。</p>;
  const semantic = activities.filter((item) => !item.hiddenFromSummary);
  const recentIds = new Set(semantic.slice(-3).map((item) => item.id));
  for (const item of semantic) if (item.status === 'failed' || item.status === 'warning') recentIds.add(item.id);
  const visible = semantic.filter((item) => recentIds.has(item.id)); const earlier = semantic.filter((item) => !recentIds.has(item.id));
  return <div className="project-agent-activity">
    {earlier.length > 0 && <details className="project-agent-earlier-activity"><summary>查看更早的 {earlier.length} 项活动</summary><ol>{earlier.map((item) => <ActivityRow key={item.id} item={item} />)}</ol></details>}
    <ol aria-label="最近执行活动">{visible.map((item) => <ActivityRow key={item.id} item={item} />)}</ol>
  </div>;
}

function TaskHistory({ session, plan, lineage }: { session: ProjectAgentSessionV2; plan: ProjectAgentPlan; lineage: ProjectAgentTaskLineage }) {
  const repairChain = buildQualityRepairChain(session, lineage.representative);
  return <details className="project-agent-task-disclosure" open={lineage.tasks.some((task) => ['failed', 'blocked'].includes(task.status))}>
    <summary><span><strong>任务与修复历史</strong><small>{lineage.tasks.length > 1 ? `${lineage.tasks.length} 代任务 · 累计 ${lineage.totalAttempts} 次尝试` : dependencySummary(lineage.representative, plan.tasks)}</small></span><i aria-hidden="true">›</i></summary>
    <div className="project-agent-task-history">
      {lineage.tasks.map((task, index) => { const status = taskStatus(task.status); return <article key={task.id}><span className={`project-agent-task-state-icon ${status}`}>{status === 'passed' ? '✓' : status === 'failed' ? '!' : index + 1}</span><div><strong>{task.title || roleLabels[task.role]}</strong><small>{taskStatusLabels[status]} · 尝试 {task.attempt}/{task.maxAttempts}{task.origin && task.origin !== 'planned' ? ` · ${task.origin} 第 ${task.generation || index + 1} 代` : ''}{task.failureClass ? ` · ${task.failureClass}` : ''} · revision {short(task.startRevision)} → {short(task.endRevision)}</small>{task.error && <p>{task.error}</p>}</div></article>; })}
      {repairChain.length > 0 && <div className="project-agent-quality-chain" aria-label="质量修复阶段">{repairChain.map((step, index) => <div key={step.key} className={step.state}><span>{step.state === 'passed' ? '✓' : index + 1}</span><div><strong>{step.label}</strong>{step.detail && <small>{step.detail}</small>}</div></div>)}</div>}
    </div>
  </details>;
}

function TaskDetail({ session, plan, lineage, busy, manualOperationApproval, onBack, onConfirmOperation, onControl }: {
  session: ProjectAgentSessionV2; plan: ProjectAgentPlan; lineage?: ProjectAgentTaskLineage; busy: boolean; manualOperationApproval: boolean; onBack(): void;
  onConfirmOperation(id: string, approved: boolean): void; onControl(action: 'pause' | 'continue' | 'stop' | 'retry' | 'repair'): void;
}) {
  if (!lineage) return <div className="project-agent-task-empty"><strong>暂无任务</strong><p>计划确认后，任务会按依赖关系显示在这里。</p></div>;
  const task = lineage.representative; const status = taskStatus(task.status);
  const activities = buildProjectAgentActivity(session.events, lineage.taskIds);
  const artifacts = session.artifacts.filter((artifact) => lineage.taskIds.includes(artifact.taskId || '') || lineage.tasks.some((item) => item.evidenceArtifactIds.includes(artifact.id)));
  const taskQualityFailure = [...session.events].reverse().find((event) => event.type === 'quality_gate_failed' && lineage.taskIds.includes(event.data?.taskId));
  const qualityDiagnostics = Array.isArray(taskQualityFailure?.data?.diagnostics) ? taskQualityFailure.data.diagnostics : [];
  const approval = session.pendingApproval && lineage.taskIds.includes(session.pendingApproval.taskId) ? session.pendingApproval : undefined;
  const resultSummary = status === 'passed' ? `任务已完成并通过验收${artifacts.length ? `，生成 ${artifacts.length} 项证据` : ''}。`
    : status === 'running' ? '专家正在执行，活动将在安全工具边界持续更新。'
      : status === 'paused' ? '任务已在安全工具边界暂停，可以继续执行。'
        : status === 'blocked' ? '任务正在等待前置依赖或用户处理。' : undefined;
  return <article className="project-agent-task-detail-card">
    <header className="project-agent-task-detail-header">
      <button type="button" className="project-agent-task-back" onClick={onBack} aria-label="返回任务列表">‹ <span>任务</span></button>
      <div><span className={`project-agent-task-state-icon ${status}`} aria-hidden="true">{status === 'passed' ? '✓' : status === 'failed' ? '!' : status === 'running' ? '↻' : '·'}</span><div><strong>{task.title || roleLabels[task.role]}</strong><small>{roleLabels[task.role]} · {task.access === 'read' ? '只读访问' : '独占写入'}{task.projectId ? ` · ${task.projectId}` : ''}</small></div></div>
      <span className={`project-agent-card-status ${status}`}>{taskStatusLabels[status]}</span>
    </header>
    {task.error && <section className="project-agent-task-error" role="alert"><strong>需要处理</strong><p>{task.error}</p></section>}
    {resultSummary && <section className={`project-agent-task-result ${status}`}><h4>执行结果</h4><p>{resultSummary}</p>{task.endRevision && <small>交接 revision {short(task.endRevision)}</small>}</section>}
    {task.acceptance?.length > 0 && <section className="project-agent-task-detail-section"><h4>验收情况</h4><ul className="project-agent-check-list">{task.acceptance.map((item, index) => <li key={index} className={index < task.evidenceArtifactIds.length ? 'passed' : ''}><i>{index < task.evidenceArtifactIds.length ? '✓' : '○'}</i><span>{item}</span></li>)}</ul></section>}
    {qualityDiagnostics.length > 0 && <section className="project-agent-task-detail-section"><h4>质量诊断</h4><div className="project-agent-quality-diagnostics">{qualityDiagnostics.map((item: any, index: number) => <p key={`${item.code || 'quality'}-${item.path || index}`}><strong>{item.code || 'QUALITY'}</strong><span>{item.path || 'project'}：{item.message || '质量检查未通过'}</span></p>)}</div></section>}
    {approval && manualOperationApproval && <section className="project-agent-operation-approval" role="alert"><div><strong>{approval.confirmation.summary || approval.toolName}</strong><p>计划确认不替代本次破坏性操作确认。</p></div><details><summary>查看影响范围</summary><pre>{JSON.stringify(approval.confirmation.impact, null, 2)}</pre></details><div className="project-agent-card-actions"><button type="button" className="secondary" disabled={busy} onClick={() => onConfirmOperation(approval.id, false)}>拒绝</button><button type="button" className="danger" disabled={busy} onClick={() => onConfirmOperation(approval.id, true)}>确认执行</button></div></section>}
    <section className="project-agent-task-detail-section project-agent-activity-section"><h4>活动</h4><TaskActivity activities={activities} /></section>
    <TaskHistory session={session} plan={plan} lineage={lineage} />
    <details className="project-agent-task-disclosure"><summary><span><strong>任务说明</strong><small>{dependencySummary(task, plan.tasks)} · revision {short(task.startRevision)} → {short(task.endRevision)}</small></span><i aria-hidden="true">›</i></summary><div className="project-agent-disclosure-content"><MarkdownContent content={task.instruction || '暂无说明'} /></div></details>
    {task.output && <details className="project-agent-task-disclosure"><summary><span><strong>专家输出</strong><small>查看完整执行报告</small></span><i aria-hidden="true">›</i></summary><div className="project-agent-disclosure-content"><MarkdownContent content={task.output} /></div></details>}
    {artifacts.length > 0 && <details className="project-agent-task-disclosure"><summary><span><strong>验收产物</strong><small>{artifacts.length} 项证据</small></span><i aria-hidden="true">›</i></summary><div className="project-agent-artifact-list">{artifacts.map((artifact) => <details key={artifact.id}><summary>{artifact.title}</summary><pre>{typeof artifact.data === 'string' ? artifact.data : JSON.stringify(artifact.data, null, 2)}</pre></details>)}</div></details>}
    {task.status === 'failed' && <div className="project-agent-card-actions"><button type="button" disabled={busy} onClick={() => onControl(taskQualityFailure || task.role === 'quality' ? 'repair' : 'retry')}>{taskQualityFailure || task.role === 'quality' ? '开始新一轮修复' : '重试此任务'}</button></div>}
  </article>;
}

export default function ProjectAgentProgressCards({ session, busy, selectedTaskId, onSelectTask, onConfirmPlan, onConfirmOperation, manualOperationApproval = true, onControl, onRetryPlanning }: {
  session: ProjectAgentSessionV2; busy: boolean; selectedTaskId?: string; onSelectTask?(taskId: string): void; onConfirmPlan(planId: string): void; onConfirmOperation(approvalId: string, approved: boolean): void;
  manualOperationApproval?: boolean; onControl(action: 'pause' | 'continue' | 'stop' | 'retry' | 'repair'): void; onRetryPlanning(): void; onClear?: () => void;
}) {
  const plan = activeProjectAgentPlan(session); const tasks = plan?.tasks || [];
  const lineages = useMemo(() => buildProjectAgentTaskLineages(tasks), [tasks]);
  const automaticTaskId = chooseCurrentTaskId(session); const requestedTaskId = selectedTaskId && tasks.some((task) => task.id === selectedTaskId) ? selectedTaskId : automaticTaskId;
  const currentLineage = lineageForTask(lineages, requestedTaskId) || lineages[0]; const groups = groupProjectAgentTaskLineages(lineages, currentLineage?.id);
  const [mobilePane, setMobilePane] = useState<'list' | 'detail'>('detail');
  const failedPhaseEvent = session.phase === 'failed' ? [...session.events].reverse().find((event) => event.type === 'phase_changed') : undefined;
  const planningFailure = failedPhaseEvent?.data?.stage === 'planning' ? [...session.events].reverse().find((event) => event.type === 'turn_failed' && event.data?.stage === 'planning' && event.seq <= failedPhaseEvent.seq) : undefined;
  const latestQualityFailure = !planningFailure ? [...session.events].reverse().find((event) => event.type === 'quality_gate_failed') : undefined;
  const qualityFailure = latestQualityFailure && tasks.some((task) => task.id === latestQualityFailure.data?.taskId && ['failed', 'blocked'].includes(task.status)) ? latestQualityFailure : undefined;
  const failedTurnStart = planningFailure ? [...session.events].reverse().find((event) => event.type === 'turn_started' && event.seq < planningFailure.seq)?.seq || 0 : 0;
  const failedAttempts = planningFailure ? session.events.filter((event) => event.type === 'planning_attempt_failed' && event.seq > failedTurnStart && event.seq <= planningFailure.seq).length : 0;
  const select = (id: string) => { onSelectTask?.(id); setMobilePane('detail'); };
  const groupDefinitions = [
    { key: 'running', label: '进行中', tasks: groups.running, open: true }, { key: 'attention', label: '需要处理', tasks: groups.attention, open: true },
    { key: 'pending', label: '待执行', tasks: groups.pending, open: true }, { key: 'completed', label: '已完成', tasks: groups.completed, open: false },
  ] as const;
  function handleListKeys(event: ReactKeyboardEvent<HTMLElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-task-lineage]')]; if (!items.length) return;
    event.preventDefault(); const current = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? Math.min(items.length - 1, current + 1) : Math.max(0, current - 1); items[next].focus();
  }
  return <section className={`project-agent-task-workbench mobile-${mobilePane}`} aria-label="项目智能体任务工作台">
    {session.phase === 'recovering' && session.recovery && <article className="project-agent-recovery-banner" role="status"><div><strong>正在调整执行策略</strong><p>系统会在安全工具边界修改任务计划并重新验收。</p></div><div><b>{session.recovery.cycles}/{session.recovery.maxCycles}</b><small>恢复周期</small></div><div><b>{session.recovery.dynamicTasks}</b><small>修复任务</small></div></article>}
    <RequirementCoverageCard session={session} plan={plan} onSelectTask={select} />
    {planningFailure && <article className="project-agent-inline-alert failed" role="alert"><div><strong>任务计划生成失败</strong><p>模型内容无法通过结构校验{failedAttempts ? `，已自动尝试 ${failedAttempts} 次` : ''}。项目没有被修改。</p><details><summary>技术详情</summary><p>{String(planningFailure.data?.error || '规划请求失败')}</p></details></div><button type="button" disabled={busy} onClick={onRetryPlanning}>{busy ? '正在重试…' : '再次尝试'}</button></article>}
    {qualityFailure && session.phase === 'failed' && <article className="project-agent-inline-alert failed" role="alert"><div><strong>质量门禁未通过</strong><p>后续交付已暂停，可以继续诊断、修复并复检。</p></div><button type="button" disabled={busy} onClick={() => onControl('repair')}>开始新一轮修复</button></article>}
    {plan?.status === 'pending' && <article className="project-agent-plan-confirm-card"><header><div><strong>计划 v{plan.revision} · {plan.goal}</strong><small>{plan.summary}</small></div><span>待确认</span></header><div className="project-agent-plan-columns"><div><h4>成功标准</h4>{plan.successCriteria.map((item, index) => <p key={index}>{item}</p>)}</div><div><h4>假设与风险</h4>{plan.assumptions.map((item, index) => <p key={`a-${index}`}>假设：{item}</p>)}{plan.risks.map((item, index) => <p key={`r-${index}`}>风险：{item}</p>)}</div></div><button type="button" disabled={busy} onClick={() => onConfirmPlan(plan.id)}>确认计划并执行</button></article>}
    <div className="project-agent-task-layout">
      <nav className="project-agent-task-list" aria-label="任务列表" onKeyDown={handleListKeys}>
        <div className="project-agent-task-list-heading"><strong>任务</strong><span>{lineages.length}{lineages.length !== tasks.length ? ` · 已合并 ${tasks.length - lineages.length}` : ''}</span></div>
        {groupDefinitions.map((group) => group.tasks.length > 0 && <details key={group.key} className="project-agent-task-group" open={group.open}><summary><span>{group.label}</span><b>{group.tasks.length}</b></summary>{group.tasks.map((lineage) => <TaskListItem key={lineage.id} lineage={lineage} active={lineage.id === currentLineage?.id} onSelect={() => select(lineage.representative.id)} />)}</details>)}
        {!tasks.length && <div className="project-agent-task-empty"><p>完成项目检查和计划确认后，这里会出现任务。</p></div>}
      </nav>
      <div className="project-agent-task-detail"><TaskDetail session={session} plan={plan || { id: '', revision: 0, goal: '', summary: '', successCriteria: [], assumptions: [], risks: [], tasks: [], status: 'pending' }} lineage={currentLineage} busy={busy} manualOperationApproval={manualOperationApproval} onBack={() => setMobilePane('list')} onConfirmOperation={onConfirmOperation} onControl={onControl} /></div>
    </div>
  </section>;
}
