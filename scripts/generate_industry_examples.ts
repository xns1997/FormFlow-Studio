import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProjectPackage } from '../server/src/services/project-package-store';
import { exportToZip } from '../ui/src/project/packageManager';
import {
  createColumnRecord,
  createDefaultProjectRelease,
  createDefaultProjectSettings,
  createDefaultTableConfig,
  createRowRecord,
  type BehaviorFile,
  type DesignComponent,
  type FormEntry,
  type ProjectStructure,
  type SrcSheetInfo,
  type SrcTableEntry,
  type WorkflowEdge,
  type WorkflowFile,
  type WorkflowNode,
} from '../ui/src/project/types';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(root, 'projects');
const now = '2026-07-06T18:00:00.000Z';

type FieldType = 'input' | 'number' | 'select' | 'datePicker' | 'switch' | 'textarea';

type FieldDef = {
  field: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  createReadonly?: boolean;
  editReadonly?: boolean;
  defaultValue?: unknown;
};

type ExampleConfig = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  tableId: string;
  sheetName: string;
  fileName: string;
  keyField: string;
  rows: Record<string, unknown>[];
  fieldDefs: FieldDef[];
  listColumns: string[];
  searchField: { name: string; sourceField: string; options: string[] };
  statsFilter: { name: string; paramName: string; label: string; options: string[] };
  batchParam: { name: string; paramName: string; label: string; defaultValue: number };
  predictParam: { name: string; paramName: string; label: string; defaultValue: number };
  summaryFields: { stats: string; batch: string; predict: string };
  resultFields: { stats: string; batch: string; predict: string };
  resultColumns: { stats: string[]; batch: string[]; predict: string[] };
  createDefaults: Record<string, unknown>;
  createPreSubmitScript?: string;
  updatePreSubmitScript?: string;
  statsScript: string;
  batchScript: string;
  predictScript: string;
};

function buildSheetInfo(name: string, rows: Record<string, unknown>[]): SrcSheetInfo {
  const headers = Object.keys(rows[0] || {});
  return {
    name,
    rowCount: rows.length,
    colCount: headers.length,
    headers,
    columns: headers.map((header, index) => {
      const sample = rows.map((row) => row[header]).filter((value) => value != null);
      const first = sample[0];
      let dataType: SrcSheetInfo['columns'][number]['dataType'] = 'string';
      if (typeof first === 'number') dataType = 'number';
      else if (typeof first === 'boolean') dataType = 'boolean';
      else if (typeof first === 'string' && /^\d{4}-\d{2}-\d{2}/.test(first)) dataType = 'date';
      return {
        name: header,
        index,
        dataType,
        nullable: sample.length < rows.length,
        uniqueCount: new Set(sample.map((value) => JSON.stringify(value))).size,
        sampleValues: sample.slice(0, 3),
      };
    }),
    preview: rows,
    config: undefined,
  };
}

function buildTable(config: ExampleConfig): SrcTableEntry {
  const sheet = buildSheetInfo(config.sheetName, config.rows);
  const tableConfig = createDefaultTableConfig(config.tableId, config.sheetName);
  tableConfig.keyFields = [config.keyField];
  tableConfig.filterEnabled = true;
  tableConfig.sortEnabled = true;
  tableConfig.autoFitColumns = true;
  sheet.config = tableConfig;
  return {
    id: config.tableId,
    fileName: config.fileName,
    fileSize: JSON.stringify(config.rows).length,
    fileType: 'json',
    uploadedAt: now,
    dataHash: `${config.tableId}-${config.rows.length}`,
    sheets: [sheet],
    columnRecords: sheet.headers.map((header, index) => {
      const record = createColumnRecord(config.tableId, header, index);
      record.isPrimaryKey = header === config.keyField;
      record.description = `${config.name} · ${header}`;
      return record;
    }),
    rowRecords: config.rows.map((_, index) => createRowRecord(config.tableId, index)),
  };
}

function behavior(id: string, name: string, event: string, code: string): BehaviorFile {
  return {
    id,
    name,
    event,
    code,
    priority: 10,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function textComponent(id: string, content: string, x: number, y: number, width: number, height: number, extraProps: Record<string, unknown> = {}, fieldBinding?: string): DesignComponent {
  return {
    id,
    type: 'text',
    x,
    y,
    width,
    height,
    zIndex: 1,
    fieldBinding,
    props: {
      name: id,
      content,
      fontSize: 14,
      color: '#475569',
      ...extraProps,
    },
  };
}

function fieldComponent(id: string, def: FieldDef, x: number, y: number, width: number, height: number, mode: 'create' | 'edit'): DesignComponent {
  const readonly = mode === 'create' ? def.createReadonly : def.editReadonly;
  const baseProps: Record<string, unknown> = {
    name: def.field,
    label: def.label,
    required: !!def.required,
    readonly: !!readonly,
    placeholder: def.placeholder || '',
  };
  if (def.type === 'select') baseProps.options = def.options || [];
  if (def.type === 'switch') {
    baseProps.defaultValue = def.defaultValue ?? false;
    delete baseProps.placeholder;
  }
  if (def.type === 'textarea') {
    baseProps.rows = 3;
  }
  return {
    id,
    type: def.type,
    x,
    y,
    width,
    height,
    zIndex: 2,
    fieldBinding: def.field,
    props: baseProps,
  };
}

function buttonComponent(id: string, label: string, x: number, y: number, width: number, height: number, props: Record<string, unknown>): DesignComponent {
  return {
    id,
    type: 'button',
    x,
    y,
    width,
    height,
    zIndex: 3,
    props: {
      name: id,
      label,
      variant: 'primary',
      ...props,
    },
  };
}

function tableComponent(id: string, fieldBinding: string, columns: string[], x: number, y: number, width: number, height: number, props: Record<string, unknown> = {}): DesignComponent {
  return {
    id,
    type: 'table',
    x,
    y,
    width,
    height,
    zIndex: 2,
    fieldBinding,
    props: {
      name: fieldBinding,
      columns,
      rows: 5,
      ...props,
    },
  };
}

function buildSubmitParameterMap(fields: string[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, `$form.${field}`]));
}

function buildFieldMap(fields: string[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field, field]));
}

function buildOriginalParameterMap(fields: string[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, `$form.原始${field}`]));
}

function submitWorkflow(id: string, name: string, description: string, config: ExampleConfig): WorkflowFile {
  return {
    id,
    name,
    description,
    createdAt: now,
    updatedAt: now,
    nodes: [
      {
        id: 'submit',
        type: 'formflow',
        specId: 'behavior:submit',
        position: { x: 320, y: 160 },
        data: {
          propertiesJson: JSON.stringify({
            validateFirst: true,
            target: 'changeLog',
            fileName: `${config.id}-${id}`,
            writeBackMode: 'upsert',
            writeBackTableId: config.tableId,
            writeBackSheetName: config.sheetName,
            writeBackKeyField: config.keyField,
            writeBackKeyFormField: config.keyField,
            writeBackFieldMap: buildFieldMap(config.fieldDefs.map((field) => field.field)),
          }),
        },
      },
    ],
    edges: [],
  };
}

