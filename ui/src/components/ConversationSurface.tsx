import React, { useState } from 'react';
import { buildSurfaceItems, messageById, planProgress, type ProjectAgentQuestion, type ProjectAgentThread, type SurfaceItem } from './projectAgentUiModel';

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
  const progress = planProgress(thread);
  const plan = thread.plan;
  return (
    <main className="agent-surface" aria-label="对话流">
      <div className="agent-surface-stack">
        {plan?.status === 'pending' && (
          <article className="agent-card agent-card-plan" aria-label="目标契约">
            <div className="agent-card-row">
              <span className="agent-status-icon" data-state="attention">目</span>
              <div className="agent-card-copy"><strong>{plan.goal}</strong><small>{plan.tasks.length} 项任务 · {thread.mode === 'goal' ? '目标模式 · 确认后自动执行' : '待你确认'}</small></div>
            </div>
            {thread.mode === 'goal' && (
              <div className="agent-approval-actions">
                <span className="agent-badge agent-badge-accent">自主执行</span>
                <button type="button" className="agent-btn" disabled={busy} onClick={() => onSwitchMode('plan')}>先改成计划模式</button>
              </div>
            )}
            {thread.mode !== 'goal' && !rejecting && (
              <div className="agent-approval-actions">
                <button type="button" className="agent-btn" disabled={busy} onClick={() => setRejecting(true)}>重新规划</button>
                <button type="button" className="agent-btn agent-btn-primary" disabled={busy || !acknowledged} onClick={() => onConfirmPlan(plan.revision)}>确认目标并开始</button>
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
                我已核对目标、成功标准和风险边界
              </label>
            )}
          </article>
        )}
        {plan && plan.status !== 'pending' && progress.total > 0 && (
          <article className="agent-card" aria-label="任务进度">
            <div className="agent-card-row">
              <span className="agent-status-icon" data-state={thread.status === 'completed' ? 'passed' : 'running'}>✓</span>
              <div className="agent-card-copy"><strong>{progress.passed}/{progress.total} 项任务完成</strong><small>{thread.status === 'completed' ? '目标已完成并通过门禁' : '继续执行中'}</small></div>
              <span className="agent-badge agent-badge-accent">{progress.percent}%</span>
            </div>
            <div className="agent-progress" aria-label={`任务完成度 ${progress.percent}%`}><span style={{ width: `${progress.percent}%` }} /></div>
          </article>
        )}
        {items.map((item) => {
          const isApproval = item.kind === 'approval';
          const approval = thread.pendingApproval;
          const questionMessage = item.kind === 'question' && item.ref.messageId ? messageById(thread, item.ref.messageId) : undefined;
          const question = questionMessage?.questions?.[0];
          return (
            <article key={item.key} className={`agent-card ${item.kind === 'completion' ? 'agent-card-success' : item.kind === 'blocked' ? 'agent-card-blocked' : item.kind === 'question' ? 'agent-card-warning' : isApproval ? 'agent-card-warning' : item.kind === 'task' && item.state === 'failed' ? 'agent-card-danger' : ''}`}
              data-clickable={!isApproval ? 'true' : undefined}
              onClick={() => { if (!isApproval) onOpenDetail(item); }}
              onKeyDown={(event) => { if (!isApproval && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpenDetail(item); } }}
              tabIndex={isApproval ? undefined : 0}
              aria-label={isApproval ? undefined : `查看详情：${item.title}`}>
              <div className="agent-card-row">
                <span className="agent-status-icon" data-state={item.state}>{iconByState[item.state]}</span>
                <div className="agent-card-copy"><strong>{item.title}</strong><small>{item.meta}</small></div>
              </div>
              {isApproval && approval && (
                <>
                  <p>{approval.confirmation.summary || approval.toolName}。目标确认不替代删除/覆盖审批，等你明确决定后再继续。</p>
                  <div className="agent-approval-actions">
                    <button type="button" className="agent-btn" disabled={busy} onClick={() => onApprove(approval.id, false)}>取消</button>
                    <button type="button" className="agent-btn agent-btn-danger" disabled={busy || manualApproval === false} onClick={() => onApprove(approval.id, true)}>确认执行</button>
                  </div>
                </>
              )}
              {item.kind === 'question' && question && (
                <div className="agent-question">
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
                  <p className="agent-question-hint">回答后会自动继续；也可以直接输入你的补充说明。</p>
                </div>
              )}
            </article>
          );
        })}
        {thread.status === 'failed' && (
          <article className="agent-card agent-card-danger">
            <div className="agent-card-row"><span className="agent-status-icon" data-state="failed">!</span><div className="agent-card-copy"><strong>本轮处理失败</strong><small>可重新生成计划或重试</small></div></div>
            <div className="agent-approval-actions"><button type="button" className="agent-btn" disabled={busy} onClick={onRetryPlanning}>重新生成计划</button></div>
          </article>
        )}
      </div>
    </main>
  );
}
