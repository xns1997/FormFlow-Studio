import React from 'react';
import {
  evidenceKindLabel, formatSummaryText, humanEventSummary, messageById, planProgress,
  type ProjectAgentEvent, type ProjectAgentEvidence, type ProjectAgentThread, type SurfaceItem,
} from './projectAgentUiModel';

function EventRow({ event }: { event: ProjectAgentEvent }) {
  const toolName = String(event.data?.toolName || '');
  return (
    <div className="agent-event-row">
      <code>#{event.seq}</code>
      <span className="agent-event-copy"><strong>{toolName ? `${toolName} · ${event.type}` : event.type}</strong><span>{formatSummaryText(humanEventSummary(event), 120).short}</span></span>
    </div>
  );
}

function EvidenceList({ items }: { items: ProjectAgentEvidence[] }) {
  const rows: Array<{ item: ProjectAgentEvidence; count: number }> = [];
  for (const item of items) {
    const key = typeof item.summary === 'string' ? item.summary : JSON.stringify(item.summary ?? '');
    const existing = rows.find((row) => (typeof row.item.summary === 'string' ? row.item.summary : JSON.stringify(row.item.summary ?? '')) === key);
    if (existing) existing.count += 1;
    else rows.push({ item, count: 1 });
  }
  return (
    <ul className="agent-evidence-list">
      {rows.map(({ item, count }) => {
        const text = formatSummaryText(item.summary, 96);
        const kind = evidenceKindLabel(item.kind);
        return (
          <li key={item.id} className="agent-evidence-item">
            <span className="agent-evidence-kind" data-kind={item.kind || 'evidence'}>{kind}</span>
            <div className="agent-evidence-copy">
              <p>✓ {text.short}{count > 1 ? <em className="agent-evidence-count">×{count}</em> : null}</p>
              {text.full && text.full !== text.short && (
                <details className="agent-evidence-expand">
                  <summary>查看详情</summary>
                  <pre>{text.full}</pre>
                </details>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function DetailLayer({
  thread, active, onClose,
}: {
  thread: ProjectAgentThread | null;
  active: SurfaceItem | null;
  onClose: () => void;
}) {
  const plan = thread?.dynamicPlan;
  const progress = planProgress(thread || ({ dynamicPlan: undefined, status: 'idle', events: [], turns: [], messages: [] } as unknown as ProjectAgentThread));
  const totalEvents = thread?.events.length ?? 0;
  const recentEvents = thread ? [...thread.events].slice(-12).reverse() : [];
  const olderEvents = thread && totalEvents > 12 ? [...thread.events].slice(0, -12).reverse() : [];

  const planDetail = (
    <div className="agent-detail-scroll">
      {plan ? <>
        <section className="agent-detail-section">
          <h4>◎ 目标</h4>
          <p>{plan.goal}</p>
          {plan.summary && <p style={{ marginTop: 6, color: 'var(--text-secondary)' }}>{plan.summary}</p>}
        </section>
        <section className="agent-detail-section">
          <h4>✓ 完成标准</h4>
          <ul className="agent-checks">{plan.successCriteria.map((item) => <li key={item}>✓ {item}</li>)}</ul>
        </section>
        {plan.steps.length > 0 && (
          <section className="agent-detail-section">
            <h4>☰ 当前思路（{plan.steps.length} 步）</h4>
            <ol>{plan.steps.map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}</ol>
          </section>
        )}
        {(plan.assumptions.length > 0 || plan.risks.length > 0) && (
          <section className="agent-detail-section">
            <h4>⚠ 假设/风险</h4>
            <ul>{plan.assumptions.map((item) => <li key={`a:${item}`}>假设：{item}</li>)}</ul>
            <ul>{plan.risks.map((item) => <li key={`r:${item}`}>风险：{item}</li>)}</ul>
          </section>
        )}
        <section className="agent-detail-section">
          <h4>◷ 更新时间</h4>
          <p>{new Date(plan.updatedAt).toLocaleString('zh-CN')}{plan.updatedBy === 'model' ? ' · 智能体修订' : ' · 系统初始化'}</p>
        </section>
      </> : <div className="agent-empty-state"><strong>暂无计划</strong><p>发送需求后，这里会展示动态计划与执行时间线。</p></div>}
      <section className="agent-detail-section">
        <h4>≡ 事件 · 最近 {recentEvents.length} / 共 {totalEvents}</h4>
        <div className="agent-event-log">
          {recentEvents.map((event) => <EventRow key={event.seq} event={event} />)}
          {olderEvents.length > 0 && (
            <details className="agent-event-more">
              <summary>查看更早的 {olderEvents.length} 条</summary>
              {olderEvents.map((event) => <EventRow key={event.seq} event={event} />)}
            </details>
          )}
        </div>
      </section>
    </div>
  );

  let sheet: React.ReactNode = null;
  let sheetTitle = '';
  if (active && thread) {
    if (active.kind === 'message') {
      const message = messageById(thread, active.ref.messageId);
      sheetTitle = message?.role === 'user' ? '◎ 你' : 'ℹ 智能体';
      sheet = (
        <div className="agent-detail-scroll">
          <section className="agent-detail-section"><h4>{sheetTitle}</h4><p>{message?.content || active.title}</p></section>
          {message && <section className="agent-detail-section"><h4>◷ 时间</h4><p>{new Date(message.createdAt).toLocaleString('zh-CN')}</p></section>}
        </div>
      );
    } else if (active.kind === 'event') {
      const event = thread.events.find((item) => item.seq === active.ref.eventSeq);
      sheetTitle = '▸ 事件';
      sheet = event ? (
        <div className="agent-detail-scroll">
          <section className="agent-detail-section"><h4>▸ 事件</h4><p>{humanEventSummary(event)}</p></section>
          <section className="agent-detail-section"><h4>⚙ 类型</h4><p>{event.type}</p></section>
          {event.data && <section className="agent-detail-section"><h4>⇥ 载荷</h4><pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'var(--panel-soft)', borderRadius: 8, padding: 10, margin: 0 }}>{JSON.stringify(event.data, null, 2)}</pre></section>}
          <section className="agent-detail-section"><h4>◷ 时间</h4><p>{new Date(event.createdAt).toLocaleString('zh-CN')}</p></section>
        </div>
      ) : null;
    } else if (active.kind === 'approval') {
      const approval = thread.pendingApproval;
      sheetTitle = '⚠ 待确认';
      sheet = approval ? (
        <div className="agent-detail-scroll">
          <section className="agent-detail-section"><h4>⚙ 操作</h4><p>{approval.confirmation.summary || approval.toolName}</p></section>
          <section className="agent-detail-section"><h4>⚠ 影响</h4><pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'var(--panel-soft)', borderRadius: 8, padding: 10, margin: 0 }}>{JSON.stringify(approval.confirmation.impact ?? {}, null, 2)}</pre></section>
          <section className="agent-detail-section"><h4>⚙ 参数</h4><p>{approval.toolName}</p><pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'var(--panel-soft)', borderRadius: 8, padding: 10, margin: 0 }}>{JSON.stringify(approval.arguments, null, 2)}</pre></section>
        </div>
      ) : null;
    } else if (active.kind === 'blocked') {
      sheetTitle = '✕ 受阻';
      sheet = (
        <div className="agent-detail-scroll">
          <section className="agent-detail-section"><h4>⚙ 状态</h4><p>{thread.blockedConditionFingerprint || '同一问题重复出现'}</p></section>
          <section className="agent-detail-section"><h4>↻ 连续</h4><p>×{thread.blockedCount}</p></section>
        </div>
      );
    } else if (active.kind === 'plan') {
      sheetTitle = '◎ 当前计划';
      sheet = planDetail;
    }
  }

  return (
    <aside className="agent-detail" aria-label="详情">
      <div className="agent-detail-header">
        <strong>{active ? sheetTitle : '当前计划'}</strong>
        <button type="button" className="agent-btn agent-icon-btn" onClick={onClose} aria-label="关闭详情" title="关闭详情">✕</button>
      </div>
      {active && sheet ? (
        <div className="agent-detail-sheet">{sheet}</div>
      ) : (
        planDetail
      )}
    </aside>
  );
}