function variableNode(id: string, varName: string, varType: string, varValue: unknown, x: number, y: number): WorkflowNode {
  return {
    id,
    type: 'generic',
    specId: 'generic:variable-input',
    position: { x, y },
    data: {
      propertiesJson: JSON.stringify({ varName, varType, varValue }),
    },
  };
}

function scriptWorkflow(
  id: string,
  name: string,
  description: string,
  inputs: Array<{ name: string; type: string; value: unknown }>,
  outputPorts: Record<string, string>,
  script: string,
): WorkflowFile {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  inputs.forEach((input, index) => {
    nodes.push(variableNode(`var_${input.name}`, input.name, input.type, input.value, 60, 80 + index * 90));
    edges.push({
      id: `edge_${input.name}`,
      source: `var_${input.name}`,
      target: 'script',
      sourceHandle: 'out:value',
      targetHandle: `in:${input.name}`,
    });
  });
  nodes.push({
    id: 'script',
    type: 'generic',
    specId: 'behavior-js-script',
    position: { x: 360, y: 180 },
    data: {
      propertiesJson: JSON.stringify({
        inputPorts: Object.fromEntries(inputs.map((item) => [item.name, item.type])),
        outputPorts,
        script,
      }),
    },
  });
  return {
    id,
    name,
    description,
    createdAt: now,
    updatedAt: now,
    nodes,
    edges,
  };
}

function nextIdScript(tableId: string, keyField: string): string {
  return `const rows = ctx.querySheet('${tableId}');
const maxId = rows.reduce((max, row) => Math.max(max, Number(row?.${keyField}) || 0), 0);
return maxId + 1;`;
}

function jsValue(value: unknown): string {
  return JSON.stringify(value);
}

function buildCreateInitScript(config: ExampleConfig): string {
  const defaultLines = Object.entries(config.createDefaults).map(([field, value]) => `await ctx.setValue('${field}', ${jsValue(value)});`);
  return `const nextId = (() => { ${nextIdScript(config.tableId, config.keyField)} })();
await ctx.setValue('${config.keyField}', nextId);
${defaultLines.join('\n')}
await ctx.setValue('状态提示', \`已初始化 ${config.keyField}：\${nextId}\`);`;
}

function buildCreateResetScript(config: ExampleConfig): string {
  const defaultLines = Object.entries(config.createDefaults).map(([field, value]) => `await ctx.setValue('${field}', ${jsValue(value)});`);
  const clearLines = config.fieldDefs
    .filter((field) => field.field !== config.keyField && !(field.field in config.createDefaults))
    .map((field) => {
      if (field.type === 'switch') return `await ctx.setValue('${field.field}', ${jsValue(field.defaultValue ?? false)});`;
      return `await ctx.setValue('${field.field}', '');`;
    });
  return `const nextId = (() => { ${nextIdScript(config.tableId, config.keyField)} })();
await ctx.setValue('${config.keyField}', nextId);
${defaultLines.join('\n')}
${clearLines.join('\n')}
await ctx.setValue('状态提示', '表单已重置，可继续录入。');`;
}

function buildCreateButtonCode(config: ExampleConfig): string {
  const requiredChecks = config.fieldDefs
    .filter((field) => field.required && field.field !== config.keyField)
    .map((field) => `if (!ctx.getValue('${field.field}') && ctx.getValue('${field.field}') !== 0) return ctx.showMessage('请填写${field.label}', 'error');`)
    .join('\n');
  const extra = config.createPreSubmitScript || '';
  return `${requiredChecks}
let currentId = Number(ctx.getValue('${config.keyField}') || 0);
if (!currentId) {
  currentId = (() => { ${nextIdScript(config.tableId, config.keyField)} })();
  await ctx.setValue('${config.keyField}', currentId);
}
${extra}
await ctx.runConfiguredWorkflow();
${buildCreateResetScript(config)}
await ctx.showMessage(\`${config.name}已新增：\${currentId}\`, 'success');`;
}

function buildSearchScript(config: ExampleConfig): string {
  return `const filterValue = String(ctx.getValue('${config.searchField.name}') || '全部');
const rows = ctx.querySheet('${config.tableId}').filter((row) => filterValue === '全部' || String(row?.${config.searchField.sourceField} ?? '') === filterValue);
await ctx.setValue('${config.id}_列表', rows);
await ctx.setValue('处理提示', \`已加载 \${rows.length} 条记录\`);`;
}

function buildRowClickScript(config: ExampleConfig): string {
  const setFields = config.fieldDefs.map((field) => `await ctx.setValue('${field.field}', row.${field.field} ?? ${field.type === 'switch' ? 'false' : "''"});`);
  const setOriginals = config.fieldDefs.map((field) => `await ctx.setValue('原始${field.field}', row.${field.field} ?? ${field.type === 'switch' ? 'false' : "''"});`);
  return `const row = ctx.detail?.row || {};
${setFields.join('\n')}
${setOriginals.join('\n')}
await ctx.setValue('处理提示', \`已载入 ${config.keyField}：\${row.${config.keyField} || ''}\`);`;
}

function buildUpdateButtonCode(config: ExampleConfig): string {
  const extra = config.updatePreSubmitScript || '';
  return `const id = ctx.getValue('${config.keyField}');
if (!id && id !== 0) return ctx.showMessage('请先从左侧表格选择记录', 'error');
${extra}
await ctx.runConfiguredWorkflow();
await ctx.setValue('处理提示', \`${config.name}已更新：\${id}\`);
await ctx.showMessage(\`${config.name}已更新：\${id}\`, 'success');`;
}

function buildAnalysisButtonCode(
  config: ExampleConfig,
  nodeId: string,
  summaryField: string,
  resultField: string,
  params: Record<string, string>,
): string {
  const extraParams = Object.entries(params).map(([key, value]) => `${JSON.stringify(key)}: ${value}`);
  return `const result = await ctx.runConfiguredWorkflow({
  rows: ctx.querySheet('${config.tableId}'),
  ${extraParams.join(',\n  ')}
});
const outputs = result.nodeResults.get('${nodeId}')?.outputs || {};
await ctx.setValue('${resultField}', outputs.rows || []);
await ctx.setValue('${summaryField}', outputs.summary || '');
return outputs.summary || '';`;
}

