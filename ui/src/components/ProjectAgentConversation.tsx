import React from 'react';
import MarkdownContent from './MarkdownContent';
import type { ProjectAgentQuestion } from './projectAgentUiModel';

export interface ProjectAgentConversationMessage { id: string; role: 'user' | 'assistant'; content: string; createdAt?: string; }

function messageTime(value?: string) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''; }

export default function ProjectAgentConversation({ messages, questions, answers, busy, onAnswer, onSubmitAnswers, onUseExample }: {
  messages: ProjectAgentConversationMessage[]; questions: ProjectAgentQuestion[]; answers: Record<string, string>; busy: boolean;
  onAnswer(questionId: string, answer: string): void; onSubmitAnswers(): void; onUseExample(): void;
}) {
  const answered = questions.filter((question) => answers[question.id]?.trim()).length;
  return <section className="project-agent-conversation" aria-label="项目智能体对话">
    {!messages.length && <article className="project-agent-welcome-card"><span>✦</span><div><strong>描述你要创建或改造的项目</strong><p>根智能体会先只读检查已有状态；只有真正影响方案的未知项才会向你提问。</p><button type="button" onClick={onUseExample}>试用员工管理示例</button></div></article>}
    {questions.length > 0 && <article className="project-agent-decision-card"><header><div><strong>需要你的决策</strong><small>已回答 {answered}/{questions.length}</small></div><span>统一提交</span></header>{questions.map((question, index) => <fieldset key={question.id}><legend><b>{index + 1}. {question.header}</b><span>{question.question}</span></legend>{question.kind === 'choice' && question.options?.length ? <div className="project-agent-decision-options">{question.options.map((option) => <button type="button" key={option.label} className={answers[question.id] === option.label ? 'selected' : ''} aria-pressed={answers[question.id] === option.label} onClick={() => onAnswer(question.id, option.label)}><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</button>)}</div> : <textarea rows={2} value={answers[question.id] || ''} onChange={(event) => onAnswer(question.id, event.target.value)} placeholder="输入你的决定" />}</fieldset>)}<footer><span>答案会作为一条完整消息发送，不会逐项打断规划。</span><button type="button" disabled={busy || answered !== questions.length} onClick={onSubmitAnswers}>提交全部答案</button></footer></article>}
    {messages.map((message) => <article key={message.id} className={`project-agent-message-card ${message.role}`}><header><div><span className="project-agent-message-icon">{message.role === 'user' ? '你' : 'AI'}</span><strong>{message.role === 'user' ? '你的需求' : '智能体回复'}</strong></div>{message.createdAt && <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>}</header><MarkdownContent content={message.content} className="project-agent-message-content" /></article>)}
  </section>;
}
