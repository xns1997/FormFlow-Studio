import { listFormFlowTools, MCP_ROLE_CATALOG, type McpRole } from './formflow-tool-registry';
import type { CapabilityAgentConfig, CapabilityBundleVersion } from './project-agent-v2-store';

export type ExpertRegistryKnowledge = {
  id: string;
  title: string;
  content: string;
  source: 'system' | 'runtime' | 'bundle';
  editable: boolean;
  enabled: boolean;
};

export const SPECIALIST_BASE_PROMPT = '只处理当前任务，只使用提供的工具。固定流程：先读取目标契约、相关资源现状和未解决问题；再核对工具参数契约中的必填字段、类型、枚举、嵌套路径和资源标识；执行后重新读取受影响资源并按验收标准检查；最后只报告完成内容、业务变化、证据和未解决问题。业务参数必须来自当前项目读取结果，禁止猜测 ID、字段名或 Schema。工具参数失败时留在当前任务内，只重算失败调用的参数：逐项使用 issues、expected、received 和 suggestedArguments，必要时先调用 list/get 读取真实值；禁止原样重放或从头重做。任何删除都会暂停等待用户审批，不要把等待审批视为失败，也不要绕过审批。写入前读取最新状态，不得调用 release.apply。验收证据齐全后必须立即停止调用工具。';

export function expertEffectiveTools(bundle: CapabilityBundleVersion, role: McpRole) {
  const agent = bundle.agents.find((item) => item.role === role); const configured = agent?.tools || []; const mode = agent?.toolMode || (configured.length ? 'selected' : 'all');
  return listFormFlowTools(role).filter((tool) => tool.name !== 'release.apply' && (mode === 'all' || configured.includes(tool.name)));
}

export function specialistRoleInstructions(role: McpRole) {
  if (role === 'form') return '表单控件必须具有稳定标识和合法几何；局部修改前读取当前表单，写入后运行项目校验并预览目标表单。按钮动作必须使用有效事件或引用真实存在的工作流。';
  if (role === 'data') return '数据源操作先读取项目和数据源目录；业务行不能伪装成字段定义。可编辑表必须配置与实际列名一致的非空唯一主键，只读表必须明确声明只读。写入后检查数据源、主键和项目结构。';
  if (role === 'behavior') return '先读取真实字段、控件、数据表和流程，再读取现有行为；按参考检索、语法检查、规则测试、写入、项目校验的顺序执行。不得用示例常量或空表达式冒充业务实现。';
  if (role === 'quality') return '负责项目结构、Mock、回归场景和质量门禁；不得执行交付预检或发布操作。只接受真实项目结果和独立验收证据。';
  if (role === 'delivery') return '只处理输出、项目包校验、导出和 release.preview；不得执行质量专家任务或 release.apply。';
  if (role === 'workflow') return '工作流修改前读取现有节点、端口和连线；只引用真实资源标识，修改后验证流程结构与端口连接。';
  if (role === 'project') return '负责项目生命周期和元信息；创建或导入后必须核对项目范围，删除、覆盖等操作不得绕过确认。';
  return '';
}

export function expertTeamKnowledge(bundle: CapabilityBundleVersion, currentRole: CapabilityAgentConfig['role']) {
  const peers = bundle.agents.filter((agent) => agent.role !== currentRole).map((agent) => {
    const tools = agent.role === 'coordinator' ? [] : expertEffectiveTools(bundle, agent.role);
    return { role: agent.role, name: agent.name, responsibility: agent.description, tools: tools.map((tool) => tool.name), toolSummary: tools.slice(0, 8).map((tool) => tool.title) };
  });
  return {
    id: 'runtime:expert-team', title: '其他专家的职能与交接方式', source: 'runtime' as const, editable: false, enabled: true,
    content: `当前能力包还注册了：${peers.map((peer) => `${peer.name}（${peer.role}）：${peer.responsibility || '按角色边界处理任务'}；可用 ${peer.tools.length} 项工具${peer.toolSummary.length ? `，包括${peer.toolSummary.join('、')}` : ''}`).join('；')}。如果阻断必须由其他领域解决，不要越权调用其工具；明确报告“需要协作专家：角色、阻断原因、已完成内容、已有证据、协助后从哪里继续”。运行时会暂停当前专家、安排协助任务，并在协助验收后将结果交回当前专家继续。`,
    peers,
  };
}