function buildCreateForm(config: ExampleConfig): FormEntry {
  const components: DesignComponent[] = [
    textComponent(`${config.id}_create_title`, `${config.name} · 数据录入`, 24, 24, 760, 40, { fontSize: 22, fontWeight: 'bold', color: '#0f172a' }),
    textComponent(`${config.id}_create_hint`, '状态提示', 24, 70, 760, 28, { fontSize: 13 }, '状态提示'),
  ];
  let fieldIndex = 0;
  let y = 116;
  for (const def of config.fieldDefs) {
    if (def.type === 'textarea') {
      components.push(fieldComponent(`${config.id}_create_${fieldIndex}`, def, 24, y + 90, 760, 120, 'create'));
      y += 150;
      continue;
    }
    const col = fieldIndex % 3;
    const row = Math.floor(fieldIndex / 3);
    components.push(fieldComponent(`${config.id}_create_${fieldIndex}`, def, 24 + col * 252, 116 + row * 80, 220, 60, 'create'));
    fieldIndex += 1;
  }
  const buttonY = Math.max(y + 120, 116 + Math.ceil(fieldIndex / 3) * 84);
  components.push(
    buttonComponent(`${config.id}_create_submit`, '保存录入', 24, buttonY, 220, 50, {
      events: { onClick: buildCreateButtonCode(config) },
      flowTriggers: {
        onClick: {
          enabled: true,
          workflowId: `${config.id}_wf_create`,
          parameterMap: {
            'submit.formData': buildSubmitParameterMap(config.fieldDefs.map((field) => field.field)),
          },
        },
      },
    }),
  );
  components.push(
    buttonComponent(`${config.id}_create_reset`, '重置表单', 264, buttonY, 180, 50, {
      variant: 'outline',
      events: { onClick: buildCreateResetScript(config) },
    }),
  );
  return {
    id: `${config.id}_form_create`,
    name: '数据录入',
    createdAt: now,
    updatedAt: now,
    behaviors: [
      behavior(`${config.id}_create_load`, '打开录入表单时初始化默认值', 'onFormLoad', buildCreateInitScript(config)),
    ],
    design: {
      id: `${config.id}_form_create`,
      name: '数据录入',
      formMode: 'create',
      viewport: { zoom: 1, panX: 0, panY: 0 },
      gridSize: 10,
      createdAt: now,
      updatedAt: now,
      bindings: [],
      components,
    },
  };
}

function buildEditForm(config: ExampleConfig): FormEntry {
  const components: DesignComponent[] = [
    textComponent(`${config.id}_edit_title`, `${config.name} · 数据修改`, 24, 24, 760, 40, { fontSize: 22, fontWeight: 'bold', color: '#0f172a' }),
    textComponent(`${config.id}_edit_hint`, '处理提示', 24, 70, 760, 28, { fontSize: 13 }, '处理提示'),
    {
      id: `${config.id}_search_filter`,
      type: 'select',
      x: 24,
      y: 116,
      width: 220,
      height: 60,
      zIndex: 2,
      fieldBinding: config.searchField.name,
      props: { name: config.searchField.name, label: config.searchField.name, options: config.searchField.options, defaultValue: '全部' },
    },
    buttonComponent(`${config.id}_search_btn`, '查询记录', 264, 116, 180, 50, {
      events: { onClick: buildSearchScript(config) },
    }),
    tableComponent(`${config.id}_result_table`, `${config.id}_列表`, config.listColumns, 24, 196, 520, 260, {
      events: { onRowClick: buildRowClickScript(config) },
    }),
  ];
  let normalIndex = 0;
  let textareaY = 0;
  for (const def of config.fieldDefs) {
    if (def.type === 'textarea') {
      textareaY = 116 + Math.ceil(normalIndex / 2) * 80;
      components.push(fieldComponent(`${config.id}_edit_${normalIndex}`, def, 568, textareaY, 420, 120, 'edit'));
      continue;
    }
    const col = normalIndex % 2;
    const row = Math.floor(normalIndex / 2);
    components.push(fieldComponent(`${config.id}_edit_${normalIndex}`, def, 568 + col * 220, 196 + row * 80, 200, 60, 'edit'));
    normalIndex += 1;
  }
  const buttonY = Math.max(196 + Math.ceil(normalIndex / 2) * 84 + 32, textareaY + 140);
  components.push(
    buttonComponent(`${config.id}_update_btn`, '保存修改', 568, buttonY, 220, 50, {
      events: { onClick: buildUpdateButtonCode(config) },
      flowTriggers: {
        onClick: {
          enabled: true,
          workflowId: `${config.id}_wf_update`,
          parameterMap: {
            'submit.formData': buildSubmitParameterMap(config.fieldDefs.map((field) => field.field)),
            'submit.originalData': buildOriginalParameterMap(config.fieldDefs.map((field) => field.field)),
          },
        },
      },
    }),
  );
  return {
    id: `${config.id}_form_edit`,
    name: '数据修改',
    createdAt: now,
    updatedAt: now,
    behaviors: [
      behavior(`${config.id}_edit_load`, '打开修改表单时加载默认列表', 'onFormLoad', `const rows = ctx.querySheet('${config.tableId}'); await ctx.setValue('${config.id}_列表', rows); await ctx.setValue('处理提示', \`已加载 \${rows.length} 条记录\`);`),
    ],
    design: {
      id: `${config.id}_form_edit`,
      name: '数据修改',
      formMode: 'lookup-edit',
      viewport: { zoom: 1, panX: 0, panY: 0 },
      gridSize: 10,
      createdAt: now,
      updatedAt: now,
      bindings: [],
      components,
    },
  };
}

