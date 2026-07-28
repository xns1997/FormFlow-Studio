import type { DataBindingConfig } from '../../models';
import type {
  BehaviorFile,
  DesignComponent,
  DesignFile,
  FormEntry,
  FormMode,
  SrcSheetInfo,
  SrcTableEntry,
  WorkflowFile,
} from '../../project/types';
import { FORM_WINDOW_COORDINATE_SPACE } from '../../project/types';
import { inferFormFields, inferLikelyKey, type InferredFormField } from './fieldInference';
import { SINGLE_LINE_FIELD_HEIGHT } from '../../designer/controls/geometry';
import { applyBehaviorDslToComponents } from '../engine/behaviorDsl';

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

export interface GeneratedFormScaffold {
  design: DesignFile;
  form: FormEntry;
  workflow?: WorkflowFile;
  behaviors: BehaviorFile[];
  fields: InferredFormField[];
  diagnostics: string[];
}

function autoColumns(fieldCount: number) {
  if (fieldCount <= 1) return 1 as const;
  if (fieldCount <= 4) return 2 as const;
  if (fieldCount <= 12) return 3 as const;
  return 3 as const;
}

function safeId(value: string) {
  const normalized = value.trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  let hash = 2166136261;
  for (const character of value) { hash ^= character.codePointAt(0) || 0; hash = Math.imul(hash, 16777619); }
  const suffix = (hash >>> 0).toString(36);
  return normalized && normalized === value.trim() ? normalized : `${normalized || 'field'}_${suffix}`;
}

function fieldBinding(path: string): DataBindingConfig {
  return { version: 1, source: { kind: 'formField', path }, direction: 'twoWay', valueMode: 'firstCell' };
}

function fieldComponent(field: InferredFormField, index: number, columns: number, prefix: string, options: { readonly?: boolean; pageIndex?: number } = {}): DesignComponent {
  const col = index % columns;
  const row = Math.floor(index / columns);
  const width = columns === 1 ? 620 : columns === 2 ? 300 : 236;
  const height = field.controlType === 'textarea' ? 116 : SINGLE_LINE_FIELD_HEIGHT;
  const x = 72 + col * (width + 24);
  const y = 132 + row * 92;
  const props: Record<string, unknown> = {
    name: field.name,
    label: field.label,
    required: field.required,
    readonly: options.readonly || field.readonly,
    placeholder: field.placeholder,
    dataBinding: fieldBinding(field.name),
  };
  if (field.options?.length) props.options = field.options;
  if (field.defaultValue !== undefined) props.defaultValue = field.defaultValue;
  if (options.pageIndex !== undefined) props.generatedPage = options.pageIndex;
  return {
    id: `${prefix}_field_${safeId(field.name)}`,
    type: field.controlType,
    x,
    y,
    width,
    height,
    zIndex: 2,
    fieldBinding: field.name,
    props,
  };
}

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

function workflowIoPorts(direction: 'output' | 'input') {
  const ports = direction === 'output'
    ? [
        { name: 'formData', type: 'object', label: '表单数据', description: '提交时写回的数据对象' },
        { name: 'originalData', type: 'object', label: '原始数据', description: '编辑前的原始数据对象' },
      ]
    : [
        { name: 'success', type: 'object', label: '成功事件' },
        { name: 'changeLog', type: 'object', label: '变更记录' },
        { name: 'writeBack', type: 'object', label: '写回动作' },
        { name: 'fileData', type: 'any', label: '文件数据' },
      ];
  return JSON.stringify({ [`${direction}Ports`]: JSON.stringify(ports) });
}

