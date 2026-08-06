import React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  buildActivityState, buildUnifiedCards, formatDuration, messageById, planProgress, statusLabelsShort, statusSymbols,
  stepElapsedMs, turnElapsedMs,
  type ProjectAgentThread, type SurfaceItem, type UnifiedCard,
} from './projectAgentUiModel';
import { useListAnimation } from '../hooks/useListAnimation';

const iconByState: Record<SurfaceItem['state'], string> = { idle: '·', passed: '✓', failed: '!', running: '↻', blocked: '✕', attention: '?' };

function cardIcon(card: UnifiedCard): string {
  if (card.sender === 'user') return '你';
  if (card.sender === 'agent') return card.kind === 'question' ? '?' : card.state === 'passed' ? '✓' : '✦';
  if (card.kind === 'plan') return '目';
  if (card.kind === 'approval') return '!';
  if (card.kind === 'blocked') return '✕';
  return iconByState[card.state];
}

function surfaceItemForCard(thread: ProjectAgentThread, card: UnifiedCard): SurfaceItem | undefined {
  if (card.ref.messageId) {
    const message = messageById(thread, card.ref.messageId);
    if (!message) return undefined;
    return { key: `message:${message.id}`, kind: 'message', state: card.state, title: card.title, meta: card.meta, ref: { messageId: message.id } };
  }
  if (card.ref.eventSeq != null) {
    return { key: `event:${card.ref.eventSeq}`, kind: 'event', state: card.state, title: card.title, meta: card.meta, ref: { eventSeq: card.ref.eventSeq } };
  }
  if (card.kind === 'plan') return { key: 'card:plan', kind: 'plan', state: card.state, title: card.title, meta: card.meta, ref: {} };
  if (card.kind === 'blocked') return { key: 'card:blocked', kind: 'blocked', state: 'blocked', title: card.title, meta: card.meta, ref: {} };
  return undefined;
}

function AgentCard({
  card, thread, busy, manualApproval, onOpenDetail, onSendQuick, onApprove, style,
}: {
  card: UnifiedCard;
  thread: ProjectAgentThread;
  busy?: boolean;
  manualApproval?: boolean;
  onOpenDetail: (item: SurfaceItem) => void;
  onSendQuick?: (text: string) => void;
  onApprove: (approvalId: string, approved: boolean) => void;
  style?: React.CSSProperties;
}) {
  const message = card.ref.messageId ? messageById(thread, card.ref.messageId) : undefined;
  const question = message?.questions?.[0];
  const approval = card.kind === 'approval' ? thread.pendingApproval : undefined;
  const actionable = card.kind === 'question' || card.kind === 'approval';
  const detailItem = actionable ? undefined : surfaceItemForCard(thread, card);
  const icon = cardIcon(card);
  return (
    <article
      style={style}
      className={`agent-card agent-card-${card.kind}${card.kind === 'message' ? ' agent-card-message' : ''} is-${card.state}`}
      data-clickable={detailItem ? 'true' : undefined}
      onClick={detailItem ? () => onOpenDetail(detailItem) : undefined}
      onKeyDown={detailItem ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenDetail(detailItem); } } : undefined}
      tabIndex={detailItem ? 0 : undefined}
      aria-label={detailItem ? `查看详情：${card.title}` : card.title}>
      <div className="agent-card-row">
        <span className="agent-status-icon" data-state={card.state} data-sender={card.sender} title={card.sender ? (card.sender === 'user' ? '你的需求' : '智能体') : undefined}>{icon}</span>
        <span className="agent-card-copy"><strong>{card.title}</strong><small>{card.meta}</small></span>
      </div>
      {card.body && <p className="agent-card-body">{card.body}</p>}
      {question && (
        <div className="agent-question">
          {question.options?.length ? (
            <div className="agent-question-options">
              {question.options.map((option) => (
                <button key={option.label} type="button" className="agent-btn" disabled={busy}
                  onClick={() => onSendQuick?.(option.label)}>
                  {option.label}
                  {option.description ? <small>{option.description}</small> : null}
                </button>
              ))}
            </div>
          ) : null}
          <p className="agent-question-hint">可直接回复选项，或输入补充说明。</p>
        </div>
      )}
      {approval && (
        <div className="agent-approval-actions">
          <button type="button" className="agent-btn" disabled={busy} onClick={() => onApprove(approval.id, false)}>✕ 取消</button>
          <button type="button" className="agent-btn agent-btn-danger" disabled={busy || manualApproval === false} onClick={() => onApprove(approval.id, true)}>✓ 确认</button>
        </div>
      )}
    </article>
  );
}