function buildAnalysisForm(config: ExampleConfig): FormEntry {
  const components: DesignComponent[] = [
    textComponent(`${config.id}_analysis_title`, `${config.name} · 统计分析 / 批量处理 / 预测`, 24, 24, 900, 40, { fontSize: 22, fontWeight: 'bold', color: '#0f172a' }),
    textComponent(`${config.id}_analysis_hint`, '分析说明', 24, 70, 900, 28, { fontSize: 13 }, '分析说明'),
    {
      id: `${config.id}_stats_filter`,
      type: 'select',
      x: 24,
      y: 116,
      width: 220,
      height: 60,
      zIndex: 2,
      fieldBinding: config.statsFilter.name,
      props: { name: config.statsFilter.name, label: config.statsFilter.label, options: config.statsFilter.options, defaultValue: '全部' },
    },
    {
      id: `${config.id}_batch_param`,
      type: 'number',
      x: 264,
      y: 116,
      width: 180,
      height: 60,
      zIndex: 2,
      fieldBinding: config.batchParam.name,
      props: { name: config.batchParam.name, label: config.batchParam.label, defaultValue: config.batchParam.defaultValue, min: 0 },
    },
    {
      id: `${config.id}_predict_param`,
      type: 'number',
      x: 464,
      y: 116,
      width: 180,
      height: 60,
      zIndex: 2,
      fieldBinding: config.predictParam.name,
      props: { name: config.predictParam.name, label: config.predictParam.label, defaultValue: config.predictParam.defaultValue, min: 1 },
    },
    buttonComponent(`${config.id}_stats_btn`, '统计分析', 664, 116, 120, 50, {
      events: {
        onClick: buildAnalysisButtonCode(config, 'script', config.summaryFields.stats, config.resultFields.stats, {
          [config.statsFilter.paramName]: `String(ctx.getValue('${config.statsFilter.name}') || '全部')`,
        }),
      },
      flowTriggers: { onClick: { enabled: true, workflowId: `${config.id}_wf_stats` } },
    }),
    buttonComponent(`${config.id}_batch_btn`, '批量处理', 804, 116, 120, 50, {
      events: {
        onClick: buildAnalysisButtonCode(config, 'script', config.summaryFields.batch, config.resultFields.batch, {
          [config.statsFilter.paramName]: `String(ctx.getValue('${config.statsFilter.name}') || '全部')`,
          [config.batchParam.paramName]: `Number(ctx.getValue('${config.batchParam.name}') || 0)`,
        }),
      },
      flowTriggers: { onClick: { enabled: true, workflowId: `${config.id}_wf_batch` } },
    }),
    buttonComponent(`${config.id}_predict_btn`, '预测', 944, 116, 120, 50, {
      events: {
        onClick: buildAnalysisButtonCode(config, 'script', config.summaryFields.predict, config.resultFields.predict, {
          [config.statsFilter.paramName]: `String(ctx.getValue('${config.statsFilter.name}') || '全部')`,
          [config.predictParam.paramName]: `Number(ctx.getValue('${config.predictParam.name}') || 1)`,
        }),
      },
      flowTriggers: { onClick: { enabled: true, workflowId: `${config.id}_wf_predict` } },
    }),
    {
      id: `${config.id}_stats_summary`,
      type: 'textarea',
      x: 24,
      y: 206,
      width: 340,
      height: 100,
      zIndex: 2,
      fieldBinding: config.summaryFields.stats,
      props: { name: config.summaryFields.stats, label: '统计摘要', readonly: true, rows: 4 },
    },
    tableComponent(`${config.id}_stats_table`, config.resultFields.stats, config.resultColumns.stats, 384, 206, 680, 180),
    {
      id: `${config.id}_batch_summary`,
      type: 'textarea',
      x: 24,
      y: 410,
      width: 340,
      height: 100,
      zIndex: 2,
      fieldBinding: config.summaryFields.batch,
      props: { name: config.summaryFields.batch, label: '批量处理摘要', readonly: true, rows: 4 },
    },
    tableComponent(`${config.id}_batch_table`, config.resultFields.batch, config.resultColumns.batch, 384, 410, 680, 180),
    {
      id: `${config.id}_predict_summary`,
      type: 'textarea',
      x: 24,
      y: 614,
      width: 340,
      height: 100,
      zIndex: 2,
      fieldBinding: config.summaryFields.predict,
      props: { name: config.summaryFields.predict, label: '预测摘要', readonly: true, rows: 4 },
    },
    tableComponent(`${config.id}_predict_table`, config.resultFields.predict, config.resultColumns.predict, 384, 614, 680, 180),
  ];
  return {
    id: `${config.id}_form_analysis`,
    name: '统计分析',
    createdAt: now,
    updatedAt: now,
    behaviors: [
      behavior(`${config.id}_analysis_load`, '打开分析表单时给出说明', 'onFormLoad', `await ctx.setValue('分析说明', '可直接执行统计分析、批量处理和预测，无需手工导出数据。');`),
    ],
    design: {
      id: `${config.id}_form_analysis`,
      name: '统计分析',
      formMode: 'detail',
      viewport: { zoom: 1, panX: 0, panY: 0 },
      gridSize: 10,
      createdAt: now,
      updatedAt: now,
      bindings: [],
      components,
    },
  };
}

function buildProject(config: ExampleConfig): ProjectStructure {
  const table = buildTable(config);
  return {
    config: {
      id: config.id,
      name: config.name,
      description: config.description,
      version: '2.3.0',
      createdAt: now,
      updatedAt: now,
      author: 'FormFlow Studio',
      tags: config.tags,
    },
    settings: {
      ...createDefaultProjectSettings(),
      publish: {
        format: 'json',
        allowWriteBack: true,
        generateChangeLog: true,
        outputFileName: `${config.id}-export`,
      },
      updatedAt: now,
    },
    release: {
      ...createDefaultProjectRelease(),
      mode: 'use',
      defaultFormId: `${config.id}_form_create`,
      defaultSheet: config.sheetName,
      allowDesigner: false,
      allowBehaviorEditor: false,
      allowWorkflowEditor: false,
      lastVerifiedAt: now,
    },
    srcTable: [table],
    globalBehaviors: [],
    forms: [
      buildCreateForm(config),
      buildEditForm(config),
      buildAnalysisForm(config),
    ],
    workflows: [
      submitWorkflow(`${config.id}_wf_create`, '新增数据', `新增 ${config.name}`, config),
      submitWorkflow(`${config.id}_wf_update`, '更新数据', `更新 ${config.name}`, config),
      scriptWorkflow(
        `${config.id}_wf_stats`,
        '统计分析',
        `${config.name} 统计分析`,
        [
          { name: 'rows', type: 'array', value: config.rows },
          { name: config.statsFilter.paramName, type: 'string', value: '全部' },
        ],
        { summary: 'string', rows: 'array' },
        config.statsScript,
      ),
      scriptWorkflow(
        `${config.id}_wf_batch`,
        '批量处理',
        `${config.name} 批量处理`,
        [
          { name: 'rows', type: 'array', value: config.rows },
          { name: config.statsFilter.paramName, type: 'string', value: '全部' },
          { name: config.batchParam.paramName, type: 'number', value: config.batchParam.defaultValue },
        ],
        { summary: 'string', rows: 'array' },
        config.batchScript,
      ),
      scriptWorkflow(
        `${config.id}_wf_predict`,
        '预测',
        `${config.name} 预测分析`,
        [
          { name: 'rows', type: 'array', value: config.rows },
          { name: config.statsFilter.paramName, type: 'string', value: '全部' },
          { name: config.predictParam.paramName, type: 'number', value: config.predictParam.defaultValue },
        ],
        { summary: 'string', rows: 'array' },
        config.predictScript,
      ),
    ],
    outputs: [
      { id: `${config.id}_output_stats`, name: '统计分析结果', format: 'json', size: 0, createdAt: now },
      { id: `${config.id}_output_batch`, name: '批量处理结果', format: 'json', size: 0, createdAt: now },
      { id: `${config.id}_output_predict`, name: '预测结果', format: 'json', size: 0, createdAt: now },
    ],
  };
}

const employeeRows = [
  { 员工ID: 1001, 姓名: '李明', 部门: '技术部', 岗位: '后端工程师', 入职日期: '2024-03-12', 在职: true, 月薪: 18000 },
  { 员工ID: 1002, 姓名: '周洁', 部门: '销售部', 岗位: '区域经理', 入职日期: '2023-08-01', 在职: true, 月薪: 21000 },
  { 员工ID: 1003, 姓名: '王晨', 部门: '技术部', 岗位: '测试工程师', 入职日期: '2022-11-20', 在职: false, 月薪: 13500 },
  { 员工ID: 1004, 姓名: '陈雪', 部门: '人事部', 岗位: 'HRBP', 入职日期: '2025-01-15', 在职: true, 月薪: 14500 },
  { 员工ID: 1005, 姓名: '高峰', 部门: '技术部', 岗位: '架构师', 入职日期: '2021-06-08', 在职: true, 月薪: 26000 },
];