export function createSaveWorkflow(
  table: SrcTableEntry,
  sheet: SrcSheetInfo,
  fields: InferredFormField[],
  options: { id: string; name: string; now: string },
): WorkflowFile | undefined {
  const keyField = inferLikelyKey(sheet);
  if (!keyField) return undefined;
  const fieldMap = Object.fromEntries(fields.map((field) => [field.name, field.name]));
  return {
    id: options.id,
    name: `保存${options.name}`,
    description: `自动生成：校验并写回 ${table.fileName} / ${sheet.name}`,
    createdAt: options.now,
    updatedAt: options.now,
    nodes: [
      { id: 'workflow_import', type: 'formflow', specId: 'workflow:import', position: { x: 40, y: 160 }, data: { propertiesJson: workflowIoPorts('output') } },
      {
        id: 'submit', type: 'formflow', specId: 'behavior:submit', position: { x: 320, y: 160 },
        data: { propertiesJson: JSON.stringify({
          validateFirst: true,
          target: 'changeLog',
          fileName: options.id,
          writeBackMode: 'upsert',
          writeBackTableId: table.id,
          writeBackSheetName: sheet.name,
          writeBackKeyField: keyField,
          writeBackKeyFormField: keyField,
          writeBackFieldMap: fieldMap,
        }) },
      },
      { id: 'workflow_export', type: 'formflow', specId: 'workflow:export', position: { x: 640, y: 160 }, data: { propertiesJson: workflowIoPorts('input') } },
    ],
    edges: [
      { id: 'edge_import_formData', source: 'workflow_import', target: 'submit', sourceHandle: 'out:formData', targetHandle: 'in:formData' },
      { id: 'edge_import_originalData', source: 'workflow_import', target: 'submit', sourceHandle: 'out:originalData', targetHandle: 'in:originalData' },
      { id: 'edge_submit_success', source: 'submit', target: 'workflow_export', sourceHandle: 'out:success', targetHandle: 'in:success' },
      { id: 'edge_submit_changeLog', source: 'submit', target: 'workflow_export', sourceHandle: 'out:changeLog', targetHandle: 'in:changeLog' },
      { id: 'edge_submit_writeBack', source: 'submit', target: 'workflow_export', sourceHandle: 'out:writeBack', targetHandle: 'in:writeBack' },
      { id: 'edge_submit_fileData', source: 'submit', target: 'workflow_export', sourceHandle: 'out:fileData', targetHandle: 'in:fileData' },
    ],
  };
}

function buildResetScript(fields: InferredFormField[], table: SrcTableEntry, sheet: SrcSheetInfo) {
  const key = fields.find((field) => field.isKey);
  const clearFields = fields.filter((field) => !field.isKey && field.defaultValue === undefined).map((field) => field.name);
  const defaults = Object.fromEntries(fields.filter((field) => field.defaultValue !== undefined).map((field) => [field.name, field.defaultValue]));
  const lines: string[] = [];
  if (key && key.controlType === 'number') lines.push(`const nextId = ctx.nextSequence(${JSON.stringify(`${table.id}:${sheet.name}`)}, ${JSON.stringify(key.name)}, { start: 1 });`);
  if (key && key.controlType === 'number') defaults[key.name] = '$nextId';
  const defaultsSource = JSON.stringify(defaults).replace('"$nextId"', 'nextId');
  lines.push(`await ctx.resetForm({ clearFields: ${JSON.stringify(clearFields)}, defaults: ${defaultsSource}, focusField: ${JSON.stringify(fields.find((field) => !field.readonly)?.name || '')} });`);
  return lines.join('\n');
}

function buildRuleCode(fields: InferredFormField[], workflowId?: string, saveButtonName?: string) {
  const rules: string[] = [];
  const submitPrefix = saveButtonName ? `before click(${JSON.stringify(saveButtonName)})` : 'before submit';
  const requiredFields = fields.filter((field) => field.required && !field.readonly).map((field) => `$${field.name}`);
  if (requiredFields.length) {
    if (saveButtonName) rules.push(`before click(${JSON.stringify(saveButtonName)}) -> require(${requiredFields.join(', ')})`);
    rules.push(`before submit -> require(${requiredFields.join(', ')})`);
  }
  for (const field of fields) {
    if (field.readonly) continue;
    const ref = `$${field.name}`;
    if (field.controlType === 'number') rules.push(`before submit -> validate(${ref}, number)`);
    if (field.controlType === 'datePicker') rules.push(`before submit -> validate(${ref}, date)`);
    if (field.controlType === 'select' && field.options?.length) rules.push(`before submit -> enum(${ref}, ${field.options.map((v) => JSON.stringify(v)).join(', ')})`);
  }
  return rules.join('\n');
}

