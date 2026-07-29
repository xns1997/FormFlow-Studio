import { pinyin } from 'pinyin-pro';
import { PROJECT_TEMPLATES } from '../../../../../shared/project-templates';
import '../../../designer/controls';
import { getAllControls, CATEGORY_LABELS } from '../../../designer/registry';
import { DESIGN_TEMPLATES } from '../../../designer/designTemplates';
import { loadNodeRegistry, type FlowNodeSpec } from '../../../../nodes/registry';
import openapi from '../../../../../server/public/swagger.json';
import operationTemplates from '../../../../../server/public/operation-templates.json';
import {
  backendDocs,
  behaviorEventDocs,
  behaviorTopicDocs,
  formDesignDocs,
  overviewDocs,
} from '../behaviorDocs';
import type { BehaviorEventDocEntry, BehaviorTopicDocEntry } from './types';

export type DocKind = 'task' | 'troubleshooting' | 'case' | 'reference';
export type DocAudience = 'builder' | 'developer' | 'admin';
export type DocDomain = 'getting-started' | 'data' | 'forms' | 'behavior' | 'workflows' | 'templates' | 'quality' | 'delivery' | 'controls' | 'nodes' | 'events' | 'api';
export type DocSource = { kind: 'curated' | 'control-registry' | 'node-registry' | 'event-registry' | 'template-registry' | 'openapi' | 'legacy'; label: string };
export type DocAction = { type: 'navigate' | 'copy'; label: string; href?: string; value?: string };
export type DocBlock = {
  id: string;
  title: string;
  body?: string;
  fields?: Array<{ name: string; type: string; description: string }>;
  examples?: Array<{ title: string; code: string }>;
};
export type DocEntry = {
  id: string;
  slug: string;
  canonicalPath: string;
  kind: DocKind;
  domain: DocDomain;
  stage?: string;
  title: string;
  summary: string;
  aliases: string[];
  tags: string[];
  audiences: DocAudience[];
  source: DocSource;
  blocks: DocBlock[];
  relatedIds: string[];
  actions?: DocAction[];
  updatedAt: string;
};
export type DocSearchDocument = DocEntry & { searchableText: string; pinyinText: string; initials: string };
export type DocSearchResult = { entry: DocEntry; score: number; snippet: string; matchedTerms: string[] };
export type DocUserState = {
  version: number;
  favorites: string[];
  recent: string[];
  taskProgress: Record<string, boolean>;
  updatedAt: string;
};
export type DocFeedbackEvent = {
  type: 'search' | 'open' | 'feedback';
  docId?: string;
  resultCount?: number;
  latencyMs?: number;
  outcome?: 'clicked' | 'abandoned' | 'rewritten';
  category?: 'helpful' | 'not-helpful' | 'missing' | 'outdated' | 'unclear' | 'example-error';
};

