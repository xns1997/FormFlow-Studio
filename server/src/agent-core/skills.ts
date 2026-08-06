/**
 * Distilled domain skills for the single-loop agent.
 *
 * Each MCP role owns one skill document (server/src/agent-core/skills/<role>.md)
 * that teaches the agent when to use the scope, its tool catalog, execution
 * preconditions, the standard workflow and acceptance gates. The tool catalog
 * is injected at runtime from the live registry so it never drifts from the
 * real schemas.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listFormFlowTools, MCP_ROLE_CATALOG } from '../services/formflow-tool-registry';
import type { FormFlowToolDefinition, McpRole, ToolExample, ToolRisk, ToolWrongExample } from '../services/tool-shared';
import { env } from '../config/env';
import { TOOL_CALL_GUIDANCE } from './tool-call-guidance';
import type { CapabilityBundleVersion, ScopeConfig } from './types';

const SKILLS_DIR = join(env.repositoryRoot, 'server', 'src', 'agent-core', 'skills');
const GENERAL_SKILL_PATH = join(SKILLS_DIR, 'agent-loop.md');

export interface SkillMeta {
  role: McpRole;
  title: string;
  description: string;
}

export interface DistilledSkill {
  meta: SkillMeta;
  body: string;
}

const loaded = new Map<McpRole, DistilledSkill>();

function parseSkillFile(role: McpRole): DistilledSkill {
  const raw = readFileSync(join(SKILLS_DIR, `${role}.md`), 'utf8');
  const title = raw.match(/^> 标题：(.+)$/m)?.[1]?.trim() || MCP_ROLE_CATALOG.find((entry) => entry.id === role)?.title || role;
  const description = raw.match(/^> 描述：(.+)$/m)?.[1]?.trim() || '';
  const body = raw
    .split('\n')
    .filter((line) => !line.startsWith('> 标题：') && !line.startsWith('> 描述：'))
    .join('\n')
    .trim();
  return { meta: { role, title, description }, body };
}

/** 获取角色对应技能（蒸馏提示词）。 */
export function skillFor(role: McpRole): DistilledSkill {
  let skill = loaded.get(role);
  if (!skill) {
    skill = parseSkillFile(role);
    loaded.set(role, skill);
  }
  return skill;
}

/** 通用智能体循环 skill：恒常注入，教模型动态决策、计划维护与验证闭环。 */
export function generalLoopSkill(): string {
  try {
    return readFileSync(GENERAL_SKILL_PATH, 'utf8').trim();
  } catch {
    return '';
  }
}

/** Compact catalog used by the planner and decision engine to pick a scope. */
export function skillCatalog(bundle: CapabilityBundleVersion): Array<{ role: McpRole; name: string; description: string; tools: string[] }> {
  return bundle.scopes.map((scope) => {
    const defaultSkill = skillFor(scope.role);
    const tools = effectiveScopeTools(scope);
    return {
      role: scope.role,
      name: scope.name || defaultSkill.meta.title,
      description: scope.description || defaultSkill.meta.description,
      tools: tools.map((tool) => tool.name),
    };
  });
}

const RISK_LABELS: Record<ToolRisk, string> = { read: '只读', write: '写入', destructive: '高风险' };

function toolTable(role: McpRole) {
  const tools = listFormFlowTools(role).filter((tool) => tool.name !== 'release.apply');
  const rows = tools.map((tool) => {
    const first = tool.examples?.[0];
    const returns = first?.success !== undefined ? `返回：\`${JSON.stringify(first.success)}\`` : '';
    const errors = first?.errors?.length ? `常见错误：${first.errors.map((item) => `\`${item.code}\``).join('、')}` : '';
    const extras = [returns, errors].filter(Boolean).join('；');
    const guidance = TOOL_CALL_GUIDANCE[tool.name];
    const hasDocs = (tool.examples?.length || guidance?.examples?.length) ? '✓传參/正确/错误示例齐全' : '仅传參';
    return `- \`${tool.name}\` — ${tool.title}（风险：${RISK_LABELS[tool.risk] || tool.risk}，${hasDocs}）。${tool.description}${extras ? `\n  ${extras}` : ''}`;
  });
  return rows.join('\n');
}

function schemaType(schema: any): string {
  if (!schema) return 'any';
  if (Array.isArray(schema.oneOf)) return schema.oneOf.map(schemaType).join(' 或 ');
  if (schema.enum) return `${schema.type || 'enum'}（${schema.enum.join('/')}）`;
  if (schema.type === 'array') return `array<${schema.items ? schemaType(schema.items) : 'any'}>`;
  return String(schema.type || 'any');
}

type ToolDocSource = Pick<FormFlowToolDefinition, 'name' | 'title' | 'description' | 'inputSchema' | 'risk' | 'examples'>;

function paramEntries(tool: ToolDocSource) {
  const schema = tool.inputSchema as Record<string, any>;
  const required = new Set<string>(schema.required || []);
  return Object.entries(schema.properties || {}).map(([name, property]: [string, any]) => ({
    name,
    required: required.has(name),
    type: schemaType(property),
    description: String(property?.description || ''),
  }));
}

