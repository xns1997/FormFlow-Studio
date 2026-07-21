import React from 'react';
import { projectAgentActivityState, type ProjectAgentConnectionState, type ProjectAgentSessionV2 } from './projectAgentUiModel';

function duration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60); const rest = seconds % 60;
  return minutes ? `${minutes}分${String(rest).padStart(2, '0')}秒` : `${rest}秒`;
}

export default function ProjectAgentActivityNotice({ session, connection, now, onRefresh }: {
  session: ProjectAgentSessionV2 | null; connection: ProjectAgentConnectionState; now: number; onRefresh(): void;
}) {
  const activity = projectAgentActivityState(session, now);
  if (!activity.active) return null;
  const elapsed = activity.startedAt ? duration(now - activity.startedAt) : '刚刚开始';
  const sinceEvent = activity.lastEventAt ? duration(now - activity.lastEventAt) : '等待首个事件';
  const disconnected = connection === 'disconnected' || connection === 'reconnecting';
  return <section className={`project-agent-activity-notice ${activity.stale ? 'stale' : ''}`} role="status" aria-live="polite">
    <span className="project-agent-activity-spinner" aria-hidden="true"><i /></span>
    <div className="project-agent-activity-copy"><strong>{activity.label}</strong><span>{activity.detail}</span><small>已运行 {elapsed} · 最近事件 {sinceEvent}前{disconnected ? ' · 实时连接恢复后会补播进度' : ''}</small></div>
    <div className="project-agent-activity-side"><b><i />{activity.stale ? '等待新进度' : '服务端执行中'}</b>{activity.stale && <button type="button" onClick={onRefresh}>刷新状态</button>}</div>
    <span className="project-agent-activity-track" aria-hidden="true"><i /></span>
  </section>;
}
