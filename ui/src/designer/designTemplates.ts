import type { DataRelation, DesignComponent, DesignFile, FormMode, FormWindowConfig, SrcTableEntry } from '../project/types';
import { createDesignFile } from '../project/types';
import { generateFormScaffold } from '../services/formGeneration/formScaffold';

export interface DesignTemplateDefinition {
  key: string;
  label: string;
  description: string;
  formMode: FormMode;
}

export interface CreateDesignTemplateOptions {
  table?: SrcTableEntry;
  tables?: SrcTableEntry[];
  sheetName?: string;
  selectedFields?: string[];
  queryFields?: string[];
  displayFields?: string[];
  editableFields?: string[];
  masterFields?: string[];
  detailFields?: string[];
  relation?: DataRelation;
  detailTableId?: string;
  detailSheetName?: string;
  detailTitle?: string;
  detailRows?: number;
  detailEditableMode?: 'editable' | 'readonly';
  allowEmptyDetails?: boolean;
  name?: string;
  title?: string;
  subtitle?: string;
  columns?: 1 | 2 | 3;
  labelWidth?: number;
  density?: 'comfortable' | 'compact';
  previewRows?: number;
  sampleRows?: number;
  pageSize?: number;
  defaultExpanded?: boolean;
  queryLimit?: number;
  autoQueryOnLoad?: boolean;
  queryMode?: 'all' | 'any';
  dirtyOnly?: boolean;
  refetchAfterSave?: boolean;
  conflictPolicy?: 'error' | 'refresh-and-retry';
  existingPolicy?: 'error' | 'skip' | 'update';
  duplicateDetailPolicy?: 'error' | 'skip';
  hiddenFields?: string[];
  readonlyFields?: string[];
  successMessage?: string;
  failureMessage?: string;
  emptyStateMessage?: string;
  statusField?: string;
  resultField?: string;
  summaryField?: string;
  messageField?: string;
  changeLogField?: string;
  writeBackField?: string;
  includeReset?: boolean;
  includeSave?: boolean;
  saveLabel?: string;
  lookupLabel?: string;
  now?: string;
}

export const DESIGN_TEMPLATES: DesignTemplateDefinition[] = [
  { key: 'blank', label: '空白表单', description: '从空白设计开始', formMode: 'create' },
  { key: 'basic-entry', label: '基础录入表单', description: '按真实字段生成录入布局与操作区', formMode: 'create' },
  { key: 'lookup-edit', label: '查询修改表单', description: '按真实字段生成查询区、编辑区和保存区', formMode: 'lookup-edit' },
  { key: 'master-detail', label: '主从详情表单', description: '为已声明关系预留主表列表与详情编辑区', formMode: 'edit' },
];

function component(
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  props: Record<string, unknown>,
): DesignComponent {
  return { id, type, x, y, width, height, props, zIndex: 2 };
}

function createFormWindow(title: string, subtitle: string): FormWindowConfig {
  return {
    x: 40,
    y: 40,
    width: 980,
    height: 720,
    props: {
      title,
      subtitle,
      background: '#f2f2f7',
      padding: 20,
      showFooter: false,
    },
  };
}

function applyWindowPresentation(design: DesignFile, title?: string, subtitle?: string) {
  if (!title && !subtitle) return design;
  return {
    ...design,
    formWindow: {
      ...design.formWindow,
      props: {
        ...design.formWindow.props,
        ...(title ? { title } : {}),
        ...(subtitle !== undefined ? { subtitle } : {}),
      },
    },
  };
}

function renameButton(components: DesignComponent[], matcher: (component: DesignComponent) => boolean, label?: string) {
  if (!label) return components;
  return components.map((component) => matcher(component)
    ? { ...component, props: { ...component.props, label } }
    : component);
}

function definedRecord<T extends Record<string, unknown>>(record: T) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function collectButtonPreview(components: DesignComponent[]) {
  return components
    .filter((component) => component.type === 'button')
    .map((component) => ({
      id: component.id,
      label: String(component.props?.label || component.props?.name || component.id),
      disabled: component.props?.disabled === true,
      workflowIds: component.props?.flowTriggers ? Object.values(component.props.flowTriggers as Record<string, any>)
        .map((trigger) => String(trigger?.workflowId || ''))
        .filter(Boolean) : [],
    }));
}