export function expertTeamKnowledgePrompt(bundle: CapabilityBundleVersion, currentRole: CapabilityAgentConfig['role']) {
  return `\n团队协作知识：\n${expertTeamKnowledge(bundle, currentRole).content}`;
}

export function suggestedExpertRole(text: string, currentRole: McpRole): McpRole | undefined {
  const explicit = text.match(/需要协作专家\s*[：:]\s*(project|data|form|workflow|behavior|quality|delivery)/i)?.[1] as McpRole | undefined;
  if (explicit && explicit !== currentRole) return explicit;
  const signals: Array<[McpRole, RegExp]> = [
    ['behavior', /behavior|rule_|规则|事件|联动|脚本/i], ['workflow', /workflow|流程|节点|连线|端口/i], ['form', /form[._ ]|表单|控件|字段绑定|布局/i],
    ['data', /data_|sheet|数据源|工作表|主键|数据行/i], ['quality', /quality|project_test|mock_|质量|回归|测试证据/i], ['delivery', /release|output|package|交付|导出/i], ['project', /project\.|项目创建|项目初始化|元信息/i],
  ];
  return signals.find(([role, pattern]) => role !== currentRole && pattern.test(text))?.[0];
}

export function buildSpecialistSystemPrompt(input: { bundle: CapabilityBundleVersion; role: McpRole; runtimeContext: string; repairContext?: string }) {
  const agent = input.bundle.agents.find((item) => item.role === input.role); const rolePolicy = specialistRoleInstructions(input.role); const customKnowledge = enabledExpertKnowledgePrompt(agent);
  const repair = input.repairContext ? `\n本次是同一任务的专家修复，不是从头重做。上次执行或验收失败：${input.repairContext}\n先核对已有成果，仅修正导致失败的部分，完成后重新验证。` : '';
  return `你是 ${agent?.name || `${input.role} 专家`}。${SPECIALIST_BASE_PROMPT}总工具预算为 ${input.bundle.budget.maxToolSteps} 步。${repair}${rolePolicy ? `\n角色规范：${rolePolicy}` : ''}${expertTeamKnowledgePrompt(input.bundle, input.role)}\n能力包指令：${agent?.instructions || '无'}${customKnowledge}\n${input.runtimeContext}`;
}

function promptRegistration(bundle: CapabilityBundleVersion, agent: CapabilityAgentConfig) {
  const runtimePlaceholder = '【运行时注入：已确认目标、成功标准、当前任务、验收标准、项目范围、最新状态、依赖结果和对话摘要】';
  if (agent.role === 'coordinator') {
    const preview = `你是 ${agent.name}。根据已确认目标、需求状态、最近行动观察和可用专家能力判断下一步；存在专家阻断时优先安排其他专家解决，协助完成后恢复原专家。\n${expertTeamKnowledgePrompt(bundle, agent.role)}\n能力包指令：${agent.instructions}${enabledExpertKnowledgePrompt(agent)}\n${runtimePlaceholder}`;
    return { mode: 'runtime_template', note: '协调器在目标规划和下一步决策时使用不同结构化输出约束；此处展示两者共同的完整注册层，任务数据会在运行时填入。', preview, layers: [
      { id: 'system', title: '协调与安全策略', source: 'system', editable: false }, { id: 'team', title: '专家团队职能', source: 'runtime', editable: false }, { id: 'custom', title: '能力包提示词与知识', source: 'bundle', editable: true }, { id: 'task', title: '当前编排状态', source: 'runtime', editable: false },
    ] };
  }
  return { mode: 'runtime_template', note: '这是运行时使用的最终系统提示词模板；方括号中的任务值会在专家开始工作时替换。', preview: buildSpecialistSystemPrompt({ bundle, role: agent.role, runtimeContext: runtimePlaceholder }), layers: [
    { id: 'system', title: '通用执行与安全策略', source: 'system', editable: false }, { id: 'role', title: '领域规范', source: 'system', editable: false }, { id: 'team', title: '专家团队职能', source: 'runtime', editable: false }, { id: 'custom', title: '能力包提示词与知识', source: 'bundle', editable: true }, { id: 'task', title: '当前任务上下文', source: 'runtime', editable: false },
  ] };
}