const UPDATED_AT = '2026-07-29';
const curatedTechnicalSpecs: Array<[string, string, string, DocDomain, string[]]> = [
  ['project-creation-spec', '项目创建与交付规范', '从创建、导入、设计、测试到交付的标准流程。', 'delivery', ['项目创建', '交付', '质量门禁']],
  ['behavior-rule-syntax', '规则语法 Reference', 'Behavior Rule DSL 的语法、动作、表达式和确定性校验规则。', 'behavior', ['DSL', 'rule', 'lint']],
  ['llm-tools-mcp', '大模型工具与 MCP', '七个专职 MCP 的角色、工具发现、revision、幂等、确认与发布门禁。', 'api', ['MCP', 'LLM tools', 'agent']],
  ['plugin-api', 'Plugin API', '插件清单、节点注册、生命周期、配置和持久化接口。', 'api', ['plugin', '插件', 'manifest']],
  ['llm-provider', '通用大模型 Provider', '模型 Provider、受控工具、会话权限和部署接口。', 'api', ['LLM', 'Provider', '模型']],
  ['pgvector', 'pgvector 向量检索', '知识分块、Embedding、健康检查与降级模式。', 'api', ['pgvector', 'embedding', '知识检索']],
  ['operation-templates', '模板化操作中心', '录入、维护、跨表、分析和预测操作模板的选择与使用。', 'templates', ['模板中心', 'CRUD', '分析模板']],
];
const curatedTechnicalDocs: DocEntry[] = curatedTechnicalSpecs.map(([slug, title, summary, domain, aliases]) => ({
  id: `guide:${slug}`, slug, canonicalPath: `/docs/reference/${domain}/${slug}`, kind: 'reference' as const,
  domain, title, summary, aliases, tags: ['精选手册', ...aliases],
  audiences: domain === 'api' ? ['developer', 'admin'] : ['builder', 'developer'],
  source: { kind: 'curated' as const, label: `docs/${slug}.md` }, relatedIds: [], updatedAt: UPDATED_AT,
  blocks: [
    { id: 'overview', title: '内容概览', body: summary },
    { id: 'usage', title: '如何使用', body: '从本文确认适用范围和前置条件，再按顺序执行；遇到错误时优先遵循页面中的确定性校验与安全门禁。' },
    { id: 'source', title: '权威来源', body: `本页对应仓库用户手册 docs/${slug}.md，并纳入统一搜索、导航和内容覆盖检查。` },
  ],
}));
const stageSpecs = [
  ['understand-create', '认识与创建', '了解 FormFlow，并创建可继续配置的项目。', 'getting-started', ['项目', '创建', '入门']],
  ['import-model', '导入与建模', '导入 Excel、CSV 或 JSON，确认字段类型并配置稳定主键。', 'data', ['导入 Excel', '主键', '字段类型']],
  ['generate-design', '生成与设计表单', '从数据生成表单，配置控件、布局、校验和数据绑定。', 'forms', ['表单', '控件', '数据绑定']],
  ['behavior-workflow', '行为与流程', '用规则和流程实现字段联动、查询、回填与提交。', 'behavior', ['字段联动', '流程调用', '规则']],
  ['apply-templates', '模板应用', '使用项目模板和操作模板快速搭建常见业务。', 'templates', ['模板', 'CRUD', '审批']],
  ['test-quality', '测试与质量', '使用测试运行、Mock、质量检查和诊断修复问题。', 'quality', ['测试', '质量', '排错']],
  ['use-export', '使用与导出', '运行表单、查询数据并导出 Excel、CSV 或 JSON。', 'delivery', ['运行', '导出', '使用模式']],
  ['package-release', '打包与发布', '校验项目包、预览发布影响并完成受控交付。', 'delivery', ['打包', '发布', 'release']],
] as const;

function taskEntry(spec: typeof stageSpecs[number]): DocEntry {
  const [slug, title, summary, domain, tags] = spec;
  const troubleshootingByStage: Record<string, string> = {
    'import-model': 'troubleshooting:primary-key-conflict',
    'generate-design': 'troubleshooting:submit-validation',
    'behavior-workflow': 'troubleshooting:field-linkage',
    'test-quality': 'troubleshooting:submit-validation',
    'package-release': 'troubleshooting:release-blocked',
  };
  return {
    id: `task:${slug}`, slug, canonicalPath: `/docs/tasks/${slug}`, kind: 'task', domain,
    stage: slug, title, summary, aliases: [...tags, ...(slug === 'import-model' ? ['主键冲突'] : [])], tags: [...tags, '任务指南'], audiences: ['builder'],
    source: { kind: 'curated', label: 'FormFlow 使用指南' },
    relatedIds: troubleshootingByStage[slug] ? [troubleshootingByStage[slug]] : [], updatedAt: UPDATED_AT,
    actions: [{ type: 'navigate', label: '返回项目', href: '/projects' }],
    blocks: [
      { id: 'goal', title: '目标', body: summary },
      { id: 'prerequisites', title: '开始前', body: slug === 'understand-create' ? '准备一个清晰的业务目标。其余阶段需要已有项目，并先保存当前修改。' : '确认项目已打开且当前修改已保存；涉及数据写回时，先配置非空且唯一的主键。' },
      { id: 'steps', title: '操作步骤', body: taskSteps[slug] },
      { id: 'done', title: '完成检查', body: taskChecks[slug] },
      { id: 'troubleshooting', title: '常见问题与排错', body: taskTroubleshooting[slug] },
      { id: 'related', title: '关联参考', body: `继续在功能参考中查看“${tags.join('、')}”；遇到阻断时从排错分类进入最接近的错误现象。` },
      { id: 'try', title: '安全试玩', body: '示例只用于检查配置形状或复制，不会写入当前项目。', examples: [{ title: '任务检查清单', code: JSON.stringify({ task: slug, saved: true, validated: true, projectMutation: false }, null, 2) }] },
    ],
  };
}