function SurfaceStatusHeader({
  thread, busy, scrolled, activity, turnElapsed, stepElapsed, onControl, onInterrupt, onRestoreCheckpoint, hasCheckpoints,
}: {
  thread: ProjectAgentThread;
  busy?: boolean;
  scrolled: boolean;
  activity: ReturnType<typeof buildActivityState>;
  turnElapsed: string;
  stepElapsed: string;
  onControl: (action: 'pause' | 'continue' | 'stop' | 'retry') => void;
  onInterrupt: () => void;
  onRestoreCheckpoint?: () => void;
  hasCheckpoints?: boolean;
}) {
  const progress = planProgress(thread);
  const running = thread.status === 'executing';
  const label = statusLabelsShort[thread.status];
  const symbol = statusSymbols[thread.status];
  const lastEvent = thread.events[thread.events.length - 1];
  const detail = thread.dynamicPlan?.goal
    || (thread.blockedCount ? `受阻 ×${thread.blockedCount}` : thread.consecutiveNoProgress ? `无进展 ×${thread.consecutiveNoProgress}` : '等待你描述目标');
  const metrics = thread.turnMetrics;
  const metricsText = metrics
    ? `模型 ${metrics.modelCalls} · 工具 ${metrics.toolCalls}${metrics.retries ? ` · 重试 ${metrics.retries}` : ''}${metrics.compactions ? ` · 压缩 ${metrics.compactions}` : ''}${metrics.pauses ? ` · 暂停 ${metrics.pauses}` : ''}`
    : '';
  return (
    <header className={`agent-surface-header${scrolled ? ' is-scrolled' : ''}`} aria-label="会话状态">
      <span className={`agent-badge ${thread.status === 'blocked' || thread.status === 'failed' ? 'agent-badge-danger' : thread.status === 'awaiting_operation_approval' || thread.status === 'paused' ? 'agent-badge-warning' : thread.status === 'completed' ? 'agent-badge-success' : 'agent-badge-accent'}`} title={label} aria-label={label}>{symbol} {label}</span>
      <span className="agent-status-copy"><strong>{detail}</strong><small>{progress.total ? `${progress.total} 个计划步骤` : '无计划'}{metricsText ? ` · ${metricsText}` : ''}{lastEvent ? ` · ${lastEvent.type}` : ''}</small></span>
      {running && activity.active && (
        <span className="agent-running-indicator" role="status" aria-live="polite">
          <span className="agent-spinner" aria-hidden="true" />
          <span className="agent-running-copy"><strong>{activity.label}</strong><small>已运行 {turnElapsed}{stepElapsed ? ` · 本步 ${stepElapsed}` : ''}</small></span>
        </span>
      )}
      <span className="agent-status-actions">
        {thread.status === 'executing' && <button type="button" className="agent-btn agent-icon-btn" title="暂停" aria-label="暂停" disabled={busy} onClick={() => onControl('pause')}>⏸</button>}
        {thread.status === 'executing' && <button type="button" className="agent-btn agent-icon-btn" title="打断" aria-label="打断" disabled={busy} onClick={onInterrupt}>✋</button>}
        {['paused', 'stopped'].includes(thread.status) && <button type="button" className="agent-btn agent-icon-btn" title="继续" aria-label="继续" disabled={busy} onClick={() => onControl('continue')}>▶</button>}
        {thread.status === 'blocked' && <button type="button" className="agent-btn agent-icon-btn" title="重试" aria-label="重试" disabled={busy} onClick={() => onControl('retry')}>↻</button>}
        {hasCheckpoints && ['paused', 'stopped', 'blocked', 'failed'].includes(thread.status) && <button type="button" className="agent-btn agent-icon-btn" title="恢复检查点" aria-label="恢复检查点" disabled={busy} onClick={() => onRestoreCheckpoint?.()}>↩</button>}
        {running && <button type="button" className="agent-btn agent-btn-danger agent-icon-btn" title="停止" aria-label="停止" disabled={busy} onClick={() => onControl('stop')}>⏹</button>}
      </span>
    </header>
  );
}

export default function ConversationSurface({
  thread, busy, manualApproval, onOpenDetail, onApprove, onRetryPlanning, onUseExample, onSendQuick,
  onControl = () => undefined, onInterrupt = () => undefined, onRestoreCheckpoint, hasCheckpoints = false,
}: {
  thread: ProjectAgentThread | null;
  busy?: boolean;
  manualApproval?: boolean;
  onOpenDetail: (item: SurfaceItem) => void;
  onApprove: (approvalId: string, approved: boolean) => void;
  onRetryPlanning: () => void;
  onUseExample: () => void;
  onSendQuick?: (text: string) => void;
  onControl?: (action: 'pause' | 'continue' | 'stop' | 'retry') => void;
  onInterrupt?: () => void;
  onRestoreCheckpoint?: () => void;
  hasCheckpoints?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<HTMLElement | null>(null);
  const nearBottomRef = useRef(true);
  const executing = thread?.status === 'executing';

  useEffect(() => {
    if (!executing) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [executing, thread?.id]);

  const cards = thread ? buildUnifiedCards(thread) : [];
  const animatedCards = useListAnimation(cards, (card) => card.key);
  const activity = buildActivityState(thread, now);
  const turnElapsed = formatDuration(turnElapsedMs(thread, now));
  const stepElapsed = formatDuration(stepElapsedMs(thread, now));

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !nearBottomRef.current) return undefined;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    return undefined;
  }, [thread?.id, thread?.updatedAt, thread?.status, cards.length]);

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    nearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
    setScrolled(element.scrollTop > 4);
  }

  if (!thread) {
    return (
      <main className="agent-surface" aria-label="对话流">
        <div className="agent-empty-state">
          <strong>开始一个新任务</strong>
          <p>描述你要创建或改造的项目。智能体会先检查现状、生成动态计划，然后像 Codex 一样自主执行并持续验证。</p>
          <button type="button" className="agent-btn agent-btn-primary" onClick={onUseExample}>试用员工管理示例</button>
        </div>
      </main>
    );
  }

  return (
    <main ref={scrollRef} className="agent-surface" onScroll={handleScroll} aria-label="对话流">
      <SurfaceStatusHeader thread={thread} busy={busy} scrolled={scrolled}
        activity={activity} turnElapsed={turnElapsed} stepElapsed={stepElapsed}
        onControl={onControl} onInterrupt={onInterrupt} onRestoreCheckpoint={onRestoreCheckpoint} hasCheckpoints={hasCheckpoints} />
      <div className="agent-surface-stack">
        <div className="agent-card-feed">
          {animatedCards.map((row) => (
            <AgentCard key={row.key} card={row.item} thread={thread} busy={busy} manualApproval={manualApproval}
              style={row.style} onOpenDetail={onOpenDetail} onSendQuick={onSendQuick} onApprove={onApprove} />
          ))}
        </div>
      </div>
    </main>
  );
}