const commonKnowledge: ExpertRegistryKnowledge[] = [
  { id: 'system:safety', title: '安全与执行边界', content: '写入前读取最新状态；不得绕过 revision、权限、破坏性确认和发布门禁；不得调用 release.apply。', source: 'system', editable: false, enabled: true },
  { id: 'runtime:goal', title: '当前目标与验收标准', content: '运行时按当前任务注入已确认目标、成功标准、任务说明和验收标准。', source: 'runtime', editable: false, enabled: true },
  { id: 'runtime:project', title: '项目当前状态', content: '运行时注入限定项目、最新 revision、依赖专家结果和对话摘要。', source: 'runtime', editable: false, enabled: true },
];

const roleKnowledge: Partial<Record<McpRole, ExpertRegistryKnowledge>> = {
  data: { id: 'system:data-contract', title: '数据建模规范', content: '可编辑数据表必须具有非空唯一主键；字段、行数据和工作表配置必须使用实时工具 Schema。', source: 'system', editable: false, enabled: true },
  form: { id: 'system:form-contract', title: '表单构建规范', content: '控件必须具有稳定标识与合法几何；修改前读取现状，写入后校验并预览。', source: 'system', editable: false, enabled: true },
  behavior: { id: 'system:behavior-contract', title: '行为规则规范', content: '先读取真实资源，再检索参考、检查语法、运行测试，最后写入并校验。', source: 'system', editable: false, enabled: true },
  quality: { id: 'system:quality-contract', title: '独立验收规范', content: '质量专家根据真实项目结构、回归场景和可读证据判断结果，不接受静态占位或专家自报完成。', source: 'system', editable: false, enabled: true },
  delivery: { id: 'system:delivery-contract', title: '交付门禁', content: '只进行结构校验、项目包生成与发布预检；自动执行永远不允许发布。', source: 'system', editable: false, enabled: true },
};

export function expertKnowledge(role: CapabilityAgentConfig['role'], agent?: CapabilityAgentConfig) {
  const builtIn = role === 'coordinator' ? commonKnowledge.slice(0, 2) : [...commonKnowledge, ...(roleKnowledge[role as McpRole] ? [roleKnowledge[role as McpRole]!] : [])];
  return [...builtIn, ...(agent?.knowledge || []).map((item) => ({ ...item, source: 'bundle' as const, editable: true }))];
}

export function enabledExpertKnowledgePrompt(agent?: CapabilityAgentConfig) {
  const items = (agent?.knowledge || []).filter((item) => item.enabled && item.content.trim());
  return items.length ? `\n能力包知识：\n${items.map((item) => `【${item.title}】${item.content}`).join('\n')}` : '';
}

export function buildExpertRegistry(bundle: CapabilityBundleVersion) {
  const catalog = new Map(MCP_ROLE_CATALOG.map((item) => [item.id, item]));
  return {
    bundle: { id: bundle.id, bundleId: bundle.bundleId, name: bundle.name, version: bundle.version, status: bundle.status, ownerId: bundle.ownerId, editable: bundle.status === 'draft' && bundle.ownerId !== 'system' },
    experts: bundle.agents.map((agent) => {
      const allTools = agent.role === 'coordinator' ? [] : listFormFlowTools(agent.role).filter((tool) => tool.name !== 'release.apply');
      const selected = new Set(agent.tools); const toolMode = agent.role === 'coordinator' ? 'none' : agent.toolMode || (selected.size ? 'selected' : 'all');
      const effectiveTools = allTools.filter((tool) => toolMode === 'all' || selected.has(tool.name));
      const role = agent.role === 'coordinator' ? undefined : catalog.get(agent.role);
      return {
        role: agent.role, name: agent.name, description: agent.description || role?.description || '', profileId: agent.profileId,
        instructions: agent.instructions, toolMode,
        tools: effectiveTools.map((tool) => ({ name: tool.name, title: tool.title, description: tool.description, risk: tool.risk, ownerRole: tool.ownerRole })),
        availableTools: allTools.map((tool) => ({ name: tool.name, title: tool.title, description: tool.description, risk: tool.risk, ownerRole: tool.ownerRole })),
        knowledge: [...expertKnowledge(agent.role, agent), expertTeamKnowledge(bundle, agent.role)], prompt: promptRegistration(bundle, agent),
      };
    }),
  };
}
