import React from 'react';
import { modeLabels, planProgress, statusLabels, type ProjectAgentThread } from './projectAgentUiModel';

export default function WorkbenchStatusBar({
  thread, busy, onControl, onInterrupt,
}: {
  thread: ProjectAgentThread | null;
  busy?: boolean;
  onControl: (action: 'pause' | 'continue' | 'stop' | 'retry') => void;
  onInterrupt: () => void;
}) {
  if (!thread) return null;
  const progress = planProgress(thread);
  const running = ['planning', 'executing'].includes(thread.status);
  const label = thread.status === 'planning' ? '正在生成目标契约'
    : thread.status === 'executing' ? (thread.plan?.tasks.some((task) => task.status === 'running') ? '正在执行任务' : '正在判断下一步')
      : thread.status === 'awaiting_operation_approval' ? '等待操作确认'
        : thread.status === 'awaiting_plan_approval' ? '等待确认计划'
          : thread.status === 'blocked' ? '执行受阻'
            : statusLabels[thread.status];
  const detail = thread.plan?.tasks.find((task) => task.status === 'running')?.title
    || (thread.blockedCount ? `同一阻塞条件出现 ${thread.blockedCount} 次` : thread.consecutiveNoProgress ? `连续 ${thread.consecutiveNoProgress} 步无进展` : thread.plan?.goal || '');
  return (
    <section className="agent-statusbar" aria-label="会话状态">
      {thread.mode && <span className={`agent-badge ${thread.mode === 'goal' ? 'agent-badge-accent' : 'agent-badge-muted'}`}>{modeLabels[thread.mode]}</span>}
      <span className={`agent-badge ${thread.status === 'blocked' || thread.status === 'failed' ? 'agent-badge-danger' : thread.status === 'awaiting_operation_approval' || thread.status === 'awaiting_plan_approval' || thread.status === 'paused' ? 'agent-badge-warning' : thread.status === 'completed' ? 'agent-badge-success' : 'agent-badge-accent'}`}>{label}</span>
      <span className="agent-status-copy"><strong>{detail || '等待你描述目标'}</strong><small>{progress.total ? `${progress.passed}/${progress.total} 项任务完成` : '尚未生成计划'}</small></span>
      {progress.total > 0 && <div className="agent-progress" style={{ width: 96, flex: '0 0 auto' }} aria-label={`任务完成度 ${progress.percent}%`}><span style={{ width: `${progress.percent}%` }} /></div>}
      <span className="agent-status-actions">
        {thread.status === 'executing' && <button type="button" className="agent-btn" disabled={busy} onClick={() => onControl('pause')}>暂停</button>}
        {thread.status === 'executing' && <button type="button" className="agent-btn" disabled={busy} onClick={onInterrupt}>打断</button>}
        {['paused', 'stopped'].includes(thread.status) && <button type="button" className="agent-btn" disabled={busy} onClick={() => onControl('continue')}>继续</button>}
        {thread.status === 'blocked' && <button type="button" className="agent-btn" disabled={busy} onClick={() => onControl('retry')}>重试</button>}
        {running && <button type="button" className="agent-btn agent-btn-danger" disabled={busy} onClick={() => onControl('stop')}>停止</button>}
      </span>
    </section>
  );
}
