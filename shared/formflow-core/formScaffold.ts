/**
 * Form scaffold generation — orchestrates form creation from data tables.
 *
 * Public interface: generateFormScaffold, generateMissingFieldComponents, createSaveWorkflow.
 * Internal modules handle layout planning, component generation, workflow creation, and rule generation.
 */
import { FORM_WINDOW_COORDINATE_SPACE } from '../form-window-layout';
import { inferFormFields, inferLikelyKey, type InferredFormField } from './fieldInference';
import { applyBehaviorDslToComponents } from './behaviorDsl';
import { planLayout } from './formScaffold/layoutPlanner';
import {
  fieldComponent,
  sectionComponents,
  tabsComponent,
  statusComponent,
  saveButtonComponent,
  resetButtonComponent,
  lookupButtonComponent,
} from './formScaffold/componentGenerator';
import { createSaveWorkflow } from './formScaffold/workflowGenerator';
import { buildRuleCode, createBehaviors } from './formScaffold/ruleGenerator';

// Re-export for backward compatibility
export { createSaveWorkflow } from './formScaffold/workflowGenerator';

/** 表单生成的目标模式：新建、编辑、详情、查询修改。 */
export type FormMode = 'create' | 'edit' | 'detail' | 'lookup-edit';

/** 字段到单元格的双向绑定配置（当前固定为 version 1 的 firstCell 模式）。 */
export interface DataBindingConfig {
  version: 1;
  source: { kind: 'formField'; path: string };
  direction: 'twoWay';
  valueMode?: 'firstCell';
}

/** 源数据表单个 Sheet 的结构信息（列名、类型、样本值与主键配置）。 */
export interface SrcSheetInfo {
  name: string;
  rowCount: number;
  headers: string[];
  columns: Array<{
    name: string;
    dataType: 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'unknown';
    nullable: boolean;
    uniqueCount: number;
    sampleValues: unknown[];
    visible?: boolean;
    hidden?: boolean;
  }>;
  config?: { keyFields?: string[]; keyValidation?: { valid: boolean } };
}

/** 源数据表：文件级入口，包含其下全部 Sheet。 */
export interface SrcTableEntry {
  id: string;
  fileName: string;
  sheets: SrcSheetInfo[];
}

/** 设计稿组件：位置、尺寸、字段绑定与自定义属性。 */
export interface DesignComponent {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  fieldBinding?: string;
  parentId?: string;
  props: Record<string, any>;
}

/** 工作流文件：节点与连线的扁平描述。 */
export interface WorkflowFile {
  id: string;
  name: string;
  description: string;
  nodes: Array<{ id: string; type: string; specId: string; position: { x: number; y: number }; data: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
  createdAt: string;
  updatedAt: string;
}

/** 行为文件：DSL 代码、触发事件与优先级。 */
export interface BehaviorFile {
  id: string;
  name: string;
  event: string;
  code: string;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  trigger?: { componentId: string; eventName: string };
  eventFallbackReason?: string;
}

/** 表单设计文件：视口、窗口布局、组件与绑定关系。 */
export interface DesignFile {
  id: string;
  name: string;
  formMode?: FormMode;
  templateKey?: string;
  templateParameters?: Record<string, any>;
  viewport: { zoom: number; panX: number; panY: number };
  gridSize: number;
  coordinateSpace: typeof FORM_WINDOW_COORDINATE_SPACE;
  formWindow: { x: number; y: number; width: number; height: number; props: Record<string, any> };
  components: DesignComponent[];
  bindings: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    type: 'field' | 'behavior';
    config: Record<string, unknown>;
  }>;
  createdAt: string;
  updatedAt: string;
}

/** 表单入口：设计 + 行为 + 规则代码的聚合。 */
export interface FormEntry {
  id: string;
  name: string;
  design: DesignFile;
  behaviors: BehaviorFile[];
  ruleCode: string;
  createdAt: string;
  updatedAt: string;
}

