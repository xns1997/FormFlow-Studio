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
  const disconnected = connection === 'disconnected' || connection === 'reconnecting';
  return <section className={`project-agent-activity-notice ${activity.stale ? 'stale' : ''}`} role="status" aria-live="polite">
    <span className="project-agent-activity-spinner" aria-hidden="true"><i /></span>
    <div className="project-agent-activity-copy"><strong>{activity.label}</strong><span>{activity.detail}</span><small>{activity.stale ? '这一步比预期久，我还在等待结果。' : `已经处理了 ${elapsed}，你可以先浏览前面的内容。`}{disconnected ? ' 连接恢复后会自动补上进展。' : ''}</small></div>
    <div className="project-agent-activity-side"><b><i />{activity.stale ? '还在处理' : '正在处理'}</b>{activity.stale && <button type="button" onClick={onRefresh}>看看最新进展</button>}</div>
    <span className="project-agent-activity-track" aria-hidden="true"><i /></span>
  </section>;
}