export function generateFormScaffold(table: SrcTableEntry, sheetName: string, options: FormScaffoldOptions = {}): GeneratedFormScaffold {
  const sheet = table.sheets.find((item) => item.name === sheetName);
  if (!sheet) throw new Error(`工作表不存在: ${sheetName}`);
  const now = options.now || new Date().toISOString();
  const name = options.name?.trim() || `${sheet.name}录入`;
  const prefix = safeId(options.idPrefix || `generated_${table.id}_${sheet.name}_${Date.now()}`);
  const fields = inferFormFields(sheet, options.selectedFields);
  if (!fields.length) throw new Error('没有可用于生成表单的字段');
  const visibleFieldCount = fields.length;
  const businessFieldCount = fields.filter((field) => !field.isKey).length || visibleFieldCount;
  const layoutFieldCount = options.layoutCountMode === 'visible-fields' ? visibleFieldCount : businessFieldCount;
  const columns = options.columns || autoColumns(layoutFieldCount);
  const workflowId = `${prefix}_save_flow`;
  const saveButtonName = `${prefix}_save`;
  const readonlyPurpose = options.purpose === 'detail' || options.purpose === 'statistics';
  const canWrite = !readonlyPurpose && options.includeSave !== false;
  const workflow = canWrite ? createSaveWorkflow(table, sheet, fields, { id: workflowId, name, now }) : undefined;
  const ruleCode = buildRuleCode(fields, workflow?.id, canWrite ? saveButtonName : undefined);
  const resetScript = buildResetScript(fields, table, sheet);
  const fieldComponents = fields.map((field, index) => fieldComponent(field, index, columns, prefix, { readonly: readonlyPurpose, pageIndex: layoutFieldCount > 24 ? Math.floor(index / 12) : undefined }));
  const sectionComponents: DesignComponent[] = layoutFieldCount > 12 ? Array.from({ length: Math.ceil(layoutFieldCount / 8) }, (_, index) => ({
    id: `${prefix}_section_${index + 1}`, type: 'text', x: 72, y: 104 + Math.floor((index * 8) / columns) * 92, width: 720, height: 24, zIndex: 1,
    props: { name: `${prefix}_section_${index + 1}`, content: `字段组 ${index + 1}`, fontSize: 14, fontWeight: 650, color: '#334155', generatedSection: true },
  })) : [];
  const tabsComponent: DesignComponent | null = layoutFieldCount > 24 ? {
    id: `${prefix}_pages`, type: 'tabs', x: 72, y: 76, width: 720, height: 48, zIndex: 2,
    props: { name: `${prefix}_pages`, tabs: Array.from({ length: Math.ceil(layoutFieldCount / 12) }, (_, index) => `第 ${index + 1} 页`), defaultTab: 0, generatedPagination: true },
  } : null;
  const fieldRows = Math.ceil(fields.length / columns);
  const actionY = 144 + fieldRows * 92;
  const components: DesignComponent[] = [
    ...(tabsComponent ? [tabsComponent] : []),
    ...sectionComponents,
    ...fieldComponents,
    {
      id: `${prefix}_status`, type: 'text', x: 72, y: actionY - 8, width: 520, height: 28, zIndex: 2, fieldBinding: '_生成状态',
      props: { name: '_生成状态', content: '填写完成后保存', fontSize: 13, color: '#475569' },
    },
  ];
  if (canWrite) components.push({
    id: `${prefix}_save`, type: 'button', x: 72, y: actionY + 32, width: 180, height: 48, zIndex: 3,
    props: {
      name: saveButtonName, label: options.purpose === 'approval' ? '提交审批' : '校验并保存', variant: 'primary',
      ...(workflow ? { flowTriggers: { onClick: { enabled: true, workflowId, parameterMap: { 'workflow:import.formData': Object.fromEntries(fields.map((field) => [field.name, `$form.${field.name}`])) } } } } : {}),
    },
  });
  if (!readonlyPurpose && options.includeReset !== false) components.push({
    id: `${prefix}_reset`, type: 'button', x: 272, y: actionY + 32, width: 150, height: 48, zIndex: 3,
    props: { name: `${prefix}_reset`, label: '重置', variant: 'outline' },
  });
  if (options.purpose === 'lookup-edit') components.push({
    id: `${prefix}_lookup`, type: 'button', x: 442, y: actionY + 32, width: 150, height: 48, zIndex: 3,
    props: { name: `${prefix}_lookup`, label: '按主键查询', variant: 'outline' },
  });

  const design: DesignFile = {
    id: `${prefix}_design`, name, formMode: options.mode || (options.purpose === 'lookup-edit' ? 'lookup-edit' : readonlyPurpose ? 'detail' : 'create'), templateKey: 'generated-from-data',
    viewport: { zoom: 1, panX: 0, panY: 0 }, gridSize: 10,
    coordinateSpace: FORM_WINDOW_COORDINATE_SPACE,
    formWindow: { x: 32, y: 24, width: 860, height: actionY + 116, props: { name: `${prefix}_form`, title: name, subtitle: `由 ${table.fileName} / ${sheet.name} 自动生成`, background: '#f5f7fb', padding: 20, borderRadius: 12, showFooter: false, generatedPurpose: options.purpose || 'entry', generatedSections: sectionComponents.length, generatedPages: layoutFieldCount > 24 ? Math.ceil(layoutFieldCount / 12) : 1 } },
    components, bindings: [], createdAt: now, updatedAt: now,
  };
  const appliedRules = applyBehaviorDslToComponents(components, ruleCode, design.formWindow);
  design.components = appliedRules.components;
  design.formWindow = appliedRules.formWindow || design.formWindow;

  const initBehavior: BehaviorFile | undefined = fields.some((field) => field.isKey && field.controlType === 'number') ? {
    id: `${prefix}_initialize`, name: `初始化${name}`, event: 'onFormLoad', code: resetScript, priority: 10, enabled: true, createdAt: now, updatedAt: now,
  } : undefined;
  const resetBehavior: BehaviorFile | undefined = !readonlyPurpose && options.includeReset !== false ? {
    id: `${prefix}_reset_action`, name: `重置${name}`, event: 'onClick', code: resetScript, priority: 20, enabled: true, createdAt: now, updatedAt: now, trigger: { componentId: `${prefix}_reset`, eventName: 'onClick' }, eventFallbackReason: 'runtime-ui-only',
  } : undefined;
  const behaviors = [initBehavior, resetBehavior].filter(Boolean) as BehaviorFile[];
  const form: FormEntry = { id: `${prefix}_form_entry`, name, design, behaviors, ruleCode, createdAt: now, updatedAt: now };
  const diagnostics: string[] = [];
  if (!inferLikelyKey(sheet)) diagnostics.push('未识别到唯一键：已生成表单，但未生成自动写回流程。');
  if (sheet.config?.keyValidation && !sheet.config.keyValidation.valid) diagnostics.push('当前主键存在空值或重复，发布前需要修复。');
  if (fields.some((field) => field.confidence < 0.8)) diagnostics.push('部分字段类型推断置信度较低，请在预览中确认。');
  if (appliedRules.unapplied.length) diagnostics.push(...appliedRules.unapplied);
  return { design, form, workflow, behaviors, fields, diagnostics };
}
