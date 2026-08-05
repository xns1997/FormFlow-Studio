import React from 'react';
import { modeLabelsShort, planProgress, statusLabelsShort, statusSymbols, type ProjectAgentThread } from './projectAgentUiModel';

export default function WorkbenchStatusBar({
  thread, busy, onControl, onInterrupt, onRestoreCheckpoint, hasCheckpoints,
}: {
  thread: ProjectAgentThread | null;
  busy?: boolean;
  onControl: (action: 'pause' | 'continue' | 'stop' | 'retry') => void;
  onInterrupt: () => void;
  onRestoreCheckpoint?: () => void;
  hasCheckpoints?: boolean;
}) {
  if (!thread) return null;
  const progress = planProgress(thread);
  const running = ['planning', 'executing'].includes(thread.status);
  const label = statusLabelsShort[thread.status];
  const symbol = statusSymbols[thread.status];
  const detail = thread.plan?.tasks.find((task) => task.status === 'running')?.title
    || (thread.blockedCount ? `×${thread.blockedCount}` : thread.consecutiveNoProgress ? `无进展 ×${thread.consecutiveNoProgress}` : thread.plan?.goal || '');
  const metrics = thread.turnMetrics;
  const metricsText = metrics
    ? `模型 ${metrics.modelCalls} · 工具 ${metrics.toolCalls}${metrics.retries ? ` · 重试 ${metrics.retries}` : ''}${metrics.compactions ? ` · 压缩 ${metrics.compactions}` : ''}${metrics.pauses ? ` · 暂停 ${metrics.pauses}` : ''}`
    : '';
  return (
    <section className="agent-statusbar" aria-label="会话状态">
      {thread.mode && <span className={`agent-badge ${thread.mode === 'goal' ? 'agent-badge-accent' : 'agent-badge-muted'}`}>{modeLabelsShort[thread.mode]}</span>}
      <span className={`agent-badge ${thread.status === 'blocked' || thread.status === 'failed' ? 'agent-badge-danger' : thread.status === 'awaiting_operation_approval' || thread.status === 'awaiting_plan_approval' || thread.status === 'paused' ? 'agent-badge-warning' : thread.status === 'completed' ? 'agent-badge-success' : 'agent-badge-accent'}`} title={label} aria-label={label}>{symbol}</span>
      <span className="agent-status-copy"><strong>{detail || '等待你描述目标'}</strong><small>{progress.total ? `${progress.passed}/${progress.total} 步` : '无计划'}{metricsText ? ` · ${metricsText}` : ''}</small></span>
      {progress.total > 0 && <div className="agent-progress" style={{ width: 96, flex: '0 0 auto' }} aria-label={`任务完成度 ${progress.percent}%`}><span style={{ width: `${progress.percent}%` }} /></div>}
      <span className="agent-status-actions">
        {thread.status === 'executing' && <button type="button" className="agent-btn agent-icon-btn" title="暂停" aria-label="暂停" disabled={busy} onClick={() => onControl('pause')}>⏸</button>}
        {thread.status === 'executing' && <button type="button" className="agent-btn agent-icon-btn" title="打断" aria-label="打断" disabled={busy} onClick={onInterrupt}>✋</button>}
        {['paused', 'stopped'].includes(thread.status) && <button type="button" className="agent-btn agent-icon-btn" title="继续" aria-label="继续" disabled={busy} onClick={() => onControl('continue')}>▶</button>}
        {thread.status === 'blocked' && <button type="button" className="agent-btn agent-icon-btn" title="重试" aria-label="重试" disabled={busy} onClick={() => onControl('retry')}>↻</button>}
        {hasCheckpoints && ['paused', 'stopped', 'blocked', 'failed'].includes(thread.status) && <button type="button" className="agent-btn agent-icon-btn" title="恢复检查点" aria-label="恢复检查点" disabled={busy} onClick={onRestoreCheckpoint}>↩</button>}
        {running && <button type="button" className="agent-btn agent-btn-danger agent-icon-btn" title="停止" aria-label="停止" disabled={busy} onClick={() => onControl('stop')}>⏹</button>}
      </span>
    </section>
  );
}