function collectInternalBindings(components: DesignComponent[]) {
  return components
    .filter((component) => typeof component.fieldBinding === 'string' && String(component.fieldBinding).startsWith('_'))
    .map((component) => ({
      field: String(component.fieldBinding),
      type: String(component.type || ''),
      label: String(component.props?.label || component.props?.name || component.id),
    }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- workflow structure varies
function summarizeWorkflow(workflow: any) {
  if (!workflow) return undefined;
  return {
    id: String(workflow.id || ''),
    name: String(workflow.name || ''),
    nodeCount: Array.isArray(workflow.nodes) ? workflow.nodes.length : 0,
    edgeCount: Array.isArray(workflow.edges) ? workflow.edges.length : 0,
    specIds: Array.isArray(workflow.nodes) ? workflow.nodes.map((node: any) => String(node.specId || '')) : [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- behavior structure varies
function summarizeBehaviors(behaviors: any[]) {
  return (behaviors || []).map((behavior) => ({
    id: String(behavior.id || ''),
    name: String(behavior.name || ''),
    event: String(behavior.event || ''),
    enabled: behavior.enabled !== false,
    priority: Number(behavior.priority || 0),
  }));
}

function applyTemplateConfiguration(
  design: DesignFile,
  config: {
    copy?: Record<string, unknown>;
    layout?: Record<string, unknown>;
    fieldProjection?: Record<string, unknown>;
    preview?: Record<string, unknown>;
    policy?: Record<string, unknown>;
    resultBindings?: Record<string, unknown>;
    runtime?: Record<string, unknown>;
  },
) {
  const exactConfiguration = {
    copy: structuredClone(config.copy || {}),
    layout: structuredClone(config.layout || {}),
    fieldProjection: structuredClone(config.fieldProjection || {}),
    previewControls: structuredClone(config.preview || {}),
    policy: structuredClone(config.policy || {}),
    resultBindings: structuredClone(config.resultBindings || {}),
    runtime: structuredClone(config.runtime || {}),
    buttons: collectButtonPreview(design.components),
    internalBindings: collectInternalBindings(design.components),
  };
  design.templateParameters = {
    ...(design.templateParameters || {}),
    ...(config.copy ? { copy: structuredClone(config.copy) } : {}),
    ...(config.layout ? { layout: structuredClone(config.layout) } : {}),
    ...(config.fieldProjection ? { fieldProjection: structuredClone(config.fieldProjection) } : {}),
    ...(config.preview ? { preview: structuredClone(config.preview) } : {}),
    ...(config.policy ? { policy: structuredClone(config.policy) } : {}),
    ...(config.resultBindings ? { resultBindings: structuredClone(config.resultBindings) } : {}),
    ...(config.runtime ? { runtime: structuredClone(config.runtime) } : {}),
    exactConfiguration,
  };
  return design;
}

function resolveSheet(table: SrcTableEntry | undefined, sheetName?: string) {
  if (!table) return undefined;
  return table.sheets.find((item) => item.name === sheetName) || table.sheets[0];
}

function createScaffoldedDesign(
  key: string,
  index: number,
  options: Required<Pick<CreateDesignTemplateOptions, 'table' | 'sheetName'>> & CreateDesignTemplateOptions,
): DesignFile {
  const titles: Record<string, { name: string; purpose?: 'entry' | 'lookup-edit' | 'detail'; includeSave?: boolean; includeReset?: boolean }> = {
    blank: { name: `设计 ${index}`, includeSave: false, includeReset: false },
    'basic-entry': { name: `基础录入 ${index}`, purpose: 'entry', includeSave: true, includeReset: true },
    'lookup-edit': { name: `查询修改 ${index}`, purpose: 'lookup-edit', includeSave: true, includeReset: true },
    'master-detail': { name: `主从详情 ${index}`, purpose: 'detail', includeSave: false, includeReset: false },
  };
  const selectedFields = key === 'lookup-edit'
    ? [...new Set([...(options.queryFields || []), ...(options.editableFields || []), ...(options.selectedFields || [])])]
    : options.selectedFields;
  const scaffold = generateFormScaffold(options.table, options.sheetName, {
    idPrefix: `${key}_${index}`,
    name: options.name || titles[key]?.name,
    now: options.now,
    selectedFields,
    purpose: titles[key]?.purpose,
    layoutCountMode: key === 'blank' ? 'visible-fields' : 'business-fields',
    includeSave: options.includeSave ?? titles[key]?.includeSave,
    includeReset: options.includeReset ?? titles[key]?.includeReset,
    columns: options.columns,
  });
  let design: DesignFile = {
    ...scaffold.design,
    name: options.name || titles[key]?.name || scaffold.design.name,
    templateKey: key,
    templateParameters: {
      ...(scaffold.design.templateParameters || {}),
      selectedFields: selectedFields || [],
      ...(options.queryFields?.length ? { queryFields: options.queryFields } : {}),
      ...(options.editableFields?.length ? { editableFields: options.editableFields } : {}),
      ...(options.columns ? { columns: options.columns } : {}),
      ...(options.includeReset !== undefined ? { includeReset: options.includeReset } : {}),
    },
    components: scaffold.design.components.map((item) => item.type !== 'button' ? item : ({
      ...item,
      props: {
        ...item.props,
        events: undefined,
        flowTriggers: undefined,
      },
    })),
    updatedAt: options.now || scaffold.design.updatedAt,
  };
  design = applyWindowPresentation(design, options.title, options.subtitle);
  design.components = renameButton(
    renameButton(design.components, (component) => component.type === 'button' && String(component.props.label || '').includes('保存'), options.saveLabel),
    (component) => component.type === 'button' && (String(component.props.label || '').includes('查询') || String(component.props.label || '').includes('查找')),
    options.lookupLabel,
  );
  const visibleFieldBindings = design.components
    .filter((component) => component.fieldBinding && !String(component.fieldBinding).startsWith('_'))
    .map((component) => String(component.fieldBinding));
  design.templateParameters = {
    ...(design.templateParameters || {}),
    fieldProjection: {
      visibleFields: visibleFieldBindings,
      ...(key === 'lookup-edit' && options.queryFields?.length ? { queryFields: options.queryFields } : {}),
      ...(key === 'lookup-edit' && options.displayFields?.length ? { displayFields: options.displayFields } : {}),
      ...(key === 'lookup-edit' && options.editableFields?.length ? { editableFields: options.editableFields } : {}),
      ...(options.hiddenFields?.length ? { hiddenFields: options.hiddenFields } : {}),
      ...(options.readonlyFields?.length ? { readonlyFields: options.readonlyFields } : {}),
    },
    layout: {
      columns: Number(options.columns || design.templateParameters?.columns || 0) || undefined,
      generatedPages: design.formWindow.props?.generatedPages,
      generatedSections: design.formWindow.props?.generatedSections,
      labelWidth: options.labelWidth,
      density: options.density,
      ...(key !== 'lookup-edit' ? { sectionMode: design.formWindow.props?.generatedSections > 0 ? 'generated-sections' : 'flat' } : {}),
    },
  };
  if (key === 'lookup-edit') {
    const columns = options.columns || 2;
    const fieldWidth = columns === 1 ? 620 : columns === 2 ? 300 : 236;
    const querySet = new Set((options.queryFields || []).map(String));
    const displaySet = new Set((options.displayFields || []).map(String));
    const editableSet = new Set((options.editableFields || []).map(String));
    const fieldComponents = design.components.filter((component) => component.fieldBinding && !String(component.fieldBinding).startsWith('_'));
    let queryIndex = 0;
    let displayIndex = 0;
    let editIndex = 0;
    for (const component of fieldComponents) {
      const field = String(component.fieldBinding || '');
      const isQuery = querySet.has(field);
      const isDisplay = displaySet.has(field);
      const isEditable = editableSet.has(field) || (!querySet.has(field) && !displaySet.has(field));
      const indexWithinRole = isQuery ? queryIndex++ : isDisplay ? displayIndex++ : editIndex++;
      const col = indexWithinRole % columns;
      const row = Math.floor(indexWithinRole / columns);
      component.x = 72 + col * (fieldWidth + 24);
      component.width = fieldWidth;
      component.y = isQuery ? 148 + row * 92 : isDisplay ? 352 + row * 92 : 556 + row * 92;
      component.props = {
        ...(component.props || {}),
        readonly: isDisplay,
        disabled: isDisplay || isEditable,
        generatedRole: isQuery ? 'query' : isDisplay ? 'display' : 'editable',
      };
    }
    const querySection: DesignComponent = { id: `lookup_edit_${index}_query_section`, type: 'text', x: 72, y: 112, width: 720, height: 24, zIndex: 1, props: { name: 'querySection', content: '查询条件', fontSize: 14, fontWeight: 650, color: '#334155' } };
    const displaySection: DesignComponent = { id: `lookup_edit_${index}_display_section`, type: 'text', x: 72, y: 316, width: 720, height: 24, zIndex: 1, props: { name: 'displaySection', content: '结果展示（命中后回填）', fontSize: 14, fontWeight: 650, color: '#334155' } };
    const editSection: DesignComponent = { id: `lookup_edit_${index}_edit_section`, type: 'text', x: 72, y: 520, width: 720, height: 24, zIndex: 1, props: { name: 'editSection', content: '编辑字段（命中后解锁）', fontSize: 14, fontWeight: 650, color: '#334155' } };
    design.components = [
      ...design.components.filter((component) => ![querySection.id, displaySection.id, editSection.id].includes(component.id)),
      querySection,
      displaySection,
      editSection,
      ...design.components.filter((component) => ![querySection.id, displaySection.id, editSection.id].includes(component.id)),
    ].filter((component, idx, list) => list.findIndex((item) => item.id === component.id) === idx);
    design.templateParameters = {
      ...(design.templateParameters || {}),
      queryFields: [...querySet],
      displayFields: [...displaySet],
      editableFields: [...editableSet],
      fieldProjection: {
        visibleFields: fieldComponents.map((component) => String(component.fieldBinding || '')),
        queryFields: [...querySet],
        displayFields: [...displaySet],
        editableFields: [...editableSet],
        ...(options.hiddenFields?.length ? { hiddenFields: options.hiddenFields } : {}),
        ...(options.readonlyFields?.length ? { readonlyFields: options.readonlyFields } : {}),
      },
      layout: {
        columns,
        sectionMode: 'by-role',
        generatedPages: design.formWindow.props?.generatedPages,
        generatedSections: design.formWindow.props?.generatedSections,
        labelWidth: options.labelWidth,
        density: options.density,
      },
    };
  }
  const fieldProjection = structuredClone((design.templateParameters?.fieldProjection || {}) as Record<string, unknown>);
  const layout = structuredClone((design.templateParameters?.layout || {}) as Record<string, unknown>);
  const preview = definedRecord({
    previewRows: options.previewRows ?? Math.min(10, Math.max(1, resolveSheet(options.table, options.sheetName)?.preview.length || 1)),
    sampleRows: options.sampleRows ?? Math.min(3, Math.max(1, resolveSheet(options.table, options.sheetName)?.preview.length || 1)),
    pageSize: options.pageSize ?? design.formWindow.props?.generatedPages ?? 1,
    defaultExpanded: options.defaultExpanded,
  });
  const copy = definedRecord({
    title: String(design.formWindow.props?.title || design.name),
    subtitle: design.formWindow.props?.subtitle ? String(design.formWindow.props.subtitle) : undefined,
    successMessage: options.successMessage,
    failureMessage: options.failureMessage,
    emptyStateMessage: options.emptyStateMessage,
  });
  const policy = key === 'lookup-edit'
    ? definedRecord({
        lookupPolicy: definedRecord({
          queryLimit: options.queryLimit ?? 1,
          autoQueryOnLoad: options.autoQueryOnLoad ?? false,
          queryMode: options.queryMode ?? 'all',
          dirtyOnly: options.dirtyOnly ?? true,
          refetchAfterSave: options.refetchAfterSave ?? false,
          conflictPolicy: options.conflictPolicy ?? 'error',
        }),
      })
    : definedRecord({
        presentationPolicy: definedRecord({
          publishGuard: key === 'blank' && !visibleFieldBindings.length ? 'design-only-until-fields-selected' : undefined,
          submitMode: key === 'basic-entry' ? 'upsert' : undefined,
        }),
      });
  const resultBindings = definedRecord({
    statusField: options.statusField ?? '_生成状态',
    resultField: options.resultField,
    summaryField: options.summaryField,
    messageField: options.messageField,
    changeLogField: options.changeLogField,
    writeBackField: options.writeBackField,
  });
  const runtime = definedRecord({
    ruleCode: scaffold.form.ruleCode || undefined,
    diagnostics: scaffold.diagnostics.length ? structuredClone(scaffold.diagnostics) : undefined,
    workflows: scaffold.workflow ? [summarizeWorkflow(scaffold.workflow)] : [],
    behaviors: scaffold.behaviors.length ? summarizeBehaviors(scaffold.behaviors) : [],
  });
  return applyTemplateConfiguration(design, { copy, layout, fieldProjection, preview, policy, resultBindings, runtime });
}

function createMasterDetailRelationDesign(index: number, options: CreateDesignTemplateOptions & { table: SrcTableEntry; relation: DataRelation; tables: SrcTableEntry[] }) {
  const masterTable = options.table;
  const masterSheet = resolveSheet(masterTable, options.sheetName);
  const detailTable = options.tables.find((item) => item.id === (options.detailTableId || options.relation.right.tableId));
  const detailSheet = resolveSheet(detailTable, options.detailSheetName || options.relation.right.sheetName);
  if (!masterSheet || !detailTable || !detailSheet) return createMasterDetailSkeleton(index, options);
  const masterFields = options.masterFields?.length ? options.masterFields : options.selectedFields?.length ? options.selectedFields : masterSheet.headers;
  const detailFields = options.detailFields?.length ? options.detailFields : detailSheet.headers;
  const detailRows = Math.max(1, Math.min(10, Number(options.detailRows || 6) || 6));
  const detailEditableMode = options.detailEditableMode || 'readonly';
  const design = createDesignFile(options.name || `主从详情 ${index}`, { formMode: 'edit', templateKey: 'master-detail' });
  design.formWindow = createFormWindow(
    options.title || '主从详情表单',
    options.subtitle || `按关系 ${options.relation.name} 生成主记录与明细区预览。`,
  );
  design.templateParameters = {
    relationId: options.relation.id,
    masterTableId: masterTable.id,
    masterSheetName: masterSheet.name,
    detailTableId: detailTable.id,
    detailSheetName: detailSheet.name,
    masterFields,
    detailFields,
    detailTitle: options.detailTitle || (detailTable.fileName || detailTable.id),
    detailRows,
    detailEditableMode,
    allowEmptyDetails: options.allowEmptyDetails !== false,
  };
  design.components = [
    component('master_detail_relation_notice', 'text', 80, 96, 760, 42, {
      name: 'masterDetailRelationNotice',
      content: `主表 ${masterTable.fileName || masterTable.id} / ${masterSheet.name} → 明细表 ${detailTable.fileName || detailTable.id} / ${detailSheet.name}（${options.relation.cardinality}）`,
      fontSize: 13,
      color: '#475569',
    }),
    component('table_master', 'table', 80, 150, 340, 420, {
      label: options.title || '主记录列表',
      name: 'masterTable',
      columns: masterFields,
      data: masterSheet.preview.slice(0, 6).map((row) => Object.fromEntries(masterFields.map((field) => [field, row[field]]))),
      dataSource: { tableId: masterTable.id, sheetName: masterSheet.name },
      rows: Math.min(6, Math.max(2, masterSheet.preview.length)),
      striped: true,
      showGrid: true,
    }),
    component('detail_header', 'text', 460, 150, 340, 36, {
      name: 'detailHeader',
      content: '明细字段预览',
      fontSize: 16,
      fontWeight: 650,
      color: '#1f2937',
    }),
    component('detail_relation_key', 'text', 460, 188, 340, 28, {
      name: 'detailRelationKey',
      content: `关联键：${options.relation.left.fields.join('、')} → ${options.relation.right.fields.join('、')}`,
      fontSize: 12,
      color: '#64748b',
    }),
    component('table_detail', 'table', 460, 230, 380, 260, {
      label: options.detailTitle || detailTable.fileName || detailTable.id,
      name: 'detailTable',
      columns: detailFields,
      data: detailSheet.preview.slice(0, detailRows).map((row) => Object.fromEntries(detailFields.map((field) => [field, row[field]]))),
      dataSource: { tableId: detailTable.id, sheetName: detailSheet.name },
      rows: detailRows,
      striped: true,
      showGrid: true,
      editable: detailEditableMode !== 'readonly',
      addable: detailEditableMode !== 'readonly',
      removable: detailEditableMode !== 'readonly',
      emptyStateText: options.allowEmptyDetails === false ? '至少保留一条明细后再保存' : '允许空明细预览',
    }),
    component('button_save_detail', 'button', 660, 520, 180, 52, {
      label: options.saveLabel || '保存详情',
      name: 'saveDetail',
      icon: '💾',
      disabled: detailEditableMode === 'readonly',
    }),
  ];
  return applyTemplateConfiguration(design, {
    copy: definedRecord({
      title: String(design.formWindow.props?.title || design.name),
      subtitle: design.formWindow.props?.subtitle ? String(design.formWindow.props.subtitle) : undefined,
      successMessage: options.successMessage,
      failureMessage: options.failureMessage,
      emptyStateMessage: options.allowEmptyDetails === false ? '至少保留一条明细后再保存' : (options.emptyStateMessage || '允许空明细预览'),
    }),
    layout: definedRecord({
      sectionMode: 'master-detail',
      columns: options.columns,
      labelWidth: options.labelWidth,
      density: options.density,
      defaultExpanded: options.defaultExpanded ?? true,
    }),
    fieldProjection: definedRecord({
      visibleFields: [...masterFields.map((field) => `${masterTable.id}.${field}`), ...detailFields.map((field) => `${detailTable.id}.${field}`)],
      masterFields,
      detailFields,
      hiddenFields: options.hiddenFields,
      readonlyFields: detailEditableMode === 'readonly' ? detailFields : options.readonlyFields,
    }),
    preview: definedRecord({
      previewRows: options.previewRows ?? Math.min(6, Math.max(1, masterSheet.preview.length || 1)),
      detailRows,
      pageSize: options.pageSize ?? Math.max(1, detailRows),
      defaultExpanded: options.defaultExpanded ?? true,
    }),
    policy: definedRecord({
      detailPolicy: definedRecord({
        allowEmptyDetails: options.allowEmptyDetails !== false,
        detailEditableMode,
        duplicateDetailPolicy: options.duplicateDetailPolicy ?? 'error',
        joinType: options.relation.defaultJoinType,
      }),
    }),
    resultBindings: definedRecord({
      statusField: options.statusField ?? '_主从详情状态',
      resultField: options.resultField,
      summaryField: options.summaryField,
      messageField: options.messageField,
      changeLogField: options.changeLogField,
      writeBackField: options.writeBackField,
    }),
    runtime: definedRecord({
      diagnostics: ['请基于真实关系继续生成主从加载、传播和提交流程。'],
      workflows: [],
      behaviors: [],
    }),
  });
}

function createBasicEntrySkeleton(index: number, options: CreateDesignTemplateOptions = {}): DesignFile {
  const design = createDesignFile(options.name || `基础录入 ${index}`, { formMode: 'create', templateKey: 'basic-entry' });
  design.formWindow = createFormWindow(
    options.title || '基础录入表单',
    options.subtitle || '导入字段后自动生成录入控件；未导入时可手动添加真实业务字段。',
  );
  design.components = [
    component('basic_entry_notice', 'text', 100, 160, 640, 48, {
      name: 'basicEntryNotice',
      content: '当前模板不再预置示例字段。请从数据字段生成，或手动添加实际业务控件。',
      fontSize: 14,
      color: '#334155',
    }),
    component('button_save', 'button', 100, 260, 180, 52, { label: options.saveLabel || '保存', name: 'saveEntry', icon: '💾' }),
    ...(options.includeReset === false ? [] : [component('button_reset', 'button', 320, 260, 160, 52, { label: '重置', name: 'resetEntry' })]),
  ];
  return applyTemplateConfiguration(design, {
    copy: definedRecord({
      title: String(design.formWindow.props?.title || design.name),
      subtitle: design.formWindow.props?.subtitle ? String(design.formWindow.props.subtitle) : undefined,
      successMessage: options.successMessage,
      failureMessage: options.failureMessage,
      emptyStateMessage: options.emptyStateMessage,
    }),
    layout: definedRecord({
      columns: options.columns ?? 1,
      labelWidth: options.labelWidth,
      density: options.density,
      sectionMode: 'skeleton',
    }),
    fieldProjection: definedRecord({
      visibleFields: [],
      hiddenFields: options.hiddenFields,
      readonlyFields: options.readonlyFields,
    }),
    preview: definedRecord({
      previewRows: options.previewRows ?? 0,
      sampleRows: options.sampleRows ?? 0,
      pageSize: options.pageSize ?? 1,
      defaultExpanded: options.defaultExpanded ?? true,
    }),
    policy: definedRecord({
      entryPolicy: definedRecord({
        submitMode: 'upsert',
      }),
    }),
    resultBindings: definedRecord({
      statusField: options.statusField ?? '_生成状态',
      resultField: options.resultField,
      summaryField: options.summaryField,
      messageField: options.messageField,
      changeLogField: options.changeLogField,
      writeBackField: options.writeBackField,
    }),
    runtime: definedRecord({
      diagnostics: ['请导入真实字段后生成规则、保存流程和初始化行为。'],
      workflows: [],
      behaviors: [],
    }),
  });
}

function createLookupEditSkeleton(index: number, options: CreateDesignTemplateOptions = {}): DesignFile {
  const design = createDesignFile(options.name || `查询修改 ${index}`, { formMode: 'lookup-edit', templateKey: 'lookup-edit' });
  design.formWindow = createFormWindow(
    options.title || '查询修改表单',
    options.subtitle || '导入字段后自动生成查询区与编辑区；未导入时仅保留通用骨架。',
  );
  design.templateParameters = {
    ...(options.queryFields?.length ? { queryFields: options.queryFields } : {}),
    ...(options.editableFields?.length ? { editableFields: options.editableFields } : {}),
  };
  design.components = [
    component('lookup_notice', 'text', 100, 150, 660, 48, {
      name: 'lookupNotice',
      content: '请先配置查询字段与可编辑字段，再生成真实控件与校验逻辑。',
      fontSize: 14,
      color: '#334155',
    }),
    component('button_lookup', 'button', 100, 240, 180, 52, { label: options.lookupLabel || '查找记录', name: 'lookupRecord', icon: '🔍' }),
    component('button_update', 'button', 320, 240, 180, 52, { label: options.saveLabel || '保存修改', name: 'saveLookupEdit', icon: '💾', disabled: true }),
  ];
  return applyTemplateConfiguration(design, {
    copy: definedRecord({
      title: String(design.formWindow.props?.title || design.name),
      subtitle: design.formWindow.props?.subtitle ? String(design.formWindow.props.subtitle) : undefined,
      successMessage: options.successMessage,
      failureMessage: options.failureMessage,
      emptyStateMessage: options.emptyStateMessage,
    }),
    layout: definedRecord({
      columns: options.columns ?? 2,
      labelWidth: options.labelWidth,
      density: options.density,
      sectionMode: 'lookup-skeleton',
    }),
    fieldProjection: definedRecord({
      visibleFields: [],
      queryFields: options.queryFields,
      editableFields: options.editableFields,
      hiddenFields: options.hiddenFields,
      readonlyFields: options.readonlyFields,
    }),
    preview: definedRecord({
      previewRows: options.previewRows ?? 0,
      sampleRows: options.sampleRows ?? 0,
      pageSize: options.pageSize ?? 1,
      defaultExpanded: options.defaultExpanded ?? true,
    }),
    policy: definedRecord({
      lookupPolicy: definedRecord({
        queryLimit: options.queryLimit ?? 1,
        autoQueryOnLoad: options.autoQueryOnLoad ?? false,
        queryMode: options.queryMode ?? 'all',
        dirtyOnly: options.dirtyOnly ?? true,
        refetchAfterSave: options.refetchAfterSave ?? false,
        conflictPolicy: options.conflictPolicy ?? 'error',
      }),
    }),
    resultBindings: definedRecord({
      statusField: options.statusField ?? '_查询状态',
      resultField: options.resultField,
      summaryField: options.summaryField,
      messageField: options.messageField,
      changeLogField: options.changeLogField,
      writeBackField: options.writeBackField,
    }),
    runtime: definedRecord({
      diagnostics: ['请先配置查询字段与可编辑字段，再生成查询、回填和保存流程。'],
      workflows: [],
      behaviors: [],
    }),
  });
}

function createMasterDetailSkeleton(index: number, options: CreateDesignTemplateOptions = {}): DesignFile {
  const design = createDesignFile(options.name || `主从详情 ${index}`, { formMode: 'edit', templateKey: 'master-detail' });
  design.formWindow = createFormWindow(
    options.title || '主从详情表单',
    options.subtitle || '选择关系后生成主记录列表与明细区；默认不预置示例字段。',
  );
  design.components = [
    component('table_master', 'table', 80, 150, 360, 420, { label: '主记录列表', name: 'masterTable', columns: [] }),
    component('detail_notice', 'text', 500, 190, 320, 72, {
      name: 'detailNotice',
      content: '请基于真实 one-to-many / one-to-one 关系生成明细字段。',
      fontSize: 14,
      color: '#334155',
    }),
    component('button_save_detail', 'button', 640, 490, 180, 52, { label: options.saveLabel || '保存详情', name: 'saveDetail', icon: '💾', disabled: true }),
  ];
  return applyTemplateConfiguration(design, {
    copy: definedRecord({
      title: String(design.formWindow.props?.title || design.name),
      subtitle: design.formWindow.props?.subtitle ? String(design.formWindow.props.subtitle) : undefined,
      successMessage: options.successMessage,
      failureMessage: options.failureMessage,
      emptyStateMessage: options.emptyStateMessage,
    }),
    layout: definedRecord({
      sectionMode: 'master-detail-skeleton',
      columns: options.columns,
      labelWidth: options.labelWidth,
      density: options.density,
      defaultExpanded: options.defaultExpanded ?? true,
    }),
    fieldProjection: definedRecord({
      visibleFields: [],
      masterFields: options.masterFields,
      detailFields: options.detailFields,
      hiddenFields: options.hiddenFields,
      readonlyFields: options.readonlyFields,
    }),
    preview: definedRecord({
      previewRows: options.previewRows ?? 0,
      detailRows: options.detailRows ?? 6,
      pageSize: options.pageSize ?? 1,
      defaultExpanded: options.defaultExpanded ?? true,
    }),
    policy: definedRecord({
      detailPolicy: definedRecord({
        allowEmptyDetails: options.allowEmptyDetails !== false,
        detailEditableMode: options.detailEditableMode || 'readonly',
        duplicateDetailPolicy: options.duplicateDetailPolicy ?? 'error',
      }),
    }),
    resultBindings: definedRecord({
      statusField: options.statusField ?? '_主从详情状态',
      resultField: options.resultField,
      summaryField: options.summaryField,
      messageField: options.messageField,
      changeLogField: options.changeLogField,
      writeBackField: options.writeBackField,
    }),
    runtime: definedRecord({
      diagnostics: ['请先选择真实关系，再生成主从查询、外键传播和事务提交流程。'],
      workflows: [],
      behaviors: [],
    }),
  });
}

export function createDesignFromTemplate(key: string, index = 1, options: CreateDesignTemplateOptions = {}): DesignFile {
  if (key === 'master-detail' && options.table && options.relation && options.tables?.length) {
    return createMasterDetailRelationDesign(index, { ...options, table: options.table, relation: options.relation, tables: options.tables });
  }
  if (options.table && options.sheetName && ['blank', 'basic-entry', 'lookup-edit', 'master-detail'].includes(key)) {
    return createScaffoldedDesign(key, index, { ...options, table: options.table, sheetName: options.sheetName });
  }
  if (key === 'blank') {
    const design = createDesignFile(options.name || `设计 ${index}`, { formMode: 'create', templateKey: key });
    return applyTemplateConfiguration(applyWindowPresentation(design, options.title, options.subtitle), {
      copy: definedRecord({
        title: String(options.title || design.formWindow.props?.title || design.name),
        subtitle: options.subtitle ?? design.formWindow.props?.subtitle,
        successMessage: options.successMessage,
        failureMessage: options.failureMessage,
        emptyStateMessage: options.emptyStateMessage,
      }),
      layout: definedRecord({
        columns: options.columns ?? 1,
        sectionMode: 'blank-draft',
        labelWidth: options.labelWidth,
        density: options.density,
      }),
      fieldProjection: definedRecord({
        visibleFields: options.selectedFields || [],
        hiddenFields: options.hiddenFields,
        readonlyFields: options.readonlyFields,
      }),
      preview: definedRecord({
        previewRows: options.previewRows ?? 0,
        sampleRows: options.sampleRows ?? 0,
        pageSize: options.pageSize ?? 1,
        defaultExpanded: options.defaultExpanded ?? true,
      }),
      policy: definedRecord({
        presentationPolicy: definedRecord({
          publishGuard: 'design-only-until-fields-selected',
        }),
      }),
      resultBindings: definedRecord({
        statusField: options.statusField ?? '_生成状态',
        resultField: options.resultField,
        summaryField: options.summaryField,
        messageField: options.messageField,
        changeLogField: options.changeLogField,
        writeBackField: options.writeBackField,
      }),
      runtime: definedRecord({
        diagnostics: ['空白模板当前仅允许设计态；选择真实字段后再生成规则、流程与行为。'],
        workflows: [],
        behaviors: [],
      }),
    });
  }

  if (key === 'basic-entry') {
    return createBasicEntrySkeleton(index, options);
  }

  if (key === 'lookup-edit') {
    return createLookupEditSkeleton(index, options);
  }

  return createMasterDetailSkeleton(index, options);
}