const taskSteps: Record<string, string> = {
  'understand-create': '1. 从项目列表选择“新建项目”。\n2. 填写可识别的名称和用途。\n3. 选择空白项目或与业务接近的模板。\n4. 进入编辑器，确认项目名称和工作模式正确。',
  'import-model': '1. 进入数据工作区并导入文件。\n2. 核对 Sheet、表头、样本值和推断类型。\n3. 选择业务稳定字段作为主键，并运行唯一性校验。\n4. 修复空值或重复值后保存数据配置。',
  'generate-design': '1. 从目标数据表生成表单。\n2. 核对显示名称与保存字段。\n3. 配置必填、格式和数据绑定。\n4. 在预览中完成一次有效填写。',
  'behavior-workflow': '1. 先用可视化规则实现简单联动。\n2. 需要多步处理时创建流程并连接输入输出。\n3. 将按钮或事件绑定到目标流程。\n4. 用确定性 lint 和测试运行验证。',
  'apply-templates': '1. 打开模板中心并按用途搜索。\n2. 检查模板要求的数据表、主键和字段。\n3. 完成字段映射并预览将创建的内容。\n4. 应用后运行质量检查。',
  'test-quality': '1. 生成覆盖关键路径的 Mock 数据。\n2. 在测试运行中执行正常、空值和边界场景。\n3. 打开质量页修复 error，再处理 warning。\n4. 重新运行回归并保存结果。',
  'use-export': '1. 进入使用模式完成一次真实操作。\n2. 检查查询、筛选、分页和写回。\n3. 选择导出格式与范围。\n4. 下载并打开结果，核对列和行数。',
  'package-release': '1. 运行项目包校验。\n2. 修复所有阻断问题。\n3. 使用发布预览检查版本和影响。\n4. 在明确确认后执行交付或发布。',
};
const taskChecks: Record<string, string> = Object.fromEntries(stageSpecs.map(([slug]) => [slug, '页面没有阻断错误；关键操作可重复执行；重新打开项目后配置仍然存在；相关数据、表单或输出可在预期位置找到。']));
const taskTroubleshooting: Record<string, string> = {
  'understand-create': '无法创建时，先检查名称是否为空、当前模式是否需要登录，以及项目列表是否仍在加载。',
  'import-model': '导入失败时检查文件类型、大小和表头；无法写回通常是主键为空、重复或字段映射失效。',
  'generate-design': '字段不显示时检查控件显隐、数据绑定路径和容器层级；校验不生效时检查是否绑定了保存字段。',
  'behavior-workflow': '联动不生效时依次检查事件、字段 ID、规则 lint、流程绑定和运行日志，不要直接改写内部 JSON。',
  'apply-templates': '模板不可用通常源于缺少目标表、主键或必需字段；根据原位诊断补齐后重新预览。',
  'test-quality': '测试不稳定时固定 Mock 种子并区分数据问题、规则问题和流程连接问题。',
  'use-export': '导出为空时确认当前筛选范围、流程输出和目标格式；写回冲突时刷新最新 revision 后重新执行。',
  'package-release': '发布被阻止时先查看校验和发布预览；删除、覆盖和发布必须完成单独确认。',
};

const troubleshootingSpecs = [
  ['primary-key-conflict', '处理主键冲突', '导入、保存或写回时出现空主键、重复主键或 revision 冲突。', 'data', ['主键冲突', '重复值', '写回失败']],
  ['excel-import-failed', 'Excel 导入失败', '定位文件格式、表头、工作表、体积或类型推断造成的导入问题。', 'data', ['导入 Excel', 'xlsx', '表头']],
  ['submit-validation', '提交校验没有通过', '按控件、字段绑定、规则和服务端错误的顺序定位提交阻断。', 'quality', ['提交校验', '必填', '校验失败']],
  ['field-linkage', '字段联动不生效', '检查事件名、字段 ID、规则语法、控件句柄和刷新时机。', 'behavior', ['字段联动', 'onChange', '规则']],
  ['workflow-call', '流程调用失败', '检查事件绑定、节点端口、必填参数、运行日志和错误分支。', 'workflows', ['流程调用', '节点错误', '端口']],
  ['release-blocked', '发布被质量门禁阻止', '从项目包校验、来源过期、权限、revision 与确认要求定位问题。', 'delivery', ['发布', '门禁', 'revision']],
  ['mcp-tool-call', 'MCP 工具调用失败', '检查角色工具发现、租户与用户上下文、幂等键、revision 和确认令牌。', 'api', ['MCP', 'tool', 'confirmation']],
] as const;

