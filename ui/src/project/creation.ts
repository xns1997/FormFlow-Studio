import {
  createColumnRecord,
  createDefaultProjectSettings,
  createDefaultTableConfig,
  normalizeProjectSettings,
  type BehaviorFile,
  type DesignComponent,
  type DesignFile,
  type ProjectStructure,
  type SrcTableEntry,
  type WorkflowFile,
} from './types';
import { createNewProject, normalizeProjectStructure } from './manager';
import { importFromZip } from './packageManager';

export type ProjectCreationMode = 'blank' | 'template' | 'zip';
export type ProjectTemplateKind = 'blank' | 'data' | 'flow';
export type ProjectTemplateId = 'blank_form' | 'data_entry' | 'approval_flow';

export interface ProjectCreationMeta {
  name: string;
  description: string;
  author: string;
  tags: string[];
}

export interface ProjectTemplateDescriptor {
  id: ProjectTemplateId;
  name: string;
  description: string;
  highlights: string[];
  kind: ProjectTemplateKind;
}

export interface ProjectWizardDraft {
  mode: ProjectCreationMode;
  selectedTemplateId?: ProjectTemplateId;
  importedProject?: ProjectStructure;
  fileName?: string;
  importedFile?: File;
  meta: {
    name: string;
    description: string;
    author: string;
    tagsInput: string;
  };
  step: 0 | 1 | 2;
  busy: boolean;
  error: string;
}

export const PROJECT_TEMPLATES: ProjectTemplateDescriptor[] = [
  {
    id: 'blank_form',
    name: '空白表单',
    description: '从一个基础表单容器开始，适合先搭界面和字段结构。',
    highlights: ['基础表单骨架', '无数据依赖', '适合从零设计'],
    kind: 'blank',
  },
  {
    id: 'data_entry',
    name: '数据录入',
    description: '内置一份空数据表结构和录入字段，适合快速开始收集数据。',
    highlights: ['示例数据表', '录入表单字段', '适合业务录入场景'],
    kind: 'data',
  },
  {
    id: 'approval_flow',
    name: '审批流',
    description: '带表单、流程和行为脚本的最小编排骨架，适合审批类项目起步。',
    highlights: ['最小流程编排', '按钮触发示例', '审批提示脚本'],
    kind: 'flow',
  },
];

function nowIso() {
  return new Date().toISOString();
}

function createFormRoot(title: string, subtitle: string, childIds: string[]): DesignComponent {
  return {
    id: 'form_root',
    type: 'form',
    x: 40,
    y: 40,
    width: 920,
    height: 620,
    zIndex: 0,
    props: { title, subtitle },
    children: childIds,
  };
}