const studentRows = [
  { 学号: 3001, 姓名: '林涛', 班级: '高一(1)班', 语文: 108, 数学: 116, 英语: 112, 出勤率: 98, 风险等级: '低' },
  { 学号: 3002, 姓名: '张悦', 班级: '高一(1)班', 语文: 86, 数学: 92, 英语: 88, 出勤率: 93, 风险等级: '中' },
  { 学号: 3003, 姓名: '黄欣', 班级: '高一(2)班', 语文: 72, 数学: 68, 英语: 75, 出勤率: 89, 风险等级: '高' },
  { 学号: 3004, 姓名: '吴楠', 班级: '高一(2)班', 语文: 119, 数学: 124, 英语: 121, 出勤率: 99, 风险等级: '低' },
  { 学号: 3005, 姓名: '赵倩', 班级: '高一(3)班', 语文: 95, 数学: 101, 英语: 97, 出勤率: 96, 风险等级: '中' },
];

const valveRows = [
  { 申请单号: 5001, 项目名称: '一号线改造', 介质: '清水', 公称通径DN: 80, 压力等级PN: 16, 设计温度: 35, 设计流量: 120, 推荐型号: 'H44H-16C-DN80', 选型状态: '已通过' },
  { 申请单号: 5002, 项目名称: '蒸汽管廊', 介质: '蒸汽', 公称通径DN: 100, 压力等级PN: 25, 设计温度: 220, 设计流量: 160, 推荐型号: 'H41H-25P-DN100', 选型状态: '待复核' },
  { 申请单号: 5003, 项目名称: '化工回路', 介质: '腐蚀液', 公称通径DN: 50, 压力等级PN: 16, 设计温度: 90, 设计流量: 48, 推荐型号: 'HC41F-16P-DN50', 选型状态: '已通过' },
  { 申请单号: 5004, 项目名称: '消防支线', 介质: '清水', 公称通径DN: 150, 压力等级PN: 16, 设计温度: 30, 设计流量: 260, 推荐型号: 'H44H-16C-DN150', 选型状态: '待选型' },
  { 申请单号: 5005, 项目名称: '油品输送', 介质: '油品', 公称通径DN: 65, 压力等级PN: 25, 设计温度: 80, 设计流量: 92, 推荐型号: 'H41H-25C-DN65', 选型状态: '待复核' },
];

const renewableRows = [
  { 记录ID: 8001, 日期: '2026-07-01', 场站: '青海光伏一站', 发电类型: '光伏', 发电量MWh: 126.5, 资源指标: 7.2, 限电损失MWh: 4.5, 设备可用率: 98.6 },
  { 记录ID: 8002, 日期: '2026-07-02', 场站: '青海光伏一站', 发电类型: '光伏', 发电量MWh: 130.1, 资源指标: 7.5, 限电损失MWh: 3.2, 设备可用率: 99.1 },
  { 记录ID: 8003, 日期: '2026-07-03', 场站: '甘肃风电二场', 发电类型: '风电', 发电量MWh: 188.4, 资源指标: 8.9, 限电损失MWh: 6.8, 设备可用率: 96.8 },
  { 记录ID: 8004, 日期: '2026-07-04', 场站: '甘肃风电二场', 发电类型: '风电', 发电量MWh: 176.2, 资源指标: 7.8, 限电损失MWh: 8.1, 设备可用率: 95.9 },
  { 记录ID: 8005, 日期: '2026-07-05', 场站: '宁夏储能联营', 发电类型: '储能', 发电量MWh: 92.7, 资源指标: 5.4, 限电损失MWh: 1.2, 设备可用率: 99.4 },
];

const employeeConfig: ExampleConfig = {
  id: 'example_employee_mgmt',
  name: '员工在职信息',
  description: '覆盖员工录入、修改、统计分析、批量调薪与人力成本预测。',
  tags: ['示例', '员工', '在职信息', '统计分析', '预测'],
  tableId: 'employees',
  sheetName: '员工信息',
  fileName: '员工信息.json',
  keyField: '员工ID',
  rows: employeeRows,
  fieldDefs: [
    { field: '员工ID', label: '员工ID', type: 'number', createReadonly: true, editReadonly: true },
    { field: '姓名', label: '姓名', type: 'input', required: true, placeholder: '请输入姓名' },
    { field: '部门', label: '部门', type: 'select', required: true, options: ['技术部', '销售部', '人事部', '财务部'] },
    { field: '岗位', label: '岗位', type: 'input', required: true, placeholder: '请输入岗位' },
    { field: '入职日期', label: '入职日期', type: 'datePicker', required: true },
    { field: '在职', label: '在职', type: 'switch', defaultValue: true },
    { field: '月薪', label: '月薪', type: 'number', required: true, placeholder: '单位：元' },
  ],
  listColumns: ['员工ID', '姓名', '部门', '岗位', '在职', '月薪'],
  searchField: { name: '筛选部门', sourceField: '部门', options: ['全部', '技术部', '销售部', '人事部', '财务部'] },
  statsFilter: { name: '统计部门', paramName: 'department', label: '统计部门', options: ['全部', '技术部', '销售部', '人事部', '财务部'] },
  batchParam: { name: '调薪百分比', paramName: 'raisePercent', label: '调薪百分比', defaultValue: 5 },
  predictParam: { name: '预测月数', paramName: 'months', label: '预测月数', defaultValue: 3 },
  summaryFields: { stats: '统计摘要', batch: '批量摘要', predict: '预测摘要' },
  resultFields: { stats: '统计结果', batch: '批量结果', predict: '预测结果' },
  resultColumns: {
    stats: ['部门', '人数', '在职人数', '平均月薪'],
    batch: ['员工ID', '姓名', '部门', '原月薪', '调整后月薪'],
    predict: ['月份', '预测在职人数', '预测人工成本'],
  },
  createDefaults: { 部门: '技术部', 入职日期: '2026-07-06', 在职: true },
  statsScript: `const rows = Array.isArray(inputs.rows) ? inputs.rows : [];
const department = String(inputs.department || '全部');
const filtered = department === '全部' ? rows : rows.filter((row) => String(row?.部门 || '') === department);
const groups = new Map();
for (const row of filtered) {
  const key = String(row?.部门 || '未分配');
  const bucket = groups.get(key) || { 部门: key, 人数: 0, 在职人数: 0, 月薪合计: 0 };
  bucket.人数 += 1;
  if (row?.在职) bucket.在职人数 += 1;
  bucket.月薪合计 += Number(row?.月薪 || 0);
  groups.set(key, bucket);
}
const resultRows = Array.from(groups.values()).map((item) => ({
  部门: item.部门,
  人数: item.人数,
  在职人数: item.在职人数,
  平均月薪: item.人数 ? Number((item.月薪合计 / item.人数).toFixed(0)) : 0,
}));
const totalSalary = filtered.reduce((sum, row) => sum + Number(row?.月薪 || 0), 0);
return {
  summary: \`共 \${filtered.length} 名员工，其中在职 \${filtered.filter((row) => row?.在职).length} 人，月薪总额 \${totalSalary} 元。\`,
  rows: resultRows,
};`,
  batchScript: `const rows = Array.isArray(inputs.rows) ? inputs.rows : [];
const department = String(inputs.department || '全部');
const raisePercent = Number(inputs.raisePercent || 0);
const filtered = rows.filter((row) => row?.在职 && (department === '全部' || String(row?.部门 || '') === department));
const resultRows = filtered.map((row) => {
  const current = Number(row?.月薪 || 0);
  const next = Number((current * (1 + raisePercent / 100)).toFixed(0));
  return {
    员工ID: row?.员工ID,
    姓名: row?.姓名,
    部门: row?.部门,
    原月薪: current,
    调整后月薪: next,
  };
});
return {
  summary: \`已为 \${resultRows.length} 名在职员工生成批量调薪预案，调薪比例 \${raisePercent}% 。\`,
  rows: resultRows,
};`,
  predictScript: `const rows = Array.isArray(inputs.rows) ? inputs.rows : [];
const department = String(inputs.department || '全部');
const months = Math.max(1, Number(inputs.months || 1));
const filtered = rows.filter((row) => row?.在职 && (department === '全部' || String(row?.部门 || '') === department));
const baseCount = filtered.length;
const baseCost = filtered.reduce((sum, row) => sum + Number(row?.月薪 || 0), 0);
const resultRows = Array.from({ length: months }, (_, index) => ({
  月份: \`M+\${index + 1}\`,
  预测在职人数: baseCount + Math.max(0, Math.round(baseCount * 0.02 * (index + 1))),
  预测人工成本: Number((baseCost * (1 + 0.015 * (index + 1))).toFixed(0)),
}));
return {
  summary: \`按当前在职规模推算未来 \${months} 个月的人力成本趋势，已输出逐月预测。\`,
  rows: resultRows,
};`,
};

