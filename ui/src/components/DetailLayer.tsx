import React from 'react';
import {
  buildEventLog, evidenceKindLabel, formatSummaryText, messageById, modeLabels, planProgress, taskById, taskStatusLabels,
  type ProjectAgentEvidence, type ProjectAgentThread, type SurfaceItem,
} from './projectAgentUiModel';

function EvidenceList({ items }: { items: ProjectAgentEvidence[] }) {
  // 折叠完全相同的摘要，让重复的工具观察不再刷屏。
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
  thread, active, onClose, onOpenTask, onRetryTask,
}: {
  thread: ProjectAgentThread | null;
  active: SurfaceItem | null;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
}) {
  const plan = thread?.plan;
  const progress = planProgress(thread || { plan: undefined, status: 'idle' } as unknown as ProjectAgentThread);
  const events = thread ? buildEventLog(thread, 40) : [];

  const planDetail = (
    <div className="agent-detail-scroll">
      {plan ? <>
        <section className="agent-detail-section">
          <h4>◎ 目标</h4>
          <p>{plan.goal}</p>
          <p style={{ marginTop: 6, color: 'var(--text-secondary)' }}>{thread?.mode ? `${modeLabels[thread.mode]} · ` : ''}{plan.summary}</p>
        </section>
        <section className="agent-detail-section">
          <h4>✓ 完成标准</h4>
          <ul className="agent-checks">{plan.successCriteria.map((item) => <li key={item}>✓ {item}</li>)}</ul>
        </section>
        <section className="agent-detail-section">
          <h4>⚠ 假设/风险</h4>
          <ul>{plan.assumptions.map((item) => <li key={`a:${item}`}>假设：{item}</li>)}</ul>
          <ul>{plan.risks.map((item) => <li key={`r:${item}`}>风险：{item}</li>)}</ul>
        </section>
        <section className="agent-detail-section">
          <h4>☰ 步骤（{progress.passed}/{progress.total}）</h4>
          <div className="agent-progress" aria-label={`任务完成度 ${progress.percent}%`}><span style={{ width: `${progress.percent}%` }} /></div>
          <div className="agent-event-log" style={{ marginTop: 8 }}>
            {plan.tasks.map((task) => (
              <button key={task.id} type="button" className="agent-event-row" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => onOpenTask(task.id)} aria-label={`任务详情：${task.title}`}>
                <span className={`agent-status-icon`} data-state={task.status === 'passed' ? 'passed' : task.status === 'failed' ? 'failed' : task.status === 'running' ? 'running' : task.status === 'blocked' ? 'blocked' : 'idle'}>{task.status === 'passed' ? '✓' : task.status === 'failed' ? '!' : task.status === 'running' ? '↻' : '·'}</span>
                <span className="agent-event-copy"><strong>{task.title}</strong><span>{taskStatusLabels[task.status]}{task.attempt ? ` · ×${task.attempt}` : ''}{task.evidence.length ? ` · ▦${task.evidence.length}` : ''}</span></span>
              </button>
            ))}
          </div>
        </section>
      </> : <div className="agent-empty-state"><strong>暂无计划</strong><p>发送需求后，这里会展示目标契约与任务清单。</p></div>}
      <section className="agent-detail-section">
        <h4>≡ 事件（{events.length}）</h4>
        <div className="agent-event-log">
          {events.slice(-12).reverse().map((event) => (
            <div key={event.seq} className="agent-event-row">
              <code>#{event.seq}</code>
              <span className="agent-event-copy"><strong>{event.toolName ? `${event.toolName} · ${event.type}` : event.type}</strong><span>{formatSummaryText(event.summary, 120).short}</span></span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  let sheet: React.ReactNode = null;
  let sheetTitle = '';
  if (active && thread) {
    if (active.kind === 'message' || active.kind === 'completion' || active.kind === 'question') {
      const message = messageById(thread, active.ref.messageId);
      sheetTitle = active.kind === 'completion' ? '✓ 完成' : active.kind === 'question' ? '? 决定' : 'ℹ';
      sheet = (
        <div className="agent-detail-scroll">
          <section className="agent-detail-section"><h4>{message?.kind === 'prompt' ? '◎ 你' : 'ℹ 内容'}</h4><p>{message?.content || active.title}</p></section>
          {active.kind === 'question' && message?.questions?.[0] && (
            <>
              {message.questions[0].taskId ? (() => {
                const task = taskById(thread, message!.questions![0].taskId!);
                return task ? (
                  <section className="agent-detail-section">
                    <h4>▸ 步骤</h4>
                    <button type="button" className="agent-event-row" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => onOpenTask(task.id)} aria-label={`打开任务详情：${task.title}`}>
                      <span className="agent-status-icon" data-state={task.status === 'passed' ? 'passed' : task.status === 'failed' ? 'failed' : task.status === 'running' ? 'running' : task.status === 'blocked' ? 'blocked' : 'idle'}>{task.status === 'passed' ? '✓' : task.status === 'failed' ? '!' : task.status === 'running' ? '↻' : '·'}</span>
                      <span className="agent-event-copy"><strong>{task.title}</strong><span>{taskStatusLabels[task.status]}{task.attempt ? ` · ×${task.attempt}` : ''}</span></span>
                    </button>
                  </section>
                ) : null;
              })() : null}
              {message.questions[0].context && <section className="agent-detail-section"><h4>ℹ 原因</h4><p>{message.questions[0].context}</p></section>}
              {message.questions[0].options?.length ? (
                <section className="agent-detail-section"><h4>▸ 可回复</h4><ul>{message.questions[0].options.map((option) => <li key={option.label}><strong>{option.label}</strong>{option.description ? `：${option.description}` : ''}</li>)}</ul></section>
              ) : null}
            </>
          )}
          {message && <section className="agent-detail-section"><h4>◷ 时间</h4><p>{new Date(message.createdAt).toLocaleString('zh-CN')}</p></section>}
        </div>
      );
    } else if (active.kind === 'task') {
      const task = taskById(thread, active.ref.taskId);
      sheetTitle = '▸ 任务';
      sheet = task ? (
        <div className="agent-detail-scroll">
          <section className="agent-detail-section"><h4>▸ 任务</h4><p>{task.title}</p><p style={{ marginTop: 4, color: 'var(--text-secondary)' }}>{task.scope} · {taskStatusLabels[task.status]}{task.attempt ? ` · ×${task.attempt}` : ''}</p></section>
          <section className="agent-detail-section"><h4>ℹ 说明</h4><p>{task.instruction}</p></section>
          <section className="agent-detail-section"><h4>✓ 验收</h4><ul className="agent-checks">{task.acceptance.map((item, index) => <li key={item} className={index < task.evidence.length ? 'passed' : ''}><i>{index < task.evidence.length ? '✓' : '○'}</i><span>{item}</span></li>)}</ul></section>
          {task.evidence.length > 0 && <section className="agent-detail-section"><h4>▦ 证据（{task.evidence.length}）</h4><EvidenceList items={task.evidence} /></section>}
          {task.error && <section className="agent-detail-section"><h4>✕ 错误</h4><p style={{ color: 'var(--danger)' }}>{task.error}</p></section>}
          {task.status === 'failed' && <div className="agent-approval-actions"><button type="button" className="agent-btn" onClick={() => onRetryTask(task.id)}>重试任务</button></div>}
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
      sheetTitle = '◎ 计划';
      sheet = planDetail;
    }
  }

  return (
    <aside className="agent-detail" aria-label="详情">
      <div className="agent-detail-header">
        <strong>{active ? sheetTitle : '计划详情'}</strong>
        {active && <button type="button" className="agent-btn agent-btn-ghost" onClick={onClose} aria-label="关闭详情">完成</button>}
      </div>
      {active && sheet ? (
        <div className="agent-detail-sheet">{sheet}</div>
      ) : (
        planDetail
      )}
    </aside>
  );
}