function paramLines(tool: ToolDocSource) {
  const schema = tool.inputSchema as Record<string, any>;
  const conditional: string[] = [];
  for (const rule of schema.allOf || []) {
    const conditions = Object.entries(rule?.if?.properties || {})
      .filter(([, property]: [string, any]) => property?.const !== undefined)
      .map(([key, property]: [string, any]) => `${key}=${JSON.stringify(property.const)}`);
    if (conditions.length) conditional.push(`当 ${conditions.join(' 且 ')} 时必填：${(rule?.then?.required || []).join('、')}`);
  }
  return [
    ...paramEntries(tool).map((param) => `- \`${param.name}\`（${param.required ? '必填' : '可选'}，${param.type}）：${param.description}`),
    ...conditional,
  ];
}

interface GuidedTool {
  tool: ToolDocSource;
  correct: ToolExample[];
  wrong: ToolWrongExample[];
}

/** 把工具自带的正确示例与集中式调用指导合并，保证每个工具都有完整文档。 */
function guidedTools(role: McpRole): GuidedTool[] {
  return listFormFlowTools(role)
    .filter((tool) => tool.name !== 'release.apply')
    .map((tool) => {
      const guidance = TOOL_CALL_GUIDANCE[tool.name];
      const inlineWrong = (tool.examples || []).flatMap((example) => example.wrong || []);
      return {
        tool,
        correct: [...(tool.examples || []), ...(guidance?.examples || [])],
        wrong: [...inlineWrong, ...(guidance?.wrong || [])],
      };
    });
}

function toolDocSection({ tool, correct, wrong }: GuidedTool) {
  const parts = [
    `### \`${tool.name}\` — ${tool.title}（风险：${RISK_LABELS[tool.risk] || tool.risk}）`,
    tool.description,
    '',
    '**传參**',
    ...paramLines(tool),
  ];
  if (correct.length) {
    parts.push('', '**正确调用**（照抄结构，替换为真实 id/名称）：');
    for (const example of correct) {
      parts.push(example.summary ? `- ${example.summary}` : '-', '```json', JSON.stringify(example.arguments), '```');
    }
  }
  if (wrong.length) {
    parts.push('', '**错误调用**（禁止照抄，用于识别失败原因）：');
    for (const entry of wrong) {
      parts.push(
        `- ${entry.summary}${entry.expectedError ? ` → 预期 ${entry.expectedError}` : ''}`,
        '```json',
        JSON.stringify(entry.arguments),
        '```',
      );
    }
  }
  return parts.join('\n');
}

function toolDocs(role: McpRole) {
  const entries = guidedTools(role);
  if (!entries.length) return '';
  const blocks = entries.map(toolDocSection).join('\n\n');
  return `\n## 工具手册（每个工具：传參 / 正确调用 / 错误调用）\n\n${blocks}`;
}

export interface ToolDocParam { name: string; required: boolean; type: string; description: string; }
export interface ToolDocCall { summary: string; arguments: Record<string, any>; expectedError?: string; }
export interface ToolDoc {
  name: string; title: string; risk: ToolRisk; description: string;
  params: ToolDocParam[];
  correct: ToolDocCall[];
  wrong: ToolDocCall[];
}

/** 供专家管理页展示的结构化工具手册：传參 / 正确调用 / 错误调用。 */
export function structuredToolDocs(role: McpRole): ToolDoc[] {
  return guidedTools(role).map(({ tool, correct, wrong }) => ({
    name: tool.name,
    title: tool.title,
    risk: tool.risk,
    description: tool.description,
    params: paramEntries(tool),
    correct: correct.map((example) => ({ summary: example.summary || '正确调用示例', arguments: example.arguments })),
    wrong: wrong.map((entry) => ({ summary: entry.summary, arguments: entry.arguments, expectedError: entry.expectedError })),
  }));
}

/**
 * Full skill document for a scope: distilled markdown + live tool catalog +
 * bundle instructions/knowledge. This is injected into the LLM context when
 * the agent works inside the scope.
 */
export function skillDocument(scope: ScopeConfig, bundle: CapabilityBundleVersion): string {
  const base = skillFor(scope.role);
  const allowed = effectiveScopeTools(scope);
  const whitelist = allowed.length ? `\n本能力包只允许以下工具：${allowed.map((tool) => `\`${tool.name}\``).join('、')}` : '';
  const instructions = scope.instructions?.trim() ? `\n## 能力包指令\n${scope.instructions.trim()}` : '';
  const knowledge = (scope.knowledge || [])
    .filter((item) => item.enabled && item.content.trim())
    .map((item) => `【${item.title}】${item.content.trim()}`)
    .join('\n');
  return [
    `# Skill: ${base.meta.title}（${scope.role}）`,
    `> ${base.meta.description}`,
    '',
    base.body,
    '',
    '## 运行时工具目录',
    toolTable(scope.role),
    toolDocs(scope.role),
    whitelist,
    instructions,
    knowledge ? `\n## 能力包知识\n${knowledge}` : '',
    `\n## 当前预算\n- 决策步上限：${bundle.budget.maxDecisionSteps}；单任务尝试上限：${bundle.budget.maxAttempts}；工具步上限：${bundle.budget.maxToolSteps}；恢复周期上限：${bundle.budget.maxRecoveryCycles}。`,
  ].filter((line) => line !== '').join('\n');
}

/** 作用域可用的工具列表（含排除项）。 */
export function effectiveScopeTools(scope: ScopeConfig) {
  const all = listFormFlowTools(scope.role).filter((tool) => tool.name !== 'release.apply');
  if (scope.toolMode === 'selected') {
    const selected = new Set(scope.tools || []);
    return all.filter((tool) => selected.has(tool.name));
  }
  return all;
}
