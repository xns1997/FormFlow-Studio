import { listFormFlowTools } from '../services/llm-tools';
import { compactAgentToolResult } from '../services/project-agent-v2-context';
import { compactProjectStateCheck, type ProjectStateCheckSummary } from '../services/project-agent-state-check';
import { nextActionSchema, parseNextActionDecision, validateNextActionDecision, PROJECT_AGENT_ROLES } from '../services/project-agent-actions';
import { appendAgentEvent, getCapabilityBundle, sessionProjectIds, type AgentSessionV2, type AgentPlanRevision, type NextActionDecision } from '../services/project-agent-v2-store';
import { chat } from './llm-client';
import type { RunContext } from './types';
import { enabledExpertKnowledgePrompt, expertTeamKnowledgePrompt } from '../services/project-agent-expert-registry';
import type { LlmMessage } from '../services/llm-provider-client';

const planningErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

function nextActionPrompt(session: AgentSessionV2, plan: AgentPlanRevision, stepIndex: number, questionReview?: { candidateQuestions: unknown; state: ProjectStateCheckSummary }) {
  const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!;
  const coordinator = bundle.agents.find((agent) => agent.role === 'coordinator');
  const toolOwnership = Object.fromEntries(PROJECT_AGENT_ROLES.map((role) => {
    const agent = bundle.agents.find((item) => item.role === role); const configured = agent?.tools || []; const mode = agent?.toolMode || (configured.length ? 'selected' : 'all');
    return [role, listFormFlowTools(role).filter((tool) => tool.name !== 'release.apply' && (mode === 'all' || configured.includes(tool.name))).map((tool) => ({ name: tool.name, risk: tool.risk }))];
  }));
  const requirements = (session.requirements || []).map((item) => ({ statement: item.statement, acceptance: item.acceptanceScenarios, risk: item.risk, status: item.capabilityStatus, evidenceCount: item.evidenceArtifactIds.length }));
  const observations = (session.observations || []).slice(-16).map((item) => ({ status: item.status, action: item.action, summary: item.summary, changes: item.changes, evidence: item.evidence, unresolved: item.unresolved, error: item.error }));
  const recentUserContext = session.messages.filter((item) => item.role === 'user').slice(-4).map((item) => item.content);
  const failures = plan.tasks.filter((task) => ['failed', 'blocked'].includes(task.status)).map((task) => ({ expert: task.role, action: task.title, error: task.error, category: task.failureClass, assistance: task.assistance ? { status: task.assistance.status, reason: task.assistance.reason, triedExperts: task.assistance.triedRoles } : undefined }));
  const assistance = plan.tasks.filter((task) => task.status === 'blocked' && task.assistance?.status === 'needed').map((task) => ({ blockedExpert: task.role, blockedAction: task.title, reason: task.assistance!.reason, preferredHelper: task.assistance!.requestedRole, triedExperts: task.assistance!.triedRoles, requirements: (task.requirementIds || []).map((id) => session.requirements?.find((item) => item.id === id)?.statement).filter(Boolean) }));
  return `你是 FormFlow 项目智能体的下一步行动协调器。根据当前真实状态选择此刻最有价值且可立即执行的行动，不要预先展开完整任务图，也不要为无事可做的专家返回 skip。action=assign 时返回一个有序 assignments 数组：可以同时分配最多 ${bundle.budget.maxParallelReads} 个互不依赖的只读任务；只要包含写任务就必须只有一个 assignment。每个任务映射现有需求并给出可观察验收证据；assignments.requirements 必须复制"需求状态"中的需求 statement，不得返回内部 ID。存在失败或阻断时，必须先调查、修复、协助或替代该项，不能跳去执行无关写入。删除操作可以规划，但运行时一定会展示影响并等待用户审批。如果存在"待专家协助"，必须优先选择一位尚未尝试且能解决根因的其他专家；preferredHelper 可用且尚未尝试时优先选择它。只分配解决阻断所需的最小协助任务，并在 assignment 中用 assistsExpert 和 assistsAction 原样复制 blockedExpert 与 blockedAction；协助完成后运行时会自动让原专家继续。质量检查只交给 quality，交付预检只交给 delivery，领域写入交给对应专家。不得新增需求、扩大项目范围、调用 release.apply 或用静态占位结果冒充证据。ask_user 是最后手段：能从项目状态、工具读取、现有目标契约或确定性校验获得的信息不得询问用户。只有用户必须作出业务取舍、提供外部秘密或扩大已确认边界时才可提问；问题必须说明已检查到的事实和仍需用户决定的内容。不可恢复时 abort。只有全部需求获得有效证据、失败已处理、写入后的质量和交付门禁通过时才 complete，并给出面向用户的 finalAnswer。
确认目标：${plan.goal}
用户原始请求：${plan.request}
成功标准：${JSON.stringify(plan.successCriteria)}
目标范围与风险：${JSON.stringify({ summary: plan.summary, assumptions: plan.assumptions, risks: plan.risks })}
需求状态：${JSON.stringify(requirements)}
需求覆盖：${JSON.stringify(session.requirementCoverage)}
限定项目：${JSON.stringify(sessionProjectIds(session))}
最近行动观察：${JSON.stringify(compactAgentToolResult(observations, 24_000))}
最近用户补充：${JSON.stringify(recentUserContext)}
当前未处理失败：${JSON.stringify(failures)}
待专家协助：${JSON.stringify(assistance)}
工具归属：${JSON.stringify(toolOwnership)}
剩余决策步数：${Math.max(0, (bundle.budget.maxDecisionSteps ?? bundle.budget.maxLoopRounds ?? 24) - stepIndex + 1)}
${questionReview ? `提问复核：你刚才准备向用户提问。运行时已按固定流程重新检查项目，请先用下列轻量摘要回答候选问题。能够自行确定时必须改为 assign 或 complete；只有摘要和可用工具仍无法解决且确需用户业务决定时才再次 ask_user。\n候选问题：${JSON.stringify(questionReview.candidateQuestions)}\n最新项目检查摘要：${JSON.stringify(compactProjectStateCheck(questionReview.state))}\n` : ''}能力包指令：${coordinator?.instructions || '无'}${enabledExpertKnowledgePrompt(coordinator)}${expertTeamKnowledgePrompt(bundle, 'coordinator')}`;
}