/** 表单脚手架生成选项：模式、用途、字段选择、布局列数与包含项。 */
export interface FormScaffoldOptions {
  name?: string;
  mode?: FormMode;
  purpose?: 'entry' | 'lookup-edit' | 'approval' | 'detail' | 'statistics';
  selectedFields?: string[];
  layoutCountMode?: 'business-fields' | 'visible-fields';
  columns?: 1 | 2 | 3;
  includeSave?: boolean;
  includeReset?: boolean;
  idPrefix?: string;
  now?: string;
}

/** 脚手架生成结果：设计、表单、工作流、行为与字段推断汇总。 */
export interface GeneratedFormScaffold {
  design: DesignFile;
  form: FormEntry;
  workflow?: WorkflowFile;
  behaviors: BehaviorFile[];
  fields: InferredFormField[];
  diagnostics: string[];
}

function safeId(value: string) {
  const normalized = value.trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  let hash = 2166136261;
  for (const character of value) { hash ^= character.codePointAt(0) || 0; hash = Math.imul(hash, 16777619); }
  const suffix = (hash >>> 0).toString(36);
  return normalized && normalized === value.trim() ? normalized : `${normalized || 'field'}_${suffix}`;
}

/**
 * 补齐缺失字段的组件：对比既有组件的字段绑定与源表字段，
 * 为未覆盖字段生成新组件并排布在现有组件下方。
 *
 * @param existing 已存在的设计组件列表
 * @param table 源数据表
 * @param sheetName 目标 Sheet 名称
 * @param options 列数与组件 id 前缀
 * @returns 缺失字段对应的新组件（不含排布冲突检测）
 */
export function generateMissingFieldComponents(
  existing: DesignComponent[],
  table: SrcTableEntry,
  sheetName: string,
  options: { columns?: 1 | 2 | 3; prefix?: string } = {},
) {
  const sheet = table.sheets.find((item) => item.name === sheetName);
  if (!sheet) throw new Error(`工作表不存在: ${sheetName}`);
  const represented = new Set(existing.map((component) => String(component.fieldBinding || component.props?.name || '').trim()).filter(Boolean));
  const missing = inferFormFields(sheet).filter((field) => !represented.has(field.name));
  if (!missing.length) return [];
  const columns = options.columns || 3;
  const prefix = safeId(options.prefix || `added_${table.id}_${sheet.name}_${Date.now()}`);
  const startY = Math.max(120, ...existing.map((component) => component.y + component.height)) + 24;
  return missing.map((field, index) => {
    const component = fieldComponent(field, index, columns, prefix);
    return { ...component, y: startY + Math.floor(index / columns) * 92, parentId: undefined };
  });
}

/**
 * 由数据表生成完整表单脚手架：布局规划、组件生成、行为与工作流编排。
 *
 * @param table 源数据表
 * @param sheetName 目标 Sheet 名称
 * @param options 生成选项（模式、用途、字段、列数等）
 * @returns 设计、表单、行为与工作流的聚合结果
 */