function createDesignBase(name: string, now: string): DesignFile {
  return {
    id: `design_${Date.now()}`,
    name,
    formMode: 'create',
    viewport: { zoom: 1, panX: 0, panY: 0 },
    gridSize: 12,
    components: [],
    bindings: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createTable(
  id: string,
  fileName: string,
  headers: string[],
  preview: Record<string, unknown>[],
  uploadedAt: string,
): SrcTableEntry {
  const config = createDefaultTableConfig(id, fileName);
  return {
    id,
    fileName,
    fileSize: JSON.stringify(preview).length,
    fileType: 'json',
    uploadedAt,
    dataHash: `${id}-${preview.length}`,
    sheets: [{
      name: 'Sheet1',
      rowCount: preview.length,
      colCount: headers.length,
      headers,
      columns: headers.map((header, index) => ({
        name: header,
        index,
        dataType: 'string' as const,
        nullable: true,
        uniqueCount: preview.length,
        sampleValues: preview.slice(0, 3).map((row) => row[header]),
      })),
      preview,
      config,
    }],
    columnRecords: headers.map((header, index) => createColumnRecord(id, header, index)),
    rowRecords: preview.map((_, index) => ({
      id: `row_${id}_${index}`,
      tableId: id,
      rowIndex: index,
      highlighted: false,
      highlightColor: '',
      locked: false,
      hidden: false,
      collapsed: false,
      rowHeight: 28,
      note: '',
      tags: [],
      category: '',
      priority: 'normal',
      status: 'pending',
      lastModified: uploadedAt,
      modifiedBy: 'system',
      hasErrors: false,
      errorCount: 0,
      warningCount: 0,
    })),
  };
}

function buildBlankTemplate(): ProjectStructure {
  const project = createNewProject('空白表单项目');
  const now = nowIso();
  const design = createDesignBase('基础表单', now);
  design.components = [
    createFormRoot('空白表单', '从这里开始搭建你的业务表单', ['field_name', 'field_note', 'action_submit', 'summary_preview']),
    {
      id: 'field_name',
      type: 'text',
      x: 100,
      y: 150,
      width: 300,
      height: 68,
      zIndex: 2,
      parentId: 'form_root',
      fieldBinding: 'name',
      props: { name: 'name', label: '名称', placeholder: '请输入名称' },
    },
    {
      id: 'field_note',
      type: 'textarea',
      x: 100,
      y: 250,
      width: 420,
      height: 120,
      zIndex: 2,
      parentId: 'form_root',
      fieldBinding: 'note',
      props: { name: 'note', label: '备注', placeholder: '记录这个项目要解决什么问题' },
    },
    {
      id: 'action_submit',
      type: 'button',
      x: 100,
      y: 410,
      width: 220,
      height: 52,
      zIndex: 2,
      parentId: 'form_root',
      props: {
        name: 'submitDraft',
        label: '生成摘要',
        variant: 'primary',
        events: {
          onClick: `
            const title = String(ctx.controls.name.value || '未命名表单').trim();
            const note = String(ctx.controls.note.value || '暂无备注').trim();
            ctx.controls.summaryPreview.value = \`\${title}：\${note}\`;
            await ctx.showMessage('已更新右侧摘要', 'success');
          `,
        },
      },
    },
    {
      id: 'summary_preview',
      type: 'text',
      x: 380,
      y: 150,
      width: 380,
      height: 140,
      zIndex: 2,
      parentId: 'form_root',
      fieldBinding: 'summaryPreview',
      props: {
        name: 'summaryPreview',
        label: '摘要预览',
        content: '点击“生成摘要”后，这里会通过 ctx.controls 直接显示结果。',
      },
    },
  ];
  project.designs = [design];
  project.settings = { ...createDefaultProjectSettings(), updatedAt: now };
  project.config.updatedAt = now;
  project.config.createdAt = now;
  return project;
}

function buildDataEntryTemplate(): ProjectStructure {
  const project = createNewProject('数据录入项目');
  const now = nowIso();
  const sampleRows = [
    { 客户名称: '', 联系人: '', 状态: '草稿' },
  ];
  project.srcTable = [
    createTable('customer_leads', '客户线索.json', ['客户名称', '联系人', '状态'], sampleRows, now),
  ];
  const design = createDesignBase('客户录入表单', now);
  design.components = [
    createFormRoot('客户线索录入', '输入线索并同步到项目数据表结构', ['customer_name', 'contact_person', 'status', 'save_btn', 'status_hint']),
    {
      id: 'customer_name',
      type: 'text',
      x: 100,
      y: 140,
      width: 300,
      height: 68,
      zIndex: 2,
      parentId: 'form_root',
      fieldBinding: 'customerName',
      props: {
        name: 'customerName',
        label: '客户名称',
        placeholder: '例如：星河科技',
        events: {
          onBlur: `
            const value = String(ctx.controls.customerName.value || '').trim();
            ctx.controls.customerName.value = value;
            const hasName = value.length > 0;
            ctx.controls.saveLead.disabled = !hasName;
            ctx.controls.statusHint.value = hasName
              ? \`线索：\${value}，可继续录入联系人并保存。\`
              : '请先填写客户名称，保存按钮会在录入后自动启用。';
          `,
        },
      },
    },
    {
      id: 'contact_person',
      type: 'text',
      x: 100,
      y: 230,
      width: 300,
      height: 68,
      zIndex: 2,
      parentId: 'form_root',
      fieldBinding: 'contactPerson',
      props: { name: 'contactPerson', label: '联系人', placeholder: '例如：王敏' },
    },
    {
      id: 'status',
      type: 'select',
      x: 100,
      y: 320,
      width: 300,
      height: 68,
      zIndex: 2,
      parentId: 'form_root',
      fieldBinding: 'leadStatus',
      props: {
        name: 'leadStatus',
        label: '状态',
        options: [{ label: '草稿', value: '草稿' }, { label: '待跟进', value: '待跟进' }, { label: '已转化', value: '已转化' }],
        defaultValue: '草稿',
        events: {
          onChange: `
            const archived = ctx.value === '已转化';
            ctx.controls.contactPerson.disabled = archived;
            ctx.controls.statusHint.value = archived
              ? '该线索已转化，联系人字段已锁定。'
              : \`当前状态：\${ctx.value || '未设置'}\`;
          `,
        },
      },
    },
    {
      id: 'save_btn',
      type: 'button',
      x: 100,
      y: 420,
      width: 180,
      height: 52,
      zIndex: 2,
      parentId: 'form_root',
      props: { name: 'saveLead', label: '保存线索', variant: 'primary', disabled: true },
    },
    {
      id: 'status_hint',
      type: 'text',
      x: 430,
      y: 150,
      width: 320,
      height: 120,
      zIndex: 2,
      parentId: 'form_root',
      fieldBinding: 'statusHint',
      props: {
        name: 'statusHint',
        label: '状态提示',
        content: '请先填写客户名称，保存按钮会在录入后自动启用。',
      },
    },
  ];
  project.designs = [design];
  project.settings = { ...createDefaultProjectSettings(), updatedAt: now };
  project.config.updatedAt = now;
  project.config.createdAt = now;
  return project;
}

function buildApprovalTemplate(): ProjectStructure {
  const project = createNewProject('审批流项目');
  const now = nowIso();
  const approvalRows = [
    { 单号: 'AP-1001', 申请人: '林岚', 金额: 800, 状态: '待审批' },
    { 单号: 'AP-1002', 申请人: '陈默', 金额: 1800, 状态: '待审批' },
    { 单号: 'AP-1003', 申请人: '苏晴', 金额: 2600, 状态: '已通过' },
    { 单号: 'AP-1004', 申请人: '周原', 金额: 3200, 状态: '待审批' },
  ];
  const workflow: WorkflowFile = {
    id: 'workflow_approval_notice',
    name: '审批筛选流程',
    description: '根据输入金额筛选待审批记录，并把结果回写到右侧表格。',
    nodes: [
      {
        id: 'approval_rows',
        type: 'formflow',
        specId: 'generic:variable-input',
        position: { x: 80, y: 140 },
        data: { propertiesJson: JSON.stringify({ varName: 'rows', varType: 'array', varValue: approvalRows }) },
      },
      {
        id: 'approval_filter',
        type: 'formflow',
        specId: 'generic:filter',
        position: { x: 360, y: 140 },
        data: { propertiesJson: JSON.stringify({ field: '金额', operator: '>=', value: 1000 }) },
      },
      {
        id: 'approval_display',
        type: 'formflow',
        specId: 'generic:display-table',
        position: { x: 660, y: 140 },
        data: { propertiesJson: '{}' },
      },
    ],
    edges: [
      {
        id: 'edge_approval_filter',
        source: 'approval_rows',
        target: 'approval_filter',
        sourceHandle: 'out:value',
        targetHandle: 'in:data',
      },
      {
        id: 'edge_approval_display',
        source: 'approval_filter',
        target: 'approval_display',
        sourceHandle: 'out:result',
        targetHandle: 'in:data',
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  const behavior: BehaviorFile = {
    id: 'behavior_submit_notice',
    name: '审批按钮提示',
    event: 'onButtonClick',
    code: `if (ctx.field === 'submitApproval') {\n  ctx.showMessage?.('审批流已触发，可以继续补充节点。', 'success');\n}`,
    priority: 10,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
  const design = createDesignBase('审批表单', now);
  design.components = [
    createFormRoot('费用审批', '点击按钮后，用代码联动把筛选结果同步到右侧表格', ['request_title', 'request_amount', 'submit_approval', 'approval_table']),
    {
      id: 'request_title',
      type: 'text',
      x: 100,
      y: 150,
      width: 320,
      height: 68,
      zIndex: 2,
      parentId: 'form_root',
      fieldBinding: 'requestTitle',
      props: { name: 'requestTitle', label: '申请事项', placeholder: '例如：市场投放预算申请' },
    },
    {
      id: 'request_amount',
      type: 'number',
      x: 100,
      y: 240,
      width: 220,
      height: 68,
      zIndex: 2,
      parentId: 'form_root',
      fieldBinding: 'requestAmount',
      props: { name: 'requestAmount', label: '申请金额', defaultValue: 1000, min: 0 },
    },
    {
      id: 'submit_approval',
      type: 'button',
      x: 100,
      y: 350,
      width: 220,
      height: 52,
      zIndex: 2,
      parentId: 'form_root',
      props: {
        name: 'submitApproval',
        label: '筛选审批单',
        variant: 'primary',
        events: {
          onClick: `
            const result = await ctx.runConfiguredWorkflow();
            const rows = (result.nodeResults.get('approval_filter')?.outputs.result || [])
              .filter((item) => item?.状态 === '待审批');
            ctx.controls.approvalResults.value = rows;
            await ctx.showMessage(\`已筛选出 \${rows.length} 条记录\`, 'success');
          `,
        },
        flowTriggers: {
          onClick: {
            enabled: true,
            workflowId: workflow.id,
            parameterMap: {
              rows: approvalRows,
              'approval_filter.value': '$form.requestAmount',
            },
          },
        },
      },
    },
    {
      id: 'approval_table',
      type: 'table',
      x: 430,
      y: 140,
      width: 420,
      height: 280,
      zIndex: 2,
      parentId: 'form_root',
      fieldBinding: 'approvalResults',
      props: {
        name: 'approvalResults',
        label: '筛选结果',
        columns: ['单号', '申请人', '金额', '状态'],
        rows: 4,
      },
    },
  ];
  project.workflows = [workflow];
  project.behaviors = [behavior];
  project.designs = [design];
  project.settings = { ...createDefaultProjectSettings(), updatedAt: now };
  project.config.updatedAt = now;
  project.config.createdAt = now;
  return project;
}

function cloneTemplateProject(templateId: ProjectTemplateId): ProjectStructure {
  switch (templateId) {
    case 'blank_form':
      return buildBlankTemplate();
    case 'data_entry':
      return buildDataEntryTemplate();
    case 'approval_flow':
      return buildApprovalTemplate();
    default:
      return buildBlankTemplate();
  }
}

export function parseTagInput(tagsInput: string): string[] {
  return tagsInput
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function applyMeta(project: ProjectStructure, meta: ProjectCreationMeta): ProjectStructure {
  const now = nowIso();
  return normalizeProjectStructure({
    ...project,
    config: {
      ...project.config,
      id: `proj_${Date.now()}`,
      name: meta.name,
      description: meta.description,
      author: meta.author,
      tags: [...meta.tags],
      version: project.config.version || '1.0.0',
      createdAt: now,
      updatedAt: now,
    },
    settings: {
      ...normalizeProjectSettings(project.settings),
      updatedAt: now,
    },
    workflows: project.workflows.map((workflow) => ({ ...workflow, updatedAt: now })),
    globalBehaviors: (project.globalBehaviors || []).map((behavior) => ({ ...behavior, updatedAt: now })),
    forms: (project.forms || []).map((form) => ({ ...form, updatedAt: now })),
    behaviors: (project.behaviors || []).map((behavior) => ({ ...behavior, updatedAt: now })),
    designs: (project.designs || []).map((design) => ({ ...design, updatedAt: now })),
  });
}

export function createBlankProject(meta: ProjectCreationMeta): ProjectStructure {
  return applyMeta(createNewProject(meta.name), meta);
}

export function createProjectFromTemplate(templateId: ProjectTemplateId, meta: ProjectCreationMeta): ProjectStructure {
  return applyMeta(cloneTemplateProject(templateId), meta);
}

export async function createProjectFromZip(file: File, meta: ProjectCreationMeta): Promise<ProjectStructure> {
  const imported = await importFromZip(file);
  if (!imported) throw new Error('无效的项目包文件');
  return applyMeta(imported, meta);
}

export async function createProjectFromSource(options:
  | { mode: 'blank'; meta: ProjectCreationMeta }
  | { mode: 'template'; templateId: ProjectTemplateId; meta: ProjectCreationMeta }
  | { mode: 'zip'; file: File; meta: ProjectCreationMeta },
): Promise<ProjectStructure> {
  if (options.mode === 'blank') return createBlankProject(options.meta);
  if (options.mode === 'template') return createProjectFromTemplate(options.templateId, options.meta);
  return createProjectFromZip(options.file, options.meta);
}