const troubleshootingDocs: DocEntry[] = troubleshootingSpecs.map(([slug, title, summary, domain, aliases]) => ({
  id: `troubleshooting:${slug}`, slug, canonicalPath: `/docs/troubleshooting/${slug}`, kind: 'troubleshooting',
  domain, title, summary, aliases: [...aliases], tags: ['排错', ...aliases], audiences: ['builder', 'developer', 'admin'],
  source: { kind: 'curated', label: 'FormFlow 排错手册' }, relatedIds: [], updatedAt: UPDATED_AT,
  blocks: [
    { id: 'symptoms', title: '现象与边界', body: summary },
    { id: 'checks', title: '按顺序检查', body: '1. 保留当前页面与错误信息，不要重复提交。\n2. 检查页面原位诊断和最近一次运行日志。\n3. 核对稳定 ID、数据主键、必填参数和连接端口。\n4. 云模式再核对租户、权限、revision、幂等键与确认令牌。' },
    { id: 'recovery', title: '恢复与验证', body: '修正最早出现的阻断问题后重新运行最小场景；确认成功后再恢复完整数据和后续步骤。' },
  ],
}));

const caseSpecs = [
  ['customer-intake', '客户资料录入与校验', '从 Excel 客户表生成录入表单，配置手机号校验、重复主键检查和提交反馈。', 'forms', ['客户录入', 'Excel', '校验']],
  ['inventory-maintenance', '库存查询与安全修改', '用查询修改模板定位库存记录，通过 revision 检查后安全写回。', 'data', ['库存', '查询修改', '并发']],
  ['approval-linkage', '字段联动与审批流程', '根据金额和类型联动字段，并将提交事件连接到审批流程。', 'behavior', ['审批', '字段联动', '流程']],
  ['analysis-release', '分析看板测试与发布', '使用分析模板生成看板，完成质量检查、导出和受控发布。', 'delivery', ['分析看板', '测试', '发布']],
] as const;

const caseDocs: DocEntry[] = caseSpecs.map(([slug, title, summary, domain, aliases]) => ({
  id: `case:${slug}`, slug, canonicalPath: `/docs/cases/${slug}`, kind: 'case', domain,
  title, summary, aliases: [...aliases], tags: ['案例', ...aliases], audiences: ['builder', 'developer'],
  source: { kind: 'curated', label: 'FormFlow 场景案例' }, relatedIds: [], updatedAt: UPDATED_AT,
  blocks: [
    { id: 'scenario', title: '业务场景', body: summary },
    { id: 'build', title: '搭建路径', body: '先建立稳定数据模型，再生成表单；简单联动使用规则，多步处理使用流程；最后以正常、空值和冲突数据完成测试。' },
    { id: 'acceptance', title: '验收要点', body: '目标用户能完成核心任务；错误有原位说明和恢复路径；重新打开后配置与数据一致；交付前没有阻断级质量问题。' },
  ],
}));