export function generateFormScaffold(table: SrcTableEntry, sheetName: string, options: FormScaffoldOptions = {}): GeneratedFormScaffold {
  const sheet = table.sheets.find((item) => item.name === sheetName);
  if (!sheet) throw new Error(`工作表不存在: ${sheetName}`);
  const now = options.now || new Date().toISOString();
  const name = options.name?.trim() || `${sheet.name}录入`;
  const prefix = safeId(options.idPrefix || `generated_${table.id}_${sheet.name}_${Date.now()}`);
  const fields = inferFormFields(sheet, options.selectedFields);
  if (!fields.length) throw new Error('没有可用于生成表单的字段');

  // Plan layout
  const layout = planLayout(fields, { columns: options.columns, layoutCountMode: options.layoutCountMode });
  const workflowId = `${prefix}_save_flow`;
  const saveButtonName = `${prefix}_save`;
  const readonlyPurpose = options.purpose === 'detail' || options.purpose === 'statistics';
  const canWrite = !readonlyPurpose && options.includeSave !== false;

  // Generate workflow
  const workflow = canWrite ? createSaveWorkflow(table, sheet, fields, { id: workflowId, name, now }) : undefined;

  // Generate rules
  const ruleCode = buildRuleCode(fields, canWrite ? saveButtonName : undefined);

  // Generate components
  const fieldComps = fields.map((field, index) =>
    fieldComponent(field, index, layout.columns, prefix, {
      readonly: readonlyPurpose,
      pageIndex: layout.needsTabs ? Math.floor(index / 12) : undefined,
    }),
  );
  const sectionComps = sectionComponents(prefix, layout.sections.length, layout.columns);
  const tabsComp = tabsComponent(prefix, layout.pageCount);
  const statusComp = statusComponent(prefix, layout.actionY);

  const components: DesignComponent[] = [
    ...(tabsComp ? [tabsComp] : []),
    ...sectionComps,
    ...fieldComps,
    statusComp,
  ];

  if (canWrite) {
    const saveBtn = saveButtonComponent(prefix, layout.actionY, options.purpose);
    if (workflow) {
      saveBtn.props.flowTriggers = {
        onClick: {
          enabled: true,
          workflowId,
          parameterMap: {
            'workflow:import.formData': Object.fromEntries(fields.map((field) => [field.name, `$form.${field.name}`])),
          },
        },
      };
    }
    components.push(saveBtn);
  }

  if (!readonlyPurpose && options.includeReset !== false) {
    components.push(resetButtonComponent(prefix, layout.actionY));
  }

  if (options.purpose === 'lookup-edit') {
    components.push(lookupButtonComponent(prefix, layout.actionY));
  }

  // Assemble design
  const design: DesignFile = {
    id: `${prefix}_design`,
    name,
    formMode: options.mode || (options.purpose === 'lookup-edit' ? 'lookup-edit' : readonlyPurpose ? 'detail' : 'create'),
    templateKey: 'generated-from-data',
    viewport: { zoom: 1, panX: 0, panY: 0 },
    gridSize: 10,
    coordinateSpace: FORM_WINDOW_COORDINATE_SPACE,
    formWindow: {
      x: 32, y: 24,
      width: 860,
      height: layout.actionY + 116,
      props: {
        name: `${prefix}_form`,
        title: name,
        subtitle: `由 ${table.fileName} / ${sheet.name} 自动生成`,
        background: '#f5f7fb',
        padding: 20,
        borderRadius: 12,
        showFooter: false,
        generatedPurpose: options.purpose || 'entry',
        generatedSections: layout.sections.length,
        generatedPages: layout.pageCount,
      },
    },
    components,
    bindings: [],
    createdAt: now,
    updatedAt: now,
  };

  // Apply behavior DSL
  const applied = applyBehaviorDslToComponents(components, ruleCode, design.formWindow);
  design.components = applied.components;
  design.formWindow = applied.formWindow || design.formWindow;

  // Generate behaviors
  const behaviors = createBehaviors(prefix, name, fields, table, sheet, {
    now,
    readonlyPurpose,
    includeReset: options.includeReset !== false,
  });

  // Assemble form entry
  const form: FormEntry = {
    id: `${prefix}_form_entry`,
    name,
    design,
    behaviors,
    ruleCode,
    createdAt: now,
    updatedAt: now,
  };

  // Generate diagnostics
  const diagnostics: string[] = [];
  if (!inferLikelyKey(sheet)) diagnostics.push('未识别到唯一键：已生成表单，但未生成自动写回流程。');
  if (sheet.config?.keyValidation && !sheet.config.keyValidation.valid) diagnostics.push('当前主键存在空值或重复，发布前需要修复。');
  if (fields.some((field) => field.confidence < 0.8)) diagnostics.push('部分字段类型推断置信度较低，请在预览中确认。');
  if (applied.unapplied.length) diagnostics.push(...applied.unapplied);

  return { design, form, workflow, behaviors, fields, diagnostics };
}
