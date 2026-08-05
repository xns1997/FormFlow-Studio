import React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  buildSurfaceItems, messageById, planProgress, taskById, taskStatusLabels,
  type ProjectAgentQuestion, type ProjectAgentThread, type SurfaceItem,
} from './projectAgentUiModel';
import { useListAnimation } from '../hooks/useListAnimation';

const iconByState: Record<SurfaceItem['state'], string> = { idle: '·', passed: '✓', failed: '!', running: '↻', blocked: '✕', attention: '?' };

export default function ConversationSurface({
  thread, busy, manualApproval, onOpenDetail, onConfirmPlan, onRejectPlan, onApprove, onRetryPlanning, onUseExample, onSwitchMode, onSendQuick,
}: {
  thread: ProjectAgentThread | null;
  busy?: boolean;
  manualApproval?: boolean;
  onOpenDetail: (item: SurfaceItem) => void;
  onConfirmPlan: (revision: number) => void;
  onRejectPlan: (feedback: string) => void;
  onApprove: (approvalId: string, approved: boolean) => void;
  onRetryPlanning: () => void;
  onUseExample: () => void;
  onSwitchMode: (mode: 'plan' | 'goal') => void;
  onSendQuick?: (text: string) => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const highlightTimer = useRef<number | undefined>(undefined);
  if (!thread) {
    return (
      <main className="agent-surface" aria-label="对话流">
        <div className="agent-empty-state">
          <strong>开始一个新任务</strong>
          <p>描述你要创建或改造的项目。智能体会先检查现状、生成目标契约，确认后按领域 skill 执行并持续验收。</p>
          <button type="button" className="agent-btn agent-btn-primary" onClick={onUseExample}>试用员工管理示例</button>
        </div>
      </main>
    );
  }
  const items = buildSurfaceItems(thread);
  const animatedItems = useListAnimation(items, (item) => item.key);
  const progress = planProgress(thread);
  const plan = thread.plan;
  const latestQuestion = [...thread.messages].reverse().find((message) => message.kind === 'question');
  const linkedTaskId = latestQuestion?.questions?.[0]?.taskId;
  const linkedTask = linkedTaskId ? taskById(thread, linkedTaskId) : undefined;

  useEffect(() => {
    const questionId = latestQuestion?.id;
    if (!questionId || !linkedTaskId) return undefined;
    setHighlightedTaskId(linkedTaskId);
    const timer = window.setTimeout(() => {
      setHighlightedTaskId((current) => (current === linkedTaskId ? null : current));
    }, 2400);
    highlightTimer.current = timer;
    const element = document.getElementById(`surface-task-${linkedTaskId}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return () => { window.clearTimeout(timer); };
  }, [latestQuestion?.id, linkedTaskId]);

  useEffect(() => () => { if (highlightTimer.current) window.clearTimeout(highlightTimer.current); }, []);

  function focusTask(taskId: string) {
    setHighlightedTaskId(taskId);
    const element = document.getElementById(`surface-task-${taskId}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightedTaskId((current) => (current === taskId ? null : current)), 2400);
  }

  return (
    <main className="agent-surface" aria-label="对话流">
      <div className="agent-surface-stack">
        {plan?.status === 'pending' && (
          <article className="agent-card agent-card-plan" aria-label="目标契约">
            <div className="agent-card-row">
              <span className="agent-status-icon" data-state="attention">目</span>
              <div className="agent-card-copy"><strong>{plan.goal}</strong><small>{plan.tasks.length} 步 · {thread.mode === 'goal' ? '自动执行' : '待确认'}</small></div>
            </div>
            {thread.mode === 'goal' && (
              <div className="agent-approval-actions">
                <span className="agent-badge agent-badge-accent">目标</span>
                <button type="button" className="agent-btn" disabled={busy} onClick={() => onSwitchMode('plan')}>改计划</button>
              </div>
            )}
            {thread.mode !== 'goal' && !rejecting && (
              <div className="agent-approval-actions">
                <button type="button" className="agent-btn" disabled={busy} onClick={() => setRejecting(true)}>↻ 重规划</button>
                <button type="button" className="agent-btn agent-btn-primary" disabled={busy || !acknowledged} onClick={() => onConfirmPlan(plan.revision)}>▶ 开始</button>
              </div>
            )}
            {thread.mode !== 'goal' && rejecting && (
              <div className="agent-card-row" style={{ gap: 8 }}>
                <input value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="说明修改意见" aria-label="计划修改意见"
                  style={{ flex: 1, border: 'var(--border)', borderRadius: 8, padding: '6px 10px', minHeight: 28, background: 'var(--panel)', color: 'var(--text)', fontSize: 12 }} />
                <button type="button" className="agent-btn" disabled={busy || !feedback.trim()} onClick={() => { onRejectPlan(feedback); setRejecting(false); setFeedback(''); }}>提交意见</button>
              </div>
            )}
            {thread.mode !== 'goal' && (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={acknowledged} disabled={busy} onChange={(event) => setAcknowledged(event.target.checked)} />
                已核对目标/标准/风险
              </label>
            )}
          </article>
        )}
        {plan && plan.status !== 'pending' && progress.total > 0 && (
          <article className="agent-card" aria-label="任务进度">
            <div className="agent-card-row">
              <span className="agent-status-icon" data-state={thread.status === 'completed' ? 'passed' : 'running'}>✓</span>
              <div className="agent-card-copy"><strong>{progress.passed}/{progress.total} 步</strong><small>{thread.status === 'completed' ? '已通过门禁' : '执行中'}</small></div>
              <span className="agent-badge agent-badge-accent">{progress.percent}%</span>
            </div>
            <div className="agent-progress" aria-label={`任务完成度 ${progress.percent}%`}><span style={{ width: `${progress.percent}%` }} /></div>
          </article>
        )}
        {animatedItems.map((row) => {
          const item = row.item;
          const isApproval = item.kind === 'approval';
          const approval = thread.pendingApproval;
          const questionMessage = item.kind === 'question' && item.ref.messageId ? messageById(thread, item.ref.messageId) : undefined;
          const question = questionMessage?.questions?.[0];
          const messageItem = (item.kind === 'message' || item.kind === 'completion' || item.kind === 'question') && item.ref.messageId ? messageById(thread, item.ref.messageId) : undefined;
          const senderGlyph = item.kind === 'message' ? (messageItem?.role === 'user' ? '你' : '✦') : undefined;
          const icon = senderGlyph || iconByState[item.state];
          const senderLabel = messageItem?.role === 'user' ? '你的需求' : '智能体';
          return (
            <article key={item.key}
              style={row.style}
              id={item.kind === 'task' && item.ref.taskId ? `surface-task-${item.ref.taskId}` : undefined}
              className={`agent-card ${item.kind === 'completion' ? 'agent-card-success' : item.kind === 'blocked' ? 'agent-card-blocked' : item.kind === 'question' ? 'agent-card-warning' : isApproval ? 'agent-card-warning' : item.kind === 'task' && item.state === 'failed' ? 'agent-card-danger' : ''}${item.kind === 'message' ? ' agent-card-message' : ''}${item.kind === 'task' && item.ref.taskId && (highlightedTaskId === item.ref.taskId || linkedTaskId === item.ref.taskId) ? ' agent-card-linked' : ''}`}
              data-clickable={!isApproval ? 'true' : undefined}
              onClick={() => { if (!isApproval) onOpenDetail(item); }}
              onKeyDown={(event) => { if (!isApproval && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpenDetail(item); } }}
              tabIndex={isApproval ? undefined : 0}
              aria-label={isApproval ? undefined : `查看详情：${item.title}`}>
              <div className="agent-card-row">
                <span className="agent-status-icon" data-state={item.state} data-sender={senderGlyph ? (messageItem?.role === 'user' ? 'user' : 'agent') : undefined} title={senderGlyph ? senderLabel : undefined} aria-hidden={senderGlyph ? 'true' : undefined}>{icon}</span>
                <div className="agent-card-copy"><strong>{item.title}</strong><small>{item.meta}</small></div>
                {item.kind === 'task' && item.ref.taskId === linkedTaskId && linkedTask && (
                  <span className="agent-badge agent-badge-warning">待你回答</span>
                )}
              </div>
              {isApproval && approval && (
                <>
                  <p>{approval.confirmation.summary || approval.toolName}。删除/覆盖需你明确确认。</p>
                  <div className="agent-approval-actions">
                    <button type="button" className="agent-btn" disabled={busy} onClick={() => onApprove(approval.id, false)}>✕ 取消</button>
                    <button type="button" className="agent-btn agent-btn-danger" disabled={busy || manualApproval === false} onClick={() => onApprove(approval.id, true)}>✓ 确认</button>
                  </div>
                </>
              )}
              {item.kind === 'question' && question && (
                <div className="agent-question">
                  {question.taskId && question.taskTitle && (
                    <button type="button" className="agent-question-task" onClick={(event) => { event.stopPropagation(); if (question.taskId) focusTask(question.taskId); }}>
                      <span className="agent-question-task-label">关联步骤</span>
                      <strong>{question.taskTitle}</strong>
                      <small>{linkedTask ? taskStatusLabels[linkedTask.status] : '计划步骤'}</small>
                    </button>
                  )}
                  {question.context && <p className="agent-question-context">{question.context}</p>}
                  {question.options?.length ? (
                    <div className="agent-question-options">
                      {question.options.map((option) => (
                        <button key={option.label} type="button" className="agent-btn" disabled={busy}
                          onClick={(event) => { event.stopPropagation(); onSendQuick?.(option.label); }}>
                          {option.label}
                          {option.description ? <small>{option.description}</small> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <p className="agent-question-hint">可直接回复选项，或输入补充说明。</p>
                </div>
              )}
            </article>
          );
        })}
        {thread.status === 'failed' && (
          <article className="agent-card agent-card-danger">
            <div className="agent-card-row"><span className="agent-status-icon" data-state="failed">!</span><div className="agent-card-copy"><strong>处理失败</strong><small>重规划或重试</small></div></div>
            <div className="agent-approval-actions"><button type="button" className="agent-btn" disabled={busy} onClick={onRetryPlanning}>↻ 重规划</button></div>
          </article>
        )}
      </div>
    </main>
  );
}