function templateEntries(): DocEntry[] {
  const projects = PROJECT_TEMPLATES.map((template) => ({
    id: `template:project:${template.id}`, slug: `project-${template.id}`,
    title: template.name, summary: template.description, aliases: [template.id, ...template.highlights],
    tags: ['项目模板', template.kind, ...template.highlights], sourceLabel: '项目模板注册表',
    fields: template.highlights.map((highlight) => ({ name: highlight, type: '能力', description: '模板内置能力' })),
  }));
  const designs = DESIGN_TEMPLATES.map((template) => ({
    id: `template:design:${template.key}`, slug: `design-${template.key}`,
    title: template.label, summary: template.description, aliases: [template.key, template.formMode],
    tags: ['表单模板', template.formMode], sourceLabel: '表单模板注册表',
    fields: [{ name: 'formMode', type: '模式', description: template.formMode }],
  }));
  const operations = operationTemplates.map((template) => ({
    id: `template:operation:${template.id}`, slug: `operation-${template.id}`,
    title: template.name, summary: template.description, aliases: [template.id, template.category],
    tags: ['操作模板', template.category], sourceLabel: '操作模板注册表',
    fields: [{ name: 'category', type: '分类', description: template.category }],
  }));
  return [...projects, ...designs, ...operations].map((template) => ({
    id: template.id, slug: template.slug, canonicalPath: `/docs/reference/templates/${template.slug}`,
    kind: 'reference', domain: 'templates', title: template.title, summary: template.summary,
    aliases: template.aliases, tags: template.tags, audiences: ['builder', 'developer'],
    source: { kind: 'template-registry', label: template.sourceLabel }, relatedIds: ['task:apply-templates'], updatedAt: UPDATED_AT,
    blocks: [
      { id: 'overview', title: '模板用途', body: template.summary },
      { id: 'capabilities', title: '能力与要求', fields: template.fields },
      { id: 'apply', title: '应用步骤', body: '在模板中心选择此模板，完成数据表与字段映射，预览生成内容后应用，并运行质量检查。' },
    ],
  }));
}

function legacyTopic(doc: BehaviorTopicDocEntry, domain: DocDomain): DocEntry {
  return {
    id: doc.id, slug: doc.slug, canonicalPath: `/docs/reference/${domain}/${doc.slug}`,
    kind: 'reference', domain, title: doc.title, summary: doc.summary, aliases: [], tags: [doc.category || domain],
    audiences: domain === 'api' ? ['developer', 'admin'] : ['builder'], source: { kind: 'legacy', label: '现有产品文档' },
    relatedIds: [], updatedAt: UPDATED_AT,
    blocks: doc.sections.map((section, index) => ({
      id: `section-${index}`, title: section.title, body: section.body,
      fields: section.fields?.map((field) => ({ name: field.name, type: field.type, description: field.description })),
      examples: section.examples,
    })),
  };
}

function eventEntry(doc: BehaviorEventDocEntry): DocEntry {
  return {
    id: `event:${doc.scope}:${doc.eventName}`, slug: doc.slug,
    canonicalPath: `/docs/reference/events/${doc.slug}`, kind: 'reference', domain: 'events',
    title: doc.title, summary: doc.summary, aliases: [doc.eventName], tags: [doc.category, ...(doc.tags || [])],
    audiences: ['builder', 'developer'], source: { kind: 'event-registry', label: '行为事件注册表' },
    relatedIds: doc.relatedEvents.map((name) => `event:${doc.scope}:${name}`), updatedAt: UPDATED_AT,
    blocks: [
      { id: 'trigger', title: '触发时机', body: doc.triggerWhen },
      { id: 'detail', title: '事件数据', fields: doc.detailFields },
      { id: 'api', title: '可用 API', fields: doc.apis.map((api) => ({ name: api.name, type: api.signature, description: api.description })) },
      { id: 'examples', title: '示例', examples: doc.examples },
      { id: 'tips', title: '最佳实践', body: doc.suggestions.join('\n') },
    ],
  };
}

function controlEntries(): DocEntry[] {
  return getAllControls().map((control) => ({
    id: `control:${control.type}`, slug: control.type,
    canonicalPath: `/docs/reference/controls/${control.type}`, kind: 'reference', domain: 'controls',
    title: control.label, summary: `${CATEGORY_LABELS[control.category]}控件：查看属性、事件、默认值和使用建议。`,
    aliases: [control.type], tags: [CATEGORY_LABELS[control.category], '控件'], audiences: ['builder', 'developer'],
    source: { kind: 'control-registry', label: '控件注册表' }, relatedIds: [], updatedAt: UPDATED_AT,
    blocks: [
      {
        id: 'properties', title: '属性',
        fields: control.propSchema.map((property) => ({
          name: property.key, type: 'kind' in property ? property.editor : property.type,
          description: property.help || property.label,
        })),
      },
      {
        id: 'events', title: '事件',
        fields: control.eventSchema.map((event) => ({ name: event.key, type: 'event', description: event.description || event.label })),
      },
      { id: 'defaults', title: '默认值', examples: [{ title: '默认属性', code: JSON.stringify(control.defaultProps, null, 2) }] },
    ],
  }));
}