const studentConfig: ExampleConfig = {
  id: 'example_student_info',
  name: '学生信息',
  description: '覆盖学生信息录入、成绩修改、班级统计、批量辅导与期末成绩预测。',
  tags: ['示例', '学生', '成绩分析', '批量处理', '预测'],
  tableId: 'students',
  sheetName: '学生信息',
  fileName: '学生信息.json',
  keyField: '学号',
  rows: studentRows,
  fieldDefs: [
    { field: '学号', label: '学号', type: 'number', createReadonly: true, editReadonly: true },
    { field: '姓名', label: '姓名', type: 'input', required: true, placeholder: '请输入姓名' },
    { field: '班级', label: '班级', type: 'select', required: true, options: ['高一(1)班', '高一(2)班', '高一(3)班'] },
    { field: '语文', label: '语文', type: 'number', required: true },
    { field: '数学', label: '数学', type: 'number', required: true },
    { field: '英语', label: '英语', type: 'number', required: true },
    { field: '出勤率', label: '出勤率', type: 'number', required: true, placeholder: '百分比' },
    { field: '风险等级', label: '风险等级', type: 'select', options: ['低', '中', '高'], createReadonly: true },
  ],
  listColumns: ['学号', '姓名', '班级', '语文', '数学', '英语', '出勤率', '风险等级'],
  searchField: { name: '筛选班级', sourceField: '班级', options: ['全部', '高一(1)班', '高一(2)班', '高一(3)班'] },
  statsFilter: { name: '统计班级', paramName: 'className', label: '统计班级', options: ['全部', '高一(1)班', '高一(2)班', '高一(3)班'] },
  batchParam: { name: '提分目标', paramName: 'targetBoost', label: '提分目标', defaultValue: 12 },
  predictParam: { name: '预测周数', paramName: 'weeks', label: '预测周数', defaultValue: 4 },
  summaryFields: { stats: '统计摘要', batch: '批量摘要', predict: '预测摘要' },
  resultFields: { stats: '统计结果', batch: '批量结果', predict: '预测结果' },
  resultColumns: {
    stats: ['班级', '人数', '平均总分', '高风险人数'],
    batch: ['学号', '姓名', '当前总分', '辅导建议'],
    predict: ['学号', '姓名', '预测期末总分', '风险判断'],
  },
  createDefaults: { 班级: '高一(1)班', 风险等级: '低', 出勤率: 95 },
  createPreSubmitScript: `const total = Number(ctx.getValue('语文') || 0) + Number(ctx.getValue('数学') || 0) + Number(ctx.getValue('英语') || 0);
const attendance = Number(ctx.getValue('出勤率') || 0);
const risk = total < 240 || attendance < 90 ? '高' : total < 285 || attendance < 95 ? '中' : '低';
await ctx.setValue('风险等级', risk);`,
  updatePreSubmitScript: `const total = Number(ctx.getValue('语文') || 0) + Number(ctx.getValue('数学') || 0) + Number(ctx.getValue('英语') || 0);
const attendance = Number(ctx.getValue('出勤率') || 0);
const risk = total < 240 || attendance < 90 ? '高' : total < 285 || attendance < 95 ? '中' : '低';
await ctx.setValue('风险等级', risk);`,
  statsScript: `const rows = Array.isArray(inputs.rows) ? inputs.rows : [];
const className = String(inputs.className || '全部');
const filtered = className === '全部' ? rows : rows.filter((row) => String(row?.班级 || '') === className);
const groups = new Map();
for (const row of filtered) {
  const key = String(row?.班级 || '未分班');
  const total = Number(row?.语文 || 0) + Number(row?.数学 || 0) + Number(row?.英语 || 0);
  const bucket = groups.get(key) || { 班级: key, 人数: 0, 总分合计: 0, 高风险人数: 0 };
  bucket.人数 += 1;
  bucket.总分合计 += total;
  if (String(row?.风险等级 || '') === '高') bucket.高风险人数 += 1;
  groups.set(key, bucket);
}
return {
  summary: \`共统计 \${filtered.length} 名学生，平均总分 \${filtered.length ? (filtered.reduce((sum, row) => sum + Number(row?.语文 || 0) + Number(row?.数学 || 0) + Number(row?.英语 || 0), 0) / filtered.length).toFixed(1) : 0}。\`,
  rows: Array.from(groups.values()).map((item) => ({
    班级: item.班级,
    人数: item.人数,
    平均总分: item.人数 ? Number((item.总分合计 / item.人数).toFixed(1)) : 0,
    高风险人数: item.高风险人数,
  })),
};`,
  batchScript: `const rows = Array.isArray(inputs.rows) ? inputs.rows : [];
const className = String(inputs.className || '全部');
const targetBoost = Number(inputs.targetBoost || 0);
const filtered = rows.filter((row) => (className === '全部' || String(row?.班级 || '') === className) && String(row?.风险等级 || '') !== '低');
return {
  summary: \`已为 \${filtered.length} 名需要关注的学生生成批量辅导建议，目标提分 \${targetBoost} 分。\`,
  rows: filtered.map((row) => {
    const total = Number(row?.语文 || 0) + Number(row?.数学 || 0) + Number(row?.英语 || 0);
    return {
      学号: row?.学号,
      姓名: row?.姓名,
      当前总分: total,
      辅导建议: total < 240 ? \`安排一对一辅导，目标 +\${targetBoost}\` : \`安排周测跟踪，目标 +\${Math.max(6, Math.round(targetBoost / 2))}\`,
    };
  }),
};`,
  predictScript: `const rows = Array.isArray(inputs.rows) ? inputs.rows : [];
const className = String(inputs.className || '全部');
const weeks = Math.max(1, Number(inputs.weeks || 1));
const filtered = rows.filter((row) => className === '全部' || String(row?.班级 || '') === className);
return {
  summary: \`基于当前成绩和出勤率，已预测未来 \${weeks} 周后各学生的期末总分表现。\`,
  rows: filtered.map((row) => {
    const total = Number(row?.语文 || 0) + Number(row?.数学 || 0) + Number(row?.英语 || 0);
    const attendance = Number(row?.出勤率 || 0);
    const predicted = total + weeks * (attendance >= 97 ? 4 : attendance >= 93 ? 2 : -1);
    return {
      学号: row?.学号,
      姓名: row?.姓名,
      预测期末总分: predicted,
      风险判断: predicted < 255 ? '需重点跟踪' : predicted < 300 ? '可提升' : '稳定',
    };
  }),
};`,
};

