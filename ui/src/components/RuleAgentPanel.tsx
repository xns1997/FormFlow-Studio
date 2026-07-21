import { useEffect, useMemo, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import type { DesignComponent, SrcTableEntry } from '../project/types';
import { llmApi } from '../services/io/api';
import { createSyntheticRuntimeSnapshot, getFormRuntimeSnapshot, subscribeFormRuntimeSnapshots } from '../services/engine/formRuntimeSnapshot';
import type { RuleAgentTurnResult, RuleCodeProposal } from '../services/ai/ruleAgentTypes';
import { useAppInteraction } from './AppInteractionProvider';

type Section = 'orchestrator' | 'editor' | 'lint' | 'test' | 'state';
const sections: Array<{ id: Section; label: string; icon: string }> = [
  { id: 'orchestrator', label: '统筹', icon: '✦' }, { id: 'editor', label: '代码', icon: '⌨' }, { id: 'lint', label: '语法', icon: '✓' },
  { id: 'test', label: '测试', icon: '▷' }, { id: 'state', label: '状态', icon: '◉' },
];

interface Props {
  projectId: string; formId: string; code: string; components: DesignComponent[]; tables: SrcTableEntry[];
  diagnostics: Array<{ line: number; column: number; severity: string; code: string; message: string; suggestion?: string }>;
  onApplied: (result: { ruleCode: string; components: DesignComponent[]; updatedAt: string }) => void;
}

export default function RuleAgentPanel({ projectId, formId, code, components, tables, diagnostics, onApplied }: Props) {
  const { confirm } = useAppInteraction();
  const [section, setSection] = useState<Section>('orchestrator');
  const [sessionId, setSessionId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [proposal, setProposal] = useState<RuleCodeProposal | null>(null);
  const [lastResult, setLastResult] = useState<RuleAgentTurnResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [runtimeRevision, setRuntimeRevision] = useState(0);
  const syntheticRuntime = useMemo(() => createSyntheticRuntimeSnapshot(formId, components, tables), [formId, components, tables]);
  const runtime = useMemo(() => getFormRuntimeSnapshot(formId) || syntheticRuntime, [formId, runtimeRevision, syntheticRuntime]);

  useEffect(() => { setSessionId(''); setMessages([]); setProposal(null); setLastResult(null); setError(''); }, [projectId, formId]);
  useEffect(() => subscribeFormRuntimeSnapshots(() => setRuntimeRevision((value) => value + 1)), []);

  async function ensureSession() {
    if (sessionId) return sessionId;
    const sessions = await llmApi.ruleAgent.sessions(projectId, formId);
    const session = sessions[0] || await llmApi.ruleAgent.createSession({ projectId, formId });
    setSessionId(session.id); setMessages((session.messages || []).map((item: any) => ({ role: item.role, content: item.content })));
    return session.id as string;
  }

  async function send(text = prompt) {
    const content = text.trim(); if (!content || busy) return;
    setBusy(true); setError(''); setMessages((current) => [...current, { role: 'user', content }]); if (text === prompt) setPrompt('');
    try {
      const id = await ensureSession();
      const result = await llmApi.ruleAgent.turn(id, { projectId, formId, prompt: content, code, runtime }) as RuleAgentTurnResult;
      setLastResult(result); if (result.proposal) { setProposal(result.proposal); setSection('editor'); }
      else if (result.intent === 'lint') setSection('lint'); else if (result.intent === 'test') setSection('test'); else if (result.intent === 'inspect') setSection('state');
      setMessages((current) => [...current, { role: 'assistant', content: result.message }]);
    } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setError(message); setMessages((current) => [...current, { role: 'assistant', content: `执行失败：${message}` }]); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!proposal || busy || !await confirm({
      title: '应用规则提案',
      message: '将提案写入规则源码，并立即编译应用到当前表单？',
      detail: '应用前请确认代码差异和影响范围。',
      confirmLabel: '确认并应用',
    })) return;
    setBusy(true); setError('');
    try {
      let confirmFailedTests = false;
      if (proposal.testResult && !proposal.testResult.passed) {
        confirmFailedTests = await confirm({
          title: '测试尚未全部通过',
          message: '仍要应用当前规则提案吗？',
          detail: '未通过的规则可能导致表单运行结果与预期不一致。',
          confirmLabel: '仍然应用',
          destructive: true,
        });
        if (!confirmFailedTests) return;
      }
      const result = await llmApi.ruleAgent.applyProposal(proposal.id, { sessionId: proposal.sessionId, projectId, baseRuleHash: proposal.baseRuleHash, confirmFailedTests });
      onApplied(result); setMessages((current) => [...current, { role: 'assistant', content: '提案已原子写入规则源码和表单联动配置。' }]); setProposal(null); setSection('orchestrator');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  const activeDiagnostics = lastResult?.diagnostics || proposal?.diagnostics || diagnostics;
  const testResult = lastResult?.testResult || proposal?.testResult;
  const visibleRuntime = lastResult?.runtime || runtime;
  const stateRows = useMemo(() => Object.entries(visibleRuntime.values || {}), [visibleRuntime]);

  return <aside className="rule-agent-panel">
    <nav className="rule-agent-nav" aria-label="规则语法智能体" role="tablist">
      {sections.map((item) => <button key={item.id} type="button" role="tab" aria-selected={section === item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)} title={item.label}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}
    </nav>
    <div className="rule-agent-body" role="tabpanel">
      {section === 'orchestrator' && <><div className="rule-agent-heading"><strong>统筹智能体</strong><span>只读取当前表单，代码写入需要确认</span></div><div className="rule-agent-chat" aria-live="polite">{messages.length === 0 && <div className="rule-agent-empty"><b>可以这样说</b><button type="button" onClick={() => void send('检查当前规则语法') }>检查当前规则语法</button><button type="button" onClick={() => void send('测试当前规则的运行效果') }>测试运行效果</button><button type="button" onClick={() => void send('读取当前表单状态') }>读取表单状态</button></div>}{messages.map((item, index) => <div key={index} className={`rule-agent-message ${item.role}`}>{item.content}</div>)}{busy && <div className="rule-agent-working" role="status"><i />智能体正在统筹处理…</div>}</div><div className="rule-agent-composer"><textarea rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void send(); }} placeholder="例如：部门是技术部时显示技术栈，否则隐藏" aria-label="向规则智能体描述需求" /><button type="button" disabled={busy || !prompt.trim()} onClick={() => void send()}>发送</button></div></>}
      {section === 'editor' && <><div className="rule-agent-heading"><strong>代码编辑</strong><span>{proposal ? proposal.summary : '暂无代码提案'}</span></div>{proposal ? <><div className="rule-agent-diff"><DiffEditor original={code} modified={proposal.proposedCode} language="formflow-behavior-rules" theme="light" options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, fontSize: 12, lineHeight: 20 }} /></div><div className="rule-agent-change-list">{proposal.changes.map((item) => <span key={item}>{item}</span>)}</div><div className="rule-agent-actions"><button type="button" onClick={() => setProposal(null)}>拒绝</button><button type="button" className="primary" disabled={busy || proposal.diagnostics.some((item) => item.severity === 'error')} onClick={() => void apply()}>确认并应用</button></div></> : <Empty text="让统筹智能体根据需求生成规则代码后，这里会显示 diff。" />}</>}
      {section === 'lint' && <><div className="rule-agent-heading"><strong>语法检查</strong><button type="button" onClick={() => void send('检查当前规则语法')} disabled={busy}>重新检查</button></div><div className="rule-agent-diagnostics">{activeDiagnostics.length ? activeDiagnostics.map((item, index) => <div key={`${item.line}:${item.code}:${index}`} className={`is-${item.severity}`}><b>L{item.line}:{item.column} [{item.code}]</b><span>{item.message}</span>{item.suggestion && <small>建议：{item.suggestion}</small>}</div>) : <div className="rule-agent-pass">✓ 语法检查通过</div>}</div></>}
      {section === 'test' && <><div className="rule-agent-heading"><strong>隔离运行测试</strong><button type="button" onClick={() => void send('测试当前规则的运行效果')} disabled={busy}>运行测试</button></div>{testResult ? <div className="rule-agent-tests">{testResult.scenarios.map((item) => <div key={item.name} className={item.passed ? 'passed' : 'failed'}><b>{item.passed ? '✓' : '×'} {item.name}</b>{item.details.map((detail) => <span key={detail}>{detail}</span>)}</div>)}{testResult.mockedEffects.length > 0 && <details open><summary>Mock 副作用 ({testResult.mockedEffects.length})</summary>{testResult.mockedEffects.map((item, index) => <span key={index}>{item.type} · {item.detail}</span>)}</details>}</div> : <Empty text="测试在克隆状态中运行，不会提交数据、请求 API 或启动真实流程。" />}</>}
      {section === 'state' && <><div className="rule-agent-heading"><strong>表单状态</strong><span className={`rule-agent-source ${visibleRuntime.source}`}>{visibleRuntime.source === 'live' ? '实时预览' : '设计默认值'}</span></div><p className="rule-agent-security">敏感字段已自动脱敏 · {new Date(visibleRuntime.capturedAt).toLocaleTimeString()}</p><div className="rule-agent-state-list">{stateRows.length ? stateRows.map(([field, value]) => <div key={field}><b>{field}</b><code>{typeof value === 'object' && value && 'masked' in value ? '••••（已脱敏）' : JSON.stringify(value)}</code></div>) : <Empty text="当前表单没有可读取的字段值。" />}</div></>}
      {error && <div className="rule-agent-error">{error}</div>}
    </div>
  </aside>;
}

function Empty({ text }: { text: string }) { return <div className="rule-agent-empty-state">{text}</div>; }