function nodeEntry(spec: FlowNodeSpec): DocEntry {
  const inputs = spec.ports.filter((port) => port.direction === 'input' || port.direction === 'both');
  const outputs = spec.ports.filter((port) => port.direction === 'output' || port.direction === 'both');
  return {
    id: `node:${spec.id}`, slug: encodeURIComponent(spec.id), canonicalPath: `/docs/reference/nodes/${encodeURIComponent(spec.id)}`,
    kind: 'reference', domain: 'nodes', title: spec.label, summary: spec.description,
    aliases: [spec.id, spec.originalName || '', ...(spec.keywords || [])].filter(Boolean),
    tags: [spec.category, spec.kind, '流程节点'], audiences: ['builder', 'developer'],
    source: { kind: 'node-registry', label: '流程节点注册表' }, relatedIds: [], updatedAt: UPDATED_AT,
    blocks: [
      { id: 'inputs', title: '输入端口', fields: inputs.map((port) => ({ name: port.name, type: port.type, description: `${port.required ? '必填。' : ''}${port.description}` })) },
      { id: 'outputs', title: '输出端口', fields: outputs.map((port) => ({ name: port.name, type: port.type, description: port.description })) },
      { id: 'properties', title: '参数', fields: spec.properties.map((property) => ({ name: property.name, type: property.type, description: property.description })) },
      { id: 'usage', title: '使用建议', body: `在画布中搜索“${spec.label}”，连接类型兼容的端口，配置必填参数后再运行测试。` },
    ],
    actions: [{ type: 'navigate', label: '在流程设计器中查找', href: `/?node=${encodeURIComponent(spec.id)}` }],
  };
}