const valveConfig: ExampleConfig = {
  id: 'example_check_valve_selection',
  name: '止回阀选型',
  description: '覆盖选型申请录入、修改、统计、批量复核与需求预测。',
  tags: ['示例', '止回阀', '选型', '批量复核', '预测'],
  tableId: 'valve_requests',
  sheetName: '止回阀选型',
  fileName: '止回阀选型.json',
  keyField: '申请单号',
  rows: valveRows,
  fieldDefs: [
    { field: '申请单号', label: '申请单号', type: 'number', createReadonly: true, editReadonly: true },
    { field: '项目名称', label: '项目名称', type: 'input', required: true, placeholder: '请输入项目名称' },
    { field: '介质', label: '介质', type: 'select', required: true, options: ['清水', '蒸汽', '油品', '腐蚀液'] },
    { field: '公称通径DN', label: '公称通径DN', type: 'number', required: true },
    { field: '压力等级PN', label: '压力等级PN', type: 'number', required: true },
    { field: '设计温度', label: '设计温度', type: 'number', required: true },
    { field: '设计流量', label: '设计流量', type: 'number', required: true },
    { field: '推荐型号', label: '推荐型号', type: 'input', createReadonly: true },
    { field: '选型状态', label: '选型状态', type: 'select', options: ['待选型', '待复核', '已通过'], createReadonly: true },
  ],
  listColumns: ['申请单号', '项目名称', '介质', '公称通径DN', '压力等级PN', '推荐型号', '选型状态'],
  searchField: { name: '筛选状态', sourceField: '选型状态', options: ['全部', '待选型', '待复核', '已通过'] },
  statsFilter: { name: '统计介质', paramName: 'medium', label: '统计介质', options: ['全部', '清水', '蒸汽', '油品', '腐蚀液'] },
  batchParam: { name: '安全裕量', paramName: 'safetyMargin', label: '安全裕量%', defaultValue: 10 },
  predictParam: { name: '预测月份', paramName: 'months', label: '预测月份', defaultValue: 3 },
  summaryFields: { stats: '统计摘要', batch: '批量摘要', predict: '预测摘要' },
  resultFields: { stats: '统计结果', batch: '批量结果', predict: '预测结果' },
  resultColumns: {
    stats: ['介质', '申请数量', '平均流量', '待复核数量'],
    batch: ['申请单号', '项目名称', '推荐动作', '建议状态'],
    predict: ['推荐型号', '预计需求量', '预测月份'],
  },
  createDefaults: { 选型状态: '待选型' },
  createPreSubmitScript: `const medium = String(ctx.getValue('介质') || '');
const dn = Number(ctx.getValue('公称通径DN') || 0);
const pn = Number(ctx.getValue('压力等级PN') || 0);
const temp = Number(ctx.getValue('设计温度') || 0);
let model = 'H44H-16C';
if (medium === '蒸汽') model = 'H41H-25P';
else if (medium === '腐蚀液') model = 'HC41F-16P';
else if (medium === '油品') model = 'H41H-25C';
await ctx.setValue('推荐型号', \`\${model}-DN\${dn}\`);
await ctx.setValue('选型状态', temp > 180 || pn >= 25 ? '待复核' : '已通过');`,
  updatePreSubmitScript: `const medium = String(ctx.getValue('介质') || '');
const dn = Number(ctx.getValue('公称通径DN') || 0);
const pn = Number(ctx.getValue('压力等级PN') || 0);
const temp = Number(ctx.getValue('设计温度') || 0);
let model = 'H44H-16C';
if (medium === '蒸汽') model = 'H41H-25P';
else if (medium === '腐蚀液') model = 'HC41F-16P';
else if (medium === '油品') model = 'H41H-25C';
await ctx.setValue('推荐型号', \`\${model}-DN\${dn}\`);
await ctx.setValue('选型状态', temp > 180 || pn >= 25 ? '待复核' : '已通过');`,
  statsScript: `const rows = Array.isArray(inputs.rows) ? inputs.rows : [];
const medium = String(inputs.medium || '全部');
const filtered = medium === '全部' ? rows : rows.filter((row) => String(row?.介质 || '') === medium);
const groups = new Map();
for (const row of filtered) {
  const key = String(row?.介质 || '未分类');
  const bucket = groups.get(key) || { 介质: key, 申请数量: 0, 流量合计: 0, 待复核数量: 0 };
  bucket.申请数量 += 1;
  bucket.流量合计 += Number(row?.设计流量 || 0);
  if (String(row?.选型状态 || '') === '待复核') bucket.待复核数量 += 1;
  groups.set(key, bucket);
}
return {
  summary: \`共统计 \${filtered.length} 条止回阀选型申请，可快速识别高风险介质和待复核任务。\`,
  rows: Array.from(groups.values()).map((item) => ({
    介质: item.介质,
    申请数量: item.申请数量,
    平均流量: item.申请数量 ? Number((item.流量合计 / item.申请数量).toFixed(1)) : 0,
    待复核数量: item.待复核数量,
  })),
};`,
  batchScript: `const rows = Array.isArray(inputs.rows) ? inputs.rows : [];
const medium = String(inputs.medium || '全部');
const safetyMargin = Number(inputs.safetyMargin || 0);
const filtered = rows.filter((row) => medium === '全部' || String(row?.介质 || '') === medium);
return {
  summary: \`已对 \${filtered.length} 条选型申请生成批量复核建议，目标安全裕量 \${safetyMargin}% 。\`,
  rows: filtered.map((row) => ({
    申请单号: row?.申请单号,
    项目名称: row?.项目名称,
    推荐动作: Number(row?.压力等级PN || 0) >= 25 || Number(row?.设计温度 || 0) > 180 ? '升级材质并人工复核' : \`流量冗余提高至 \${safetyMargin}%\`,
    建议状态: Number(row?.压力等级PN || 0) >= 25 || Number(row?.设计温度 || 0) > 180 ? '待复核' : '可直接通过',
  })),
};`,
  predictScript: `const rows = Array.isArray(inputs.rows) ? inputs.rows : [];
const medium = String(inputs.medium || '全部');
const months = Math.max(1, Number(inputs.months || 1));
const filtered = rows.filter((row) => medium === '全部' || String(row?.介质 || '') === medium);
const counts = new Map();
for (const row of filtered) {
  const key = String(row?.推荐型号 || '未定型');
  counts.set(key, (counts.get(key) || 0) + 1);
}
return {
  summary: \`已基于历史选型记录预测未来 \${months} 个月各型号的备货需求。\`,
  rows: Array.from(counts.entries()).map(([model, count]) => ({
    推荐型号: model,
    预计需求量: Math.max(1, Math.round(count * (1 + months * 0.2))),
    预测月份: \`未来 \${months} 个月\`,
  })),
};`,
};