export async function requestNextAction(session: AgentSessionV2, plan: AgentPlanRevision, stepIndex: number, run: RunContext, questionReview?: { candidateQuestions: unknown; state: ProjectStateCheckSummary }): Promise<NextActionDecision> {
  const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!;
  const base: LlmMessage[] = [{ role: 'system', content: nextActionPrompt(session, plan, stepIndex, questionReview) }]; let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    appendAgentEvent(session, 'decision_started', { step: stepIndex, attempt });
    try {
      const messages = attempt === 1 ? base : [{ role: 'system' as const, content: '修复上一份下一步决策：只输出符合 Schema 的单个 JSON 对象。assign 只能包含当前可执行任务；多个任务必须全部只读，写任务必须独占。' }, ...base];
      const response = await chat(session, run, messages, nextActionSchema(bundle.budget.maxParallelReads, (session.requirements || []).map((item) => item.statement)), 12_000);
      const raw: any = response.structured || (() => { try { return JSON.parse((response.content || '').replace(/^```json\s*|\s*```$/g, '')); } catch { return undefined; } })();
      const result = validateNextActionDecision(parseNextActionDecision(raw, bundle.budget.maxParallelReads), session);
      appendAgentEvent(session, 'action_selected', { step: stepIndex, action: result.action, summary: result.summary, assignments: result.assignments.map((item) => ({ role: item.role, title: item.title, access: item.access })) }); return result;
    } catch (error) { lastError = error; appendAgentEvent(session, 'decision_failed', { step: stepIndex, attempt, retrying: attempt < 2, error: planningErrorMessage(error) }); }
  }
  throw lastError || new Error('下一步协调器未返回合法决策');
}