function openapiEntries(): DocEntry[] {
  const paths = (openapi as any).paths || {};
  return Object.entries(paths).flatMap(([path, operations]: [string, any]) =>
    Object.entries(operations).filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method)).map(([method, operation]: [string, any]) => {
      const slug = `${method}-${path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
      return {
        id: `api:${method}:${path}`, slug, canonicalPath: `/docs/reference/api/${slug}`,
        kind: 'reference' as const, domain: 'api' as const, title: `${method.toUpperCase()} ${path}`,
        summary: operation.summary || operation.description || 'FormFlow HTTP API',
        aliases: [operation.operationId || '', path], tags: ['API', method.toUpperCase(), ...(operation.tags || [])],
        audiences: ['developer', 'admin'] as DocAudience[], source: { kind: 'openapi' as const, label: 'OpenAPI 3.1' },
        relatedIds: [], updatedAt: UPDATED_AT,
        blocks: [
          { id: 'description', title: '说明', body: operation.description || operation.summary || '查看请求参数与响应定义。' },
          { id: 'parameters', title: '参数', fields: (operation.parameters || []).map((parameter: any) => ({ name: parameter.name, type: parameter.in, description: parameter.description || (parameter.required ? '必填' : '可选') })) },
          { id: 'responses', title: '响应', fields: Object.entries(operation.responses || {}).map(([code, response]: [string, any]) => ({ name: code, type: 'HTTP', description: response.description || '响应' })) },
        ],
      } satisfies DocEntry;
    }));
}

let cached: DocEntry[] | null = null;
export async function loadDocCatalog(): Promise<DocEntry[]> {
  if (cached) return cached;
  const registry = await loadNodeRegistry();
  const legacy = [
    ...overviewDocs.map((doc) => legacyTopic(doc, 'getting-started')),
    ...behaviorTopicDocs.map((doc) => legacyTopic(doc, 'behavior')),
    ...backendDocs.map((doc) => legacyTopic(doc, 'api')),
  ];
  const existingFormNarrative = new Map(formDesignDocs.filter((doc) => doc.id !== 'form-design:form').map((doc) => [doc.slug, doc]));
  const controls = controlEntries().map((entry) => {
    const narrative = existingFormNarrative.get(entry.slug);
    return narrative ? { ...entry, blocks: [...entry.blocks, ...legacyTopic(narrative, 'controls').blocks.filter((block) => block.id !== 'section-0')] } : entry;
  });
  const collected = [
    ...stageSpecs.map(taskEntry), ...troubleshootingDocs, ...caseDocs, ...curatedTechnicalDocs, ...templateEntries(), ...legacy, ...controls,
    ...behaviorEventDocs.map(eventEntry), ...registry.specs.map(nodeEntry), ...openapiEntries(),
  ];
  const seenPaths = new Set<string>();
  cached = collected.filter((entry) => {
    if (seenPaths.has(entry.canonicalPath)) return false;
    seenPaths.add(entry.canonicalPath);
    return true;
  });
  return cached;
}

function normalize(value: string) {
  return value.toLocaleLowerCase().normalize('NFKC').replace(/[_./:{}()[\]-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function flatten(entry: DocEntry) {
  return [
    entry.title, entry.summary, ...entry.aliases, ...entry.tags,
    ...entry.blocks.flatMap((block) => [block.title, block.body || '', ...(block.fields || []).flatMap((field) => [field.name, field.type, field.description]), ...(block.examples || []).flatMap((example) => [example.title, example.code])]),
  ].join(' ');
}
export function buildSearchIndex(entries: DocEntry[]): DocSearchDocument[] {
  return entries.map((entry) => {
    const searchableText = normalize(flatten(entry));
    const fullPinyin = pinyin(searchableText, { toneType: 'none', type: 'array' });
    const spacedPinyin = normalize(fullPinyin.join(' '));
    return {
      ...entry, searchableText,
      pinyinText: `${spacedPinyin} ${spacedPinyin.replace(/\s+/g, '')}`,
      initials: normalize(pinyin(searchableText, { pattern: 'first', toneType: 'none', type: 'array' }).join('')),
    };
  });
}
function fuzzyIncludes(haystack: string, needle: string) {
  if (haystack.includes(needle)) return true;
  let cursor = 0;
  for (const char of haystack) if (char === needle[cursor]) cursor += 1;
  return cursor === needle.length;
}
export function searchDocs(index: DocSearchDocument[], query: string, filters?: { kind?: DocKind; domain?: DocDomain }): DocSearchResult[] {
  const terms = normalize(query).split(' ').filter(Boolean);
  if (!terms.length) return [];
  const started = performance.now();
  const results = index.flatMap((entry) => {
    if (filters?.kind && entry.kind !== filters.kind) return [];
    if (filters?.domain && entry.domain !== filters.domain) return [];
    const title = normalize(entry.title);
    const aliases = normalize(entry.aliases.join(' '));
    let score = entry.kind === 'task' ? 18 : entry.audiences.includes('builder') ? 8 : 0;
    for (const term of terms) {
      const exactTitle = title.includes(term);
      const exactAlias = aliases.includes(term);
      const textMatch = entry.searchableText.includes(term);
      const pinyinMatch = entry.pinyinText.includes(term) || entry.initials.includes(term);
      const fuzzy = fuzzyIncludes(title, term) || fuzzyIncludes(aliases, term);
      if (!exactTitle && !exactAlias && !textMatch && !pinyinMatch && !fuzzy) return [];
      score += exactTitle ? 100 : exactAlias ? 80 : textMatch ? 35 : pinyinMatch ? 22 : 10;
    }
    const snippetSource = entry.summary || entry.blocks.find((block) => block.body)?.body || '';
    return [{ entry, score, snippet: snippetSource.slice(0, 180), matchedTerms: terms }];
  }).sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'zh-CN'));
  void started;
  return results;
}

export function findDoc(entries: DocEntry[], kindOrDomain: string | undefined, slug: string | undefined) {
  if (!slug) return undefined;
  const decoded = decodeURIComponent(slug);
  return entries.find((entry) => entry.slug === slug || entry.slug === decoded || entry.id === `node:${decoded}`)
    && entries.find((entry) => (entry.slug === slug || entry.slug === decoded || entry.id === `node:${decoded}`)
      && (!kindOrDomain || entry.kind === kindOrDomain || entry.domain === kindOrDomain));
}