const renewableConfig: ExampleConfig = {
  id: 'example_renewable_generation',
  name: '新能源发电量',
  description: '覆盖日电量录入、记录修改、场站统计、批量修正与发电预测。',
  tags: ['示例', '新能源', '发电量', '批量修正', '预测'],
  tableId: 'renewable_generation',
  sheetName: '新能源发电量',
  fileName: '新能源发电量.json',
  keyField: '记录ID',
  rows: renewableRows,
  fieldDefs: [
    { field: '记录ID', label: '记录ID', type: 'number', createReadonly: true, editReadonly: true },
    { field: '日期', label: '日期', type: 'datePicker', required: true },
    { field: '场站', label: '场站', type: 'select', required: true, options: ['青海光伏一站', '甘肃风电二场', '宁夏储能联营'] },
    { field: '发电类型', label: '发电类型', type: 'select', required: true, options: ['光伏', '风电', '储能'] },
    { field: '发电量MWh', label: '发电量MWh', type: 'number', required: true },
    { field: '资源指标', label: '资源指标', type: 'number', required: true, placeholder: '光伏填辐照/风电填风速' },
    { field: '限电损失MWh', label: '限电损失MWh', type: 'number', required: true },
    { field: '设备可用率', label: '设备可用率', type: 'number', required: true },
  ],
  listColumns: ['记录ID', '日期', '场站', '发电类型', '发电量MWh', '资源指标', '设备可用率'],
  searchField: { name: '筛选场站', sourceField: '场站', options: ['全部', '青海光伏一站', '甘肃风电二场', '宁夏储能联营'] },
  statsFilter: { name: '统计场站', paramName: 'siteName', label: '统计场站', options: ['全部', '青海光伏一站', '甘肃风电二场', '宁夏储能联营'] },
  batchParam: { name: '修正系数', paramName: 'adjustRatio', label: '修正系数%', defaultValue: 3 },
  predictParam: { name: '预测天数', paramName: 'days', label: '预测天数', defaultValue: 3 },
  summaryFields: { stats: '统计摘要', batch: '批量摘要', predict: '预测摘要' },
  resultFields: { stats: '统计结果', batch: '批量结果', predict: '预测结果' },
  resultColumns: {
    stats: ['场站', '记录数', '总发电量', '平均可用率'],
    batch: ['记录ID', '场站', '修正后净发电量', '是否异常'],
    predict: ['日期', '预测场站', '预测发电量MWh'],
  },
  createDefaults: { 日期: '2026-07-06', 发电类型: '光伏', 场站: '青海光伏一站' },
  statsScript: `const rows = Array.isArray(inputs.rows) ? inputs.rows : [];
const siteName = String(inputs.siteName || '全部');
const filtered = siteName === '全部' ? rows : rows.filter((row) => String(row?.场站 || '') === siteName);
const groups = new Map();
for (const row of filtered) {
  const key = String(row?.场站 || '未分配');
  const bucket = groups.get(key) || { 场站: key, 记录数: 0, 总发电量: 0, 可用率合计: 0 };
  bucket.记录数 += 1;
  bucket.总发电量 += Number(row?.发电量MWh || 0);
  bucket.可用率合计 += Number(row?.设备可用率 || 0);
  groups.set(key, bucket);
}
return {
  summary: \`共统计 \${filtered.length} 条发电记录，可用于快速比对各场站发电表现。\`,
  rows: Array.from(groups.values()).map((item) => ({
    场站: item.场站,
    记录数: item.记录数,
    总发电量: Number(item.总发电量.toFixed(1)),
    平均可用率: item.记录数 ? Number((item.可用率合计 / item.记录数).toFixed(2)) : 0,
  })),
};`,
  batchScript: `const rows = Array.isArray(inputs.rows) ? inputs.rows : [];
const siteName = String(inputs.siteName || '全部');
const adjustRatio = Number(inputs.adjustRatio || 0);
const filtered = rows.filter((row) => siteName === '全部' || String(row?.场站 || '') === siteName);
return {
  summary: \`已为 \${filtered.length} 条记录生成批量修正结果，修正系数 \${adjustRatio}% 。\`,
  rows: filtered.map((row) => {
    const generation = Number(row?.发电量MWh || 0);
    const curtailment = Number(row?.限电损失MWh || 0);
    const net = Number(((generation - curtailment) * (1 + adjustRatio / 100)).toFixed(1));
    return {
      记录ID: row?.记录ID,
      场站: row?.场站,
      修正后净发电量: net,
      是否异常: Number(row?.设备可用率 || 0) < 96 || net < generation * 0.85 ? '是' : '否',
    };
  }),
};`,
  predictScript: `const rows = Array.isArray(inputs.rows) ? inputs.rows : [];
const siteName = String(inputs.siteName || '全部');
const days = Math.max(1, Number(inputs.days || 1));
const filtered = rows.filter((row) => siteName === '全部' || String(row?.场站 || '') === siteName);
const base = filtered.length ? filtered.reduce((sum, row) => sum + Number(row?.发电量MWh || 0), 0) / filtered.length : 0;
const site = siteName === '全部' ? '综合预测' : siteName;
return {
  summary: \`已基于历史日电量生成未来 \${days} 天的场站发电预测。\`,
  rows: Array.from({ length: days }, (_, index) => ({
    日期: \`D+\${index + 1}\`,
    预测场站: site,
    预测发电量MWh: Number((base * (1 + 0.01 * (index + 1))).toFixed(1)),
  })),
};`,
};

const configs = [employeeConfig, studentConfig, valveConfig, renewableConfig];

mkdirSync(outputDir, { recursive: true });

for (const config of configs) {
  const project = buildProject(config);
  writeProjectPackage(project);
  const zip = await exportToZip(project);
  writeFileSync(join(outputDir, `${config.id}.zip`), new Uint8Array(await zip.arrayBuffer()));
  console.log(`Generated industry example: ${config.id}`);
}
