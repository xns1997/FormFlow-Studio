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

function buildRowsTable(
  tableId: string,
  tableName: string,
  fileName: string,
  keyField: string,
  rows: Record<string, unknown>[],
  descriptionPrefix: string,
): SrcTableEntry {
  const sheet = buildSheetInfo(tableName, rows);
  const tableConfig = createDefaultTableConfig(tableId, tableName);
  tableConfig.keyFields = [keyField];
  tableConfig.filterEnabled = true;
  tableConfig.sortEnabled = true;
  tableConfig.autoFitColumns = true;
  sheet.config = tableConfig;
  return {
    id: tableId,
    fileName,
    fileSize: JSON.stringify(rows).length,
    fileType: 'json',
    uploadedAt: now,
    dataHash: `${tableId}-${rows.length}`,
    sheets: [sheet],
    columnRecords: sheet.headers.map((header, index) => {
      const record = createColumnRecord(tableId, header, index);
      record.isPrimaryKey = header === keyField;
      record.description = `${descriptionPrefix} · ${header}`;
      return record;
    }),
    rowRecords: rows.map((_, index) => createRowRecord(tableId, index)),
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

function workflowNode(
  id: string,
  specId: string,
  properties: Record<string, unknown> = {},
  position: { x: number; y: number } = { x: 0, y: 0 },
  type?: WorkflowNode['type'],
): WorkflowNode {
  return {
    id,
    type: type || (specId.startsWith('behavior:') ? 'behavior' : specId.startsWith('generic:') ? 'generic' : 'formflow'),
    specId,
    position,
    data: { propertiesJson: JSON.stringify(properties) },
  };
}

function workflowEdge(
  id: string,
  source: string,
  target: string,
  sourcePort: string,
  targetPort: string,
): WorkflowEdge {
  return {
    id,
    source,
    target,
    sourceHandle: `out:${sourcePort}`,
    targetHandle: `in:${targetPort}`,
  };
}

function portDefs(fields: Array<{ name: string; type: string; label?: string; description?: string }>): string {
  return JSON.stringify(fields.map((field) => ({
    name: field.name,
    type: field.type,
    label: field.label || field.name,
    description: field.description || '',
  })));
}

function buildFieldObjectExpression(fields: string[], source: 'form' | 'original'): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, `$${source}.${field}`]));
}

function buildFieldMap(fields: string[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field, field]));
}

function buildSubmitParameterMap(fields: string[]): Record<string, unknown> {
  return {
    'workflow:import.formData': buildFieldObjectExpression(fields, 'form'),
  };
}

function buildUpdateParameterMap(fields: string[]): Record<string, unknown> {
  return {
    'workflow:import.formData': buildFieldObjectExpression(fields, 'form'),
    'workflow:import.originalData': Object.fromEntries(fields.map((field) => [field, `$form.原始${field}`])),
  };
}

function buildPortObjectParameterMap(portName: string, fields: string[], extras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [`workflow:import.${portName}`]: {
      ...buildFieldObjectExpression(fields, 'form'),
      ...extras,
    },
  };
}

function submitWorkflow(id: string, name: string, description: string, config: ExampleConfig): WorkflowFile {
  return {
    id,
    name,
    description,
    createdAt: now,
    updatedAt: now,
    nodes: [
      workflowNode('workflow:import', 'workflow:import', {
        outputPorts: portDefs([
          { name: 'formData', type: 'object', label: '表单数据', description: '提交时写回的数据对象' },
          { name: 'originalData', type: 'object', label: '原始数据', description: '编辑前的原始数据对象' },
        ]),
      }, { x: 40, y: 160 }, 'formflow'),
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
      workflowNode('workflow:export', 'workflow:export', {
        inputPorts: portDefs([
          { name: 'success', type: 'object', label: '成功事件', description: '提交成功事件' },
          { name: 'changeLog', type: 'object', label: '变更记录', description: '本次提交的字段差异' },
          { name: 'writeBack', type: 'object', label: '写回动作', description: '提交后的写回指令' },
          { name: 'fileData', type: 'any', label: '文件数据', description: '导出的文件数据' },
        ]),
      }, { x: 640, y: 160 }, 'formflow'),
    ],
    edges: [
      workflowEdge('edge_import_formData', 'workflow:import', 'submit', 'formData', 'formData'),
      workflowEdge('edge_import_originalData', 'workflow:import', 'submit', 'originalData', 'originalData'),
      workflowEdge('edge_submit_success', 'submit', 'workflow:export', 'success', 'success'),
      workflowEdge('edge_submit_changeLog', 'submit', 'workflow:export', 'changeLog', 'changeLog'),
      workflowEdge('edge_submit_writeBack', 'submit', 'workflow:export', 'writeBack', 'writeBack'),
      workflowEdge('edge_submit_fileData', 'submit', 'workflow:export', 'fileData', 'fileData'),
    ],
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
  const nodes: WorkflowNode[] = [
    workflowNode('workflow:import', 'workflow:import', {
      outputPorts: portDefs(inputs.map((input) => ({
        name: input.name,
        type: input.type,
        label: input.name,
        description: `${input.name} 输入`,
      }))),
    }, { x: 60, y: 180 }, 'formflow'),
  ];
  const edges: WorkflowEdge[] = [];
  inputs.forEach((input, index) => {
    edges.push(workflowEdge(`edge_import_${input.name}`, 'workflow:import', 'script', input.name, input.name));
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
  nodes.push(workflowNode('workflow:export', 'workflow:export', {
    inputPorts: portDefs(Object.entries(outputPorts).map(([portName, type]) => ({
      name: portName,
      type,
      label: portName,
      description: `${portName} 输出`,
    }))),
  }, { x: 680, y: 180 }, 'formflow'));
  Object.keys(outputPorts).forEach((portName) => {
    edges.push(workflowEdge(`edge_export_${portName}`, 'script', 'workflow:export', portName, portName));
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
  summaryField: string,
  resultField: string,
  params: Record<string, string>,
): string {
  const extraParams = Object.entries(params).map(([key, value]) => `${JSON.stringify(key)}: ${value}`);
  return `const result = await ctx.runConfiguredWorkflow({
  rows: ctx.querySheet('${config.tableId}'),
  ${extraParams.join(',\n  ')}
});
const outputs = result.nodeResults.get('workflow:export')?.outputs.result || {};
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
          parameterMap: buildSubmitParameterMap(config.fieldDefs.map((field) => field.field)),
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
          parameterMap: buildUpdateParameterMap(config.fieldDefs.map((field) => field.field)),
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
        onClick: buildAnalysisButtonCode(config, config.summaryFields.stats, config.resultFields.stats, {
          [config.statsFilter.paramName]: `String(ctx.getValue('${config.statsFilter.name}') || '全部')`,
        }),
      },
      flowTriggers: {
        onClick: {
          enabled: true,
          workflowId: `${config.id}_wf_stats`,
          parameterMap: {
            [`workflow:import.${config.statsFilter.paramName}`]: `$form.${config.statsFilter.name}`,
          },
        },
      },
    }),
    buttonComponent(`${config.id}_batch_btn`, '批量处理', 804, 116, 120, 50, {
      events: {
        onClick: buildAnalysisButtonCode(config, config.summaryFields.batch, config.resultFields.batch, {
          [config.statsFilter.paramName]: `String(ctx.getValue('${config.statsFilter.name}') || '全部')`,
          [config.batchParam.paramName]: `Number(ctx.getValue('${config.batchParam.name}') || 0)`,
        }),
      },
      flowTriggers: {
        onClick: {
          enabled: true,
          workflowId: `${config.id}_wf_batch`,
          parameterMap: {
            [`workflow:import.${config.statsFilter.paramName}`]: `$form.${config.statsFilter.name}`,
            [`workflow:import.${config.batchParam.paramName}`]: `$form.${config.batchParam.name}`,
          },
        },
      },
    }),
    buttonComponent(`${config.id}_predict_btn`, '预测', 944, 116, 120, 50, {
      events: {
        onClick: buildAnalysisButtonCode(config, config.summaryFields.predict, config.resultFields.predict, {
          [config.statsFilter.paramName]: `String(ctx.getValue('${config.statsFilter.name}') || '全部')`,
          [config.predictParam.paramName]: `Number(ctx.getValue('${config.predictParam.name}') || 1)`,
        }),
      },
      flowTriggers: {
        onClick: {
          enabled: true,
          workflowId: `${config.id}_wf_predict`,
          parameterMap: {
            [`workflow:import.${config.statsFilter.paramName}`]: `$form.${config.statsFilter.name}`,
            [`workflow:import.${config.predictParam.paramName}`]: `$form.${config.predictParam.name}`,
          },
        },
      },
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

const valveSelectionV2RequestFields: FieldDef[] = [
  { field: '需求单号', label: '需求单号', type: 'number', required: true, placeholder: '请输入需求单号' },
  { field: '项目名称', label: '项目名称', type: 'input', required: true, placeholder: '请输入项目名称' },
  { field: '介质', label: '介质', type: 'select', required: true, options: ['清水', '蒸汽', '腐蚀液', '油品'] },
  { field: 'DN', label: 'DN', type: 'number', required: true, placeholder: '如 50 / 80 / 100' },
  { field: 'PN', label: 'PN', type: 'number', required: true, placeholder: '如 16 / 25 / 40' },
  { field: '设计温度', label: '设计温度', type: 'number', required: true, placeholder: '单位：℃' },
  { field: '目标流量', label: '目标流量', type: 'number', required: true, placeholder: '单位：m3/h' },
  { field: '连接方式', label: '连接方式', type: 'select', required: true, options: ['法兰', '对夹'] },
  { field: '阀体材质偏好', label: '阀体材质偏好', type: 'select', required: true, options: ['碳钢', '不锈钢', '衬氟'] },
  { field: '预算等级', label: '预算等级', type: 'select', required: true, options: ['经济型', '标准型', '高配型'] },
  { field: '交期要求', label: '交期要求', type: 'select', required: true, options: ['常规', '快交'] },
  { field: '防腐要求', label: '防腐要求', type: 'select', required: true, options: ['标准', '防腐'] },
];

const valveSelectionRows = [
  { 需求单号: 7001, 项目名称: '循环水改造', 介质: '清水', DN: 80, PN: 16, 设计温度: 40, 目标流量: 120, 连接方式: '法兰', 阀体材质偏好: '碳钢', 预算等级: '经济型', 交期要求: '常规', 防腐要求: '标准' },
  { 需求单号: 7002, 项目名称: '蒸汽母管扩容', 介质: '蒸汽', DN: 100, PN: 25, 设计温度: 260, 目标流量: 150, 连接方式: '法兰', 阀体材质偏好: '不锈钢', 预算等级: '高配型', 交期要求: '常规', 防腐要求: '标准' },
  { 需求单号: 7003, 项目名称: '酸洗循环线', 介质: '腐蚀液', DN: 50, PN: 16, 设计温度: 90, 目标流量: 48, 连接方式: '对夹', 阀体材质偏好: '衬氟', 预算等级: '标准型', 交期要求: '快交', 防腐要求: '防腐' },
  { 需求单号: 7004, 项目名称: '成品油支线', 介质: '油品', DN: 65, PN: 25, 设计温度: 85, 目标流量: 92, 连接方式: '法兰', 阀体材质偏好: '不锈钢', 预算等级: '标准型', 交期要求: '快交', 防腐要求: '标准' },
];

const valveCatalogRows = [
  { SKU编码: 'VLV-001', 型号: 'CV100-80C', 介质: '清水', 适用DN: 80, 最高PN: 16, 最高适用温度: 120, 连接方式: '法兰', 阀体材质: '碳钢', 密封材质: 'EPDM', 预算等级: '经济型', 交期要求: '常规', 防腐要求: '标准', 推荐优先级: 1, 成本档位: 1, 交期档位: 2, 耐腐等级: 1, 附件推荐键: 'FLG-CS-STD', 规则编码: 'WATER-FLG-CS-ECO' },
  { SKU编码: 'VLV-002', 型号: 'CV120-80CS', 介质: '清水', 适用DN: 80, 最高PN: 25, 最高适用温度: 150, 连接方式: '法兰', 阀体材质: '碳钢', 密封材质: 'NBR', 预算等级: '经济型', 交期要求: '常规', 防腐要求: '标准', 推荐优先级: 2, 成本档位: 2, 交期档位: 2, 耐腐等级: 1, 附件推荐键: 'FLG-CS-STD', 规则编码: 'WATER-FLG-CS-ECO' },
  { SKU编码: 'VLV-003', 型号: 'CV200-100S', 介质: '蒸汽', 适用DN: 100, 最高PN: 40, 最高适用温度: 320, 连接方式: '法兰', 阀体材质: '不锈钢', 密封材质: '石墨', 预算等级: '高配型', 交期要求: '常规', 防腐要求: '标准', 推荐优先级: 1, 成本档位: 3, 交期档位: 2, 耐腐等级: 2, 附件推荐键: 'FLG-SS-HT', 规则编码: 'STEAM-FLG-SS-PRO' },
  { SKU编码: 'VLV-004', 型号: 'CV210-100S', 介质: '蒸汽', 适用DN: 100, 最高PN: 25, 最高适用温度: 280, 连接方式: '法兰', 阀体材质: '不锈钢', 密封材质: '石墨', 预算等级: '高配型', 交期要求: '常规', 防腐要求: '标准', 推荐优先级: 2, 成本档位: 2, 交期档位: 3, 耐腐等级: 2, 附件推荐键: 'FLG-SS-HT', 规则编码: 'STEAM-FLG-SS-PRO' },
  { SKU编码: 'VLV-005', 型号: 'CV300-50F', 介质: '腐蚀液', 适用DN: 50, 最高PN: 16, 最高适用温度: 160, 连接方式: '对夹', 阀体材质: '衬氟', 密封材质: 'PTFE', 预算等级: '标准型', 交期要求: '快交', 防腐要求: '防腐', 推荐优先级: 1, 成本档位: 2, 交期档位: 1, 耐腐等级: 3, 附件推荐键: 'WAF-FEP-FAST', 规则编码: 'CORR-WAF-LIN-STD' },
  { SKU编码: 'VLV-006', 型号: 'CV310-50F', 介质: '腐蚀液', 适用DN: 50, 最高PN: 25, 最高适用温度: 180, 连接方式: '对夹', 阀体材质: '衬氟', 密封材质: 'PTFE', 预算等级: '标准型', 交期要求: '快交', 防腐要求: '防腐', 推荐优先级: 2, 成本档位: 3, 交期档位: 1, 耐腐等级: 3, 附件推荐键: 'WAF-FEP-FAST', 规则编码: 'CORR-WAF-LIN-STD' },
  { SKU编码: 'VLV-007', 型号: 'CV400-65O', 介质: '油品', 适用DN: 65, 最高PN: 25, 最高适用温度: 180, 连接方式: '法兰', 阀体材质: '不锈钢', 密封材质: 'FKM', 预算等级: '标准型', 交期要求: '快交', 防腐要求: '标准', 推荐优先级: 1, 成本档位: 2, 交期档位: 1, 耐腐等级: 2, 附件推荐键: 'FLG-SS-FAST', 规则编码: 'OIL-FLG-SS-STD' },
  { SKU编码: 'VLV-008', 型号: 'CV410-65O', 介质: '油品', 适用DN: 65, 最高PN: 40, 最高适用温度: 220, 连接方式: '法兰', 阀体材质: '不锈钢', 密封材质: 'FKM', 预算等级: '标准型', 交期要求: '快交', 防腐要求: '标准', 推荐优先级: 2, 成本档位: 3, 交期档位: 1, 耐腐等级: 2, 附件推荐键: 'FLG-SS-FAST', 规则编码: 'OIL-FLG-SS-STD' },
];

const accessoryRows = [
  { 附件推荐键: 'FLG-CS-STD', 附件类别: '法兰组件', 附件型号: 'ACC-FLG-80-CS', 附件材质: '碳钢', 适配说明: '标准法兰垫片与螺栓包' },
  { 附件推荐键: 'FLG-SS-HT', 附件类别: '高温组件', 附件型号: 'ACC-FLG-100-SS-HT', 附件材质: '不锈钢', 适配说明: '含高温石墨垫片与加长螺柱' },
  { 附件推荐键: 'WAF-FEP-FAST', 附件类别: '防腐快交组件', 附件型号: 'ACC-WAF-50-FEP-QD', 附件材质: 'PTFE', 适配说明: '含防腐衬套和快交密封包' },
  { 附件推荐键: 'FLG-SS-FAST', 附件类别: '快交组件', 附件型号: 'ACC-FLG-65-SS-QD', 附件材质: '不锈钢', 适配说明: '适用于快交法兰安装场景' },
];

const compatibilityRuleRows = [
  { 规则编码: 'WATER-FLG-CS-ECO', 介质: '清水', 连接方式: '法兰', 防腐要求: '标准', 预算等级: '经济型', 交期要求: '常规', 阀体材质偏好: '碳钢', 推荐主型号: 'CV100-80C', 推荐附件型号: 'ACC-FLG-80-CS', 推荐说明: '优先选择经济型碳钢法兰止回阀，兼顾成本和交付。', 无结果提示: '' },
  { 规则编码: 'STEAM-FLG-SS-PRO', 介质: '蒸汽', 连接方式: '法兰', 防腐要求: '标准', 预算等级: '高配型', 交期要求: '常规', 阀体材质偏好: '不锈钢', 推荐主型号: 'CV200-100S', 推荐附件型号: 'ACC-FLG-100-SS-HT', 推荐说明: '高温蒸汽场景优先选择不锈钢高温系列，并配高温附件。', 无结果提示: '' },
  { 规则编码: 'CORR-WAF-LIN-STD', 介质: '腐蚀液', 连接方式: '对夹', 防腐要求: '防腐', 预算等级: '标准型', 交期要求: '快交', 阀体材质偏好: '衬氟', 推荐主型号: 'CV300-50F', 推荐附件型号: 'ACC-WAF-50-FEP-QD', 推荐说明: '腐蚀液工况优先采用衬氟对夹止回阀，并匹配防腐快交附件。', 无结果提示: '' },
  { 规则编码: 'OIL-FLG-SS-STD', 介质: '油品', 连接方式: '法兰', 防腐要求: '标准', 预算等级: '标准型', 交期要求: '快交', 阀体材质偏好: '不锈钢', 推荐主型号: 'CV400-65O', 推荐附件型号: 'ACC-FLG-65-SS-QD', 推荐说明: '油品输送建议使用不锈钢法兰止回阀，并优先匹配快交安装组件。', 无结果提示: '' },
];

function buildSelectionSubmitWorkflow(id: string, name: string): WorkflowFile {
  return {
    id,
    name,
    description: `${name}写回客户需求表`,
    createdAt: now,
    updatedAt: now,
    nodes: [
      workflowNode('workflow:import', 'workflow:import', {
        outputPorts: portDefs([
          { name: 'formData', type: 'object', label: '表单数据', description: '提交时写回的数据对象' },
          { name: 'originalData', type: 'object', label: '原始数据', description: '编辑前的原始数据对象' },
        ]),
      }, { x: 40, y: 160 }, 'formflow'),
      workflowNode('submit', 'behavior:submit', {
        validateFirst: true,
        target: 'changeLog',
        fileName: id,
        writeBackMode: 'upsert',
        writeBackTableId: 'selection_requests',
        writeBackSheetName: '客户需求',
        writeBackKeyField: '需求单号',
        writeBackKeyFormField: '需求单号',
        writeBackFieldMap: buildFieldMap(valveSelectionV2RequestFields.map((field) => field.field)),
      }, { x: 320, y: 160 }, 'formflow'),
      workflowNode('workflow:export', 'workflow:export', {
        inputPorts: portDefs([
          { name: 'success', type: 'object', label: '成功事件', description: '提交成功事件' },
          { name: 'changeLog', type: 'object', label: '变更记录', description: '本次提交的字段差异' },
          { name: 'writeBack', type: 'object', label: '写回动作', description: '提交后的写回指令' },
        ]),
      }, { x: 640, y: 160 }, 'formflow'),
    ],
    edges: [
      workflowEdge('edge_import_formData', 'workflow:import', 'submit', 'formData', 'formData'),
      workflowEdge('edge_import_originalData', 'workflow:import', 'submit', 'originalData', 'originalData'),
      workflowEdge('edge_submit_success', 'submit', 'workflow:export', 'success', 'success'),
      workflowEdge('edge_submit_changeLog', 'submit', 'workflow:export', 'changeLog', 'changeLog'),
      workflowEdge('edge_submit_writeBack', 'submit', 'workflow:export', 'writeBack', 'writeBack'),
    ],
  };
}

function buildValveSelectionV2AnalysisWorkflow(): WorkflowFile {
  return {
    id: 'example_valve_selection_v2_wf_analyze',
    name: '二代阀门选型推荐',
    description: '按客户需求筛选阀门候选、合并兼容规则和附件，并回填推荐结果。',
    createdAt: now,
    updatedAt: now,
    nodes: [
      workflowNode('workflow:import', 'workflow:import', {
        outputPorts: portDefs([
          { name: 'criteria', type: 'json', label: '筛选条件', description: '多条件筛选规则数组' },
        ]),
      }, { x: 20, y: 40 }, 'formflow'),
      workflowNode('query_catalog', 'behavior-data-query', { sheetName: '阀门主数据' }, { x: 40, y: 180 }, 'behavior'),
      workflowNode('criteria', 'generic:criteria-filter', {}, { x: 260, y: 180 }),
      workflowNode('query_rules', 'behavior-data-query', { sheetName: '兼容规则' }, { x: 520, y: 80 }, 'behavior'),
      workflowNode('merge_rules', 'generic:merge', { leftKey: '规则编码', rightKey: '规则编码', joinType: 'left' }, { x: 700, y: 180 }),
      workflowNode('query_accessories', 'behavior-data-query', { sheetName: '附件主数据' }, { x: 920, y: 80 }, 'behavior'),
      workflowNode('merge_accessory', 'generic:merge', { leftKey: '附件推荐键', rightKey: '附件推荐键', joinType: 'left' }, { x: 1100, y: 180 }),
      workflowNode('pick', 'generic:pick-record', {
        pickMode: 'topN',
        topN: 5,
        sorts: [
          { field: '推荐优先级', order: 'asc' },
          { field: '成本档位', order: 'asc' },
          { field: '交期档位', order: 'asc' },
        ],
      }, { x: 1320, y: 180 }),
      workflowNode('set_values', 'behavior-set-values', {
        staticPatch: {
          无结果提示: '',
        },
        fieldMap: {
          候选清单: '$records',
          匹配数量: '$count',
          推荐主型号: ['$record.推荐主型号', '$record.型号'],
          推荐附件型号: ['$record.推荐附件型号', '$record.附件型号'],
          推荐说明: '$record.推荐说明',
        },
        emptyPatch: {
          候选清单: [],
          匹配数量: 0,
          推荐主型号: '',
          推荐附件型号: '',
          推荐说明: '',
          无结果提示: '当前 PN/温度/材质组合无可用型号',
        },
      }, { x: 1540, y: 180 }, 'behavior'),
      workflowNode('workflow:export', 'workflow:export', {
        inputPorts: portDefs([
          { name: 'patch', type: 'object', label: '回填结果', description: '推荐结果补丁对象' },
          { name: 'appliedFields', type: 'array', label: '回填字段', description: '已回填字段名列表' },
        ]),
      }, { x: 1780, y: 180 }, 'formflow'),
    ],
    edges: [
      workflowEdge('edge-import-criteria', 'workflow:import', 'criteria', 'criteria', 'criteria'),
      workflowEdge('edge-query-criteria', 'query_catalog', 'criteria', 'data', 'data'),
      workflowEdge('edge-criteria-merge-rules', 'criteria', 'merge_rules', 'rows', 'leftData'),
      workflowEdge('edge-query-rules-merge', 'query_rules', 'merge_rules', 'data', 'rightData'),
      workflowEdge('edge-merge-rules-accessory', 'merge_rules', 'merge_accessory', 'data', 'leftData'),
      workflowEdge('edge-query-accessory-merge', 'query_accessories', 'merge_accessory', 'data', 'rightData'),
      workflowEdge('edge-merge-pick', 'merge_accessory', 'pick', 'data', 'data'),
      workflowEdge('edge-pick-record', 'pick', 'set_values', 'first', 'record'),
      workflowEdge('edge-pick-records', 'pick', 'set_values', 'rows', 'records'),
      workflowEdge('edge-pick-count', 'pick', 'set_values', 'count', 'count'),
      workflowEdge('edge-set-values-patch', 'set_values', 'workflow:export', 'patch', 'patch'),
      workflowEdge('edge-set-values-fields', 'set_values', 'workflow:export', 'appliedFields', 'appliedFields'),
    ],
  };
}

function buildValveSelectionV2QueryWorkflow(): WorkflowFile {
  return {
    id: 'example_valve_selection_v2_wf_query_requests',
    name: '加载需求列表',
    description: '读取客户需求表并回填维护列表。',
    createdAt: now,
    updatedAt: now,
    nodes: [
      workflowNode('workflow:import', 'workflow:import', {
        outputPorts: portDefs([
          { name: 'event', type: 'string', label: '事件名', description: '触发查询的事件名' },
        ]),
      }, { x: -120, y: 160 }, 'formflow'),
      workflowNode('query', 'behavior-data-query', { sheetName: '客户需求' }, { x: 80, y: 160 }, 'behavior'),
      workflowNode('set_list', 'behavior-set-value', { fieldName: '需求列表', valueType: 'fromInput' }, { x: 320, y: 160 }, 'behavior'),
      workflowNode('workflow:export', 'workflow:export', {
        inputPorts: portDefs([
          { name: 'rows', type: 'array', label: '需求列表', description: '已加载的需求列表' },
        ]),
      }, { x: 560, y: 160 }, 'formflow'),
    ],
    edges: [
      workflowEdge('edge-query-list', 'query', 'set_list', 'data', 'value'),
      workflowEdge('edge-query-export', 'query', 'workflow:export', 'data', 'rows'),
    ],
  };
}

function buildValveSelectionV2LoadWorkflow(): WorkflowFile {
  const setNode = (id: string, field: string, sourceField: string, x: number, y: number) =>
    workflowNode(id, 'behavior-set-value', { fieldName: field, valueType: 'expression', expression: `inputs.value?.${sourceField}` }, { x, y }, 'behavior');
  return {
    id: 'example_valve_selection_v2_wf_load_request',
    name: '载入需求记录',
    description: '点击需求列表后把记录回填到维护表单。',
    createdAt: now,
    updatedAt: now,
    nodes: [
      workflowNode('workflow:import', 'workflow:import', {
        outputPorts: portDefs([
          { name: 'record', type: 'object', label: '需求记录', description: '从列表选中的整行记录' },
        ]),
      }, { x: -140, y: 140 }, 'formflow'),
      setNode('set_id', '需求单号', '需求单号', 80, 60),
      setNode('set_project', '项目名称', '项目名称', 260, 60),
      setNode('set_medium', '介质', '介质', 440, 60),
      setNode('set_dn', 'DN', 'DN', 620, 60),
      setNode('set_pn', 'PN', 'PN', 800, 60),
      setNode('set_temp', '设计温度', '设计温度', 980, 60),
      setNode('set_flow', '目标流量', '目标流量', 1160, 60),
      setNode('set_connection', '连接方式', '连接方式', 1340, 60),
      setNode('set_material', '阀体材质偏好', '阀体材质偏好', 1520, 60),
      setNode('set_budget', '预算等级', '预算等级', 1700, 60),
      setNode('set_delivery', '交期要求', '交期要求', 1880, 60),
      setNode('set_corrosion', '防腐要求', '防腐要求', 2060, 60),
      setNode('set_origin_id', '原始需求单号', '需求单号', 80, 220),
      setNode('set_origin_project', '原始项目名称', '项目名称', 260, 220),
      setNode('set_origin_medium', '原始介质', '介质', 440, 220),
      setNode('set_origin_dn', '原始DN', 'DN', 620, 220),
      setNode('set_origin_pn', '原始PN', 'PN', 800, 220),
      setNode('set_origin_temp', '原始设计温度', '设计温度', 980, 220),
      setNode('set_origin_flow', '原始目标流量', '目标流量', 1160, 220),
      setNode('set_origin_connection', '原始连接方式', '连接方式', 1340, 220),
      setNode('set_origin_material', '原始阀体材质偏好', '阀体材质偏好', 1520, 220),
      setNode('set_origin_budget', '原始预算等级', '预算等级', 1700, 220),
      setNode('set_origin_delivery', '原始交期要求', '交期要求', 1880, 220),
      setNode('set_origin_corrosion', '原始防腐要求', '防腐要求', 2060, 220),
      workflowNode('workflow:export', 'workflow:export', {
        inputPorts: portDefs([
          { name: 'record', type: 'object', label: '已载入记录', description: '回填到表单的需求记录' },
        ]),
      }, { x: 2300, y: 140 }, 'formflow'),
    ],
    edges: [
      workflowEdge('edge-import-id', 'workflow:import', 'set_id', 'record', 'value'),
      workflowEdge('edge-import-project', 'workflow:import', 'set_project', 'record', 'value'),
      workflowEdge('edge-import-medium', 'workflow:import', 'set_medium', 'record', 'value'),
      workflowEdge('edge-import-dn', 'workflow:import', 'set_dn', 'record', 'value'),
      workflowEdge('edge-import-pn', 'workflow:import', 'set_pn', 'record', 'value'),
      workflowEdge('edge-import-temp', 'workflow:import', 'set_temp', 'record', 'value'),
      workflowEdge('edge-import-flow', 'workflow:import', 'set_flow', 'record', 'value'),
      workflowEdge('edge-import-connection', 'workflow:import', 'set_connection', 'record', 'value'),
      workflowEdge('edge-import-material', 'workflow:import', 'set_material', 'record', 'value'),
      workflowEdge('edge-import-budget', 'workflow:import', 'set_budget', 'record', 'value'),
      workflowEdge('edge-import-delivery', 'workflow:import', 'set_delivery', 'record', 'value'),
      workflowEdge('edge-import-corrosion', 'workflow:import', 'set_corrosion', 'record', 'value'),
      workflowEdge('edge-import-origin-id', 'workflow:import', 'set_origin_id', 'record', 'value'),
      workflowEdge('edge-import-origin-project', 'workflow:import', 'set_origin_project', 'record', 'value'),
      workflowEdge('edge-import-origin-medium', 'workflow:import', 'set_origin_medium', 'record', 'value'),
      workflowEdge('edge-import-origin-dn', 'workflow:import', 'set_origin_dn', 'record', 'value'),
      workflowEdge('edge-import-origin-pn', 'workflow:import', 'set_origin_pn', 'record', 'value'),
      workflowEdge('edge-import-origin-temp', 'workflow:import', 'set_origin_temp', 'record', 'value'),
      workflowEdge('edge-import-origin-flow', 'workflow:import', 'set_origin_flow', 'record', 'value'),
      workflowEdge('edge-import-origin-connection', 'workflow:import', 'set_origin_connection', 'record', 'value'),
      workflowEdge('edge-import-origin-material', 'workflow:import', 'set_origin_material', 'record', 'value'),
      workflowEdge('edge-import-origin-budget', 'workflow:import', 'set_origin_budget', 'record', 'value'),
      workflowEdge('edge-import-origin-delivery', 'workflow:import', 'set_origin_delivery', 'record', 'value'),
      workflowEdge('edge-import-origin-corrosion', 'workflow:import', 'set_origin_corrosion', 'record', 'value'),
      workflowEdge('edge-export-record', 'workflow:import', 'workflow:export', 'record', 'record'),
    ],
  };
}

function buildValveSelectionV2CreateForm(): FormEntry {
  const components: DesignComponent[] = [
    textComponent('example_valve_selection_v2_create_title', '阀门二代选型 · 客户需求录入', 24, 24, 880, 40, { fontSize: 22, fontWeight: 'bold', color: '#0f172a' }),
    textComponent('example_valve_selection_v2_create_hint', '录入客户需求后保存到需求表，后续可在分析页或维护页复用。', 24, 70, 880, 28, { fontSize: 13, color: '#475569' }),
  ];
  valveSelectionV2RequestFields.forEach((field, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    components.push(fieldComponent(`example_valve_selection_v2_create_${index}`, field, 24 + col * 252, 116 + row * 80, 220, 60, 'create'));
  });
  components.push(
    buttonComponent('example_valve_selection_v2_create_submit', '保存需求', 24, 468, 220, 50, {
      flowTriggers: {
        onClick: {
          enabled: true,
          workflowId: 'example_valve_selection_v2_wf_create_request',
          parameterMap: buildSubmitParameterMap(valveSelectionV2RequestFields.map((field) => field.field)),
        },
      },
    }),
  );
  return {
    id: 'example_valve_selection_v2_form_create',
    name: '客户需求录入',
    createdAt: now,
    updatedAt: now,
    behaviors: [],
    design: {
      id: 'example_valve_selection_v2_form_create',
      name: '客户需求录入',
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

function buildValveSelectionV2AnalysisForm(): FormEntry {
  const components: DesignComponent[] = [
    textComponent('example_valve_selection_v2_analysis_title', '阀门二代选型 · 候选方案分析', 24, 24, 960, 40, { fontSize: 22, fontWeight: 'bold', color: '#0f172a' }),
    textComponent('example_valve_selection_v2_analysis_hint', '点击开始选型后，流程会自动筛选阀门候选、合并附件并回填推荐结果。', 24, 70, 960, 28, { fontSize: 13, color: '#475569' }),
  ];
  valveSelectionV2RequestFields.forEach((field, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    components.push(fieldComponent(`example_valve_selection_v2_analysis_${index}`, field, 24 + col * 252, 116 + row * 80, 220, 60, 'create'));
  });
  components.push(
    buttonComponent('example_valve_selection_v2_analysis_run', '开始选型', 24, 468, 220, 50, {
      flowTriggers: {
        onClick: {
          enabled: true,
          workflowId: 'example_valve_selection_v2_wf_analyze',
          parameterMap: {
            'workflow:import.criteria': [
              { field: '介质', operator: '==', value: '$form.介质' },
              { field: '适用DN', operator: '==', value: '$form.DN' },
              { field: '最高PN', operator: '>=', value: '$form.PN' },
              { field: '最高适用温度', operator: '>=', value: '$form.设计温度' },
              { field: '连接方式', operator: '==', value: '$form.连接方式' },
              { field: '阀体材质', operator: '==', value: '$form.阀体材质偏好' },
              { field: '预算等级', operator: '==', value: '$form.预算等级' },
              { field: '交期要求', operator: '==', value: '$form.交期要求' },
              { field: '防腐要求', operator: '==', value: '$form.防腐要求' }
            ],
          },
        },
      },
    }),
  );
  components.push(fieldComponent('example_valve_selection_v2_analysis_main', { field: '推荐主型号', label: '推荐主型号', type: 'input', createReadonly: true }, 276, 468, 220, 60, 'create'));
  components.push(fieldComponent('example_valve_selection_v2_analysis_accessory', { field: '推荐附件型号', label: '推荐附件型号', type: 'input', createReadonly: true }, 528, 468, 220, 60, 'create'));
  components.push(fieldComponent('example_valve_selection_v2_analysis_count', { field: '匹配数量', label: '匹配数量', type: 'number', createReadonly: true }, 780, 468, 180, 60, 'create'));
  components.push({
    id: 'example_valve_selection_v2_analysis_desc',
    type: 'textarea',
    x: 24,
    y: 548,
    width: 460,
    height: 110,
    zIndex: 2,
    fieldBinding: '推荐说明',
    props: { name: '推荐说明', label: '推荐说明', readonly: true, rows: 4 },
  });
  components.push({
    id: 'example_valve_selection_v2_analysis_empty',
    type: 'textarea',
    x: 504,
    y: 548,
    width: 456,
    height: 110,
    zIndex: 2,
    fieldBinding: '无结果提示',
    props: { name: '无结果提示', label: '无结果提示', readonly: true, rows: 4 },
  });
  components.push(tableComponent('example_valve_selection_v2_analysis_candidates', '候选清单', ['型号', '介质', '适用DN', '最高PN', '最高适用温度', '阀体材质', '附件型号', '推荐优先级'], 24, 682, 936, 220, { rows: 5 }));
  return {
    id: 'example_valve_selection_v2_form_analysis',
    name: '候选方案分析',
    createdAt: now,
    updatedAt: now,
    behaviors: [],
    design: {
      id: 'example_valve_selection_v2_form_analysis',
      name: '候选方案分析',
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

function buildValveSelectionV2MaintenanceForm(): FormEntry {
  const components: DesignComponent[] = [
    textComponent('example_valve_selection_v2_edit_title', '阀门二代选型 · 需求记录维护', 24, 24, 1080, 40, { fontSize: 22, fontWeight: 'bold', color: '#0f172a' }),
    textComponent('example_valve_selection_v2_edit_hint', '先加载需求列表，再修改右侧需求并重新跑选型流程。', 24, 70, 1080, 28, { fontSize: 13, color: '#475569' }),
    buttonComponent('example_valve_selection_v2_query_btn', '加载需求列表', 24, 116, 180, 50, {
      flowTriggers: {
        onClick: {
          enabled: true,
          workflowId: 'example_valve_selection_v2_wf_query_requests',
        },
      },
    }),
    tableComponent('example_valve_selection_v2_request_table', '需求列表', ['需求单号', '项目名称', '介质', 'DN', 'PN', '连接方式', '预算等级'], 24, 196, 520, 260, {
      flowTriggers: {
        onRowClick: {
          enabled: true,
          workflowId: 'example_valve_selection_v2_wf_load_request',
          parameterMap: {
            'workflow:import.record': '$detail.row',
          },
        },
      },
    }),
  ];
  valveSelectionV2RequestFields.forEach((field, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    components.push(fieldComponent(`example_valve_selection_v2_edit_${index}`, field, 580 + col * 220, 196 + row * 80, 200, 60, 'edit'));
  });
  valveSelectionV2RequestFields.forEach((field, index) => {
    components.push({
      id: `example_valve_selection_v2_hidden_${index}`,
      type: 'input',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      zIndex: 0,
      fieldBinding: `原始${field.field}`,
      props: { name: `原始${field.field}`, label: `原始${field.field}`, hidden: true },
    });
  });
  components.push(
    buttonComponent('example_valve_selection_v2_update_btn', '保存修改', 580, 682, 180, 50, {
      flowTriggers: {
        onClick: {
          enabled: true,
          workflowId: 'example_valve_selection_v2_wf_update_request',
          parameterMap: buildUpdateParameterMap(valveSelectionV2RequestFields.map((field) => field.field)),
        },
      },
    }),
  );
  components.push(
    buttonComponent('example_valve_selection_v2_edit_run', '重新跑选型', 780, 682, 180, 50, {
      flowTriggers: {
        onClick: {
          enabled: true,
          workflowId: 'example_valve_selection_v2_wf_analyze',
          parameterMap: {
            'workflow:import.criteria': [
              { field: '介质', operator: '==', value: '$form.介质' },
              { field: '适用DN', operator: '==', value: '$form.DN' },
              { field: '最高PN', operator: '>=', value: '$form.PN' },
              { field: '最高适用温度', operator: '>=', value: '$form.设计温度' },
              { field: '连接方式', operator: '==', value: '$form.连接方式' },
              { field: '阀体材质', operator: '==', value: '$form.阀体材质偏好' },
              { field: '预算等级', operator: '==', value: '$form.预算等级' },
              { field: '交期要求', operator: '==', value: '$form.交期要求' },
              { field: '防腐要求', operator: '==', value: '$form.防腐要求' }
            ],
          },
        },
      },
    }),
  );
  components.push(fieldComponent('example_valve_selection_v2_edit_main', { field: '推荐主型号', label: '推荐主型号', type: 'input', editReadonly: true }, 580, 752, 200, 60, 'edit'));
  components.push(fieldComponent('example_valve_selection_v2_edit_accessory', { field: '推荐附件型号', label: '推荐附件型号', type: 'input', editReadonly: true }, 800, 752, 200, 60, 'edit'));
  components.push(fieldComponent('example_valve_selection_v2_edit_count', { field: '匹配数量', label: '匹配数量', type: 'number', editReadonly: true }, 1020, 752, 120, 60, 'edit'));
  components.push({
    id: 'example_valve_selection_v2_edit_desc',
    type: 'textarea',
    x: 24,
    y: 480,
    width: 520,
    height: 110,
    zIndex: 2,
    fieldBinding: '推荐说明',
    props: { name: '推荐说明', label: '推荐说明', readonly: true, rows: 4 },
  });
  components.push({
    id: 'example_valve_selection_v2_edit_empty',
    type: 'textarea',
    x: 24,
    y: 606,
    width: 520,
    height: 110,
    zIndex: 2,
    fieldBinding: '无结果提示',
    props: { name: '无结果提示', label: '无结果提示', readonly: true, rows: 4 },
  });
  components.push(tableComponent('example_valve_selection_v2_edit_candidates', '候选清单', ['型号', '介质', '适用DN', '最高PN', '最高适用温度', '阀体材质', '附件型号', '推荐优先级'], 24, 736, 520, 180, { rows: 4 }));
  return {
    id: 'example_valve_selection_v2_form_edit',
    name: '需求记录维护',
    createdAt: now,
    updatedAt: now,
    behaviors: [],
    design: {
      id: 'example_valve_selection_v2_form_edit',
      name: '需求记录维护',
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

function buildValveSelectionV2Project(): ProjectStructure {
  return {
    config: {
      id: 'example_valve_selection_v2',
      name: '阀门二代选型',
      description: '二代零代码阀门选型示例，覆盖客户需求表、多零件主数据表、兼容规则表与自动候选输出。',
      version: '2.4.0',
      createdAt: now,
      updatedAt: now,
      author: 'FormFlow Studio',
      tags: ['示例', '阀门', '选型', '二代', '零代码'],
    },
    settings: {
      ...createDefaultProjectSettings(),
      publish: {
        format: 'json',
        allowWriteBack: true,
        generateChangeLog: true,
        outputFileName: 'example_valve_selection_v2-export',
      },
      updatedAt: now,
    },
    release: {
      ...createDefaultProjectRelease(),
      mode: 'use',
      defaultFormId: 'example_valve_selection_v2_form_create',
      defaultSheet: '客户需求',
      allowDesigner: false,
      allowBehaviorEditor: false,
      allowWorkflowEditor: false,
      lastVerifiedAt: now,
    },
    srcTable: [
      buildRowsTable('selection_requests', '客户需求', '客户需求.json', '需求单号', valveSelectionRows, '阀门二代选型'),
      buildRowsTable('valve_catalog', '阀门主数据', '阀门主数据.json', 'SKU编码', valveCatalogRows, '阀门二代选型'),
      buildRowsTable('accessory_catalog', '附件主数据', '附件主数据.json', '附件推荐键', accessoryRows, '阀门二代选型'),
      buildRowsTable('compatibility_rules', '兼容规则', '兼容规则.json', '规则编码', compatibilityRuleRows, '阀门二代选型'),
    ],
    globalBehaviors: [],
    forms: [
      buildValveSelectionV2CreateForm(),
      buildValveSelectionV2AnalysisForm(),
      buildValveSelectionV2MaintenanceForm(),
    ],
    workflows: [
      buildSelectionSubmitWorkflow('example_valve_selection_v2_wf_create_request', '保存客户需求'),
      buildSelectionSubmitWorkflow('example_valve_selection_v2_wf_update_request', '更新客户需求'),
      buildValveSelectionV2AnalysisWorkflow(),
      buildValveSelectionV2QueryWorkflow(),
      buildValveSelectionV2LoadWorkflow(),
    ],
    outputs: [
      { id: 'example_valve_selection_v2_output_candidates', name: '候选方案清单', format: 'json', size: 0, createdAt: now },
    ],
  };
}

const valveSelectionV3RequestFields = [
  '需求编号', '项目名称', '客户名称', '介质', '阀门品类', '公称通径DN', '压力等级PN', '设计温度',
  '目标流量', '连接方式', '驱动方式', '泄漏等级', '预算等级', '交期要求', '安装位号',
];

const valveSelectionV3MediumGroupMap: Record<string, string> = {
  清水: '水系统',
  蒸汽: '蒸汽系统',
  油品: '油品系统',
  腐蚀液: '腐蚀系统',
  天然气: '气体系统',
};

const valveSelectionV3BaseRequests: Record<string, unknown>[] = [
  { 需求编号: 9101, 项目名称: '循环水扩容一期', 客户名称: '华东水务', 介质: '清水', 阀门品类: '止回阀', 公称通径DN: 80, 压力等级PN: 16, 设计温度: 45, 目标流量: 110, 连接方式: '法兰', 驱动方式: '手动', 泄漏等级: '标准', 预算等级: '经济型', 交期要求: '常规', 安装位号: 'CW-101' },
  { 需求编号: 9102, 项目名称: '锅炉蒸汽母管', 客户名称: '华北热能', 介质: '蒸汽', 阀门品类: '球阀', 公称通径DN: 100, 压力等级PN: 25, 设计温度: 320, 目标流量: 145, 连接方式: '法兰', 驱动方式: '电动', 泄漏等级: 'VI级', 预算等级: '高配型', 交期要求: '加急', 安装位号: 'STM-220' },
  { 需求编号: 9103, 项目名称: '酸洗循环线', 客户名称: '沿海化工', 介质: '腐蚀液', 阀门品类: '蝶阀', 公称通径DN: 50, 压力等级PN: 16, 设计温度: 90, 目标流量: 52, 连接方式: '对夹', 驱动方式: '手动', 泄漏等级: '标准', 预算等级: '标准型', 交期要求: '加急', 安装位号: 'ACD-050' },
  { 需求编号: 9104, 项目名称: '油品装车线', 客户名称: '中南储运', 介质: '油品', 阀门品类: '闸阀', 公称通径DN: 150, 压力等级PN: 16, 设计温度: 80, 目标流量: 260, 连接方式: '法兰', 驱动方式: '手动', 泄漏等级: '标准', 预算等级: '标准型', 交期要求: '常规', 安装位号: 'OIL-310' },
  { 需求编号: 9105, 项目名称: '天然气调压站', 客户名称: '西部燃气', 介质: '天然气', 阀门品类: '球阀', 公称通径DN: 100, 压力等级PN: 40, 设计温度: 60, 目标流量: 180, 连接方式: '焊接', 驱动方式: '气动', 泄漏等级: 'VI级', 预算等级: '高配型', 交期要求: '加急', 安装位号: 'GAS-118' },
  { 需求编号: 9106, 项目名称: '消防补水支线', 客户名称: '城市建投', 介质: '清水', 阀门品类: '蝶阀', 公称通径DN: 150, 压力等级PN: 16, 设计温度: 35, 目标流量: 300, 连接方式: '法兰', 驱动方式: '手动', 泄漏等级: '标准', 预算等级: '经济型', 交期要求: '常规', 安装位号: 'FIR-015' },
  { 需求编号: 9107, 项目名称: '高温导热油支路', 客户名称: '华南新材', 介质: '油品', 阀门品类: '球阀', 公称通径DN: 80, 压力等级PN: 25, 设计温度: 240, 目标流量: 96, 连接方式: '法兰', 驱动方式: '电动', 泄漏等级: 'VI级', 预算等级: '高配型', 交期要求: '加急', 安装位号: 'HOT-415' },
  { 需求编号: 9108, 项目名称: '循环冷却二期', 客户名称: '华东水务', 介质: '清水', 阀门品类: '止回阀', 公称通径DN: 100, 压力等级PN: 16, 设计温度: 40, 目标流量: 150, 连接方式: '法兰', 驱动方式: '手动', 泄漏等级: '标准', 预算等级: '标准型', 交期要求: '常规', 安装位号: 'CW-202' },
  { 需求编号: 9109, 项目名称: '蒸汽减温减压站', 客户名称: '华北热能', 介质: '蒸汽', 阀门品类: '闸阀', 公称通径DN: 125, 压力等级PN: 25, 设计温度: 280, 目标流量: 175, 连接方式: '法兰', 驱动方式: '电动', 泄漏等级: '标准', 预算等级: '标准型', 交期要求: '常规', 安装位号: 'STM-415' },
  { 需求编号: 9110, 项目名称: '碱洗再生线', 客户名称: '沿海化工', 介质: '腐蚀液', 阀门品类: '球阀', 公称通径DN: 65, 压力等级PN: 16, 设计温度: 70, 目标流量: 68, 连接方式: '法兰', 驱动方式: '手动', 泄漏等级: 'VI级', 预算等级: '高配型', 交期要求: '加急', 安装位号: 'ALK-118' },
  { 需求编号: 9111, 项目名称: '天然气储配支路', 客户名称: '西部燃气', 介质: '天然气', 阀门品类: '蝶阀', 公称通径DN: 150, 压力等级PN: 25, 设计温度: 45, 目标流量: 240, 连接方式: '法兰', 驱动方式: '气动', 泄漏等级: 'VI级', 预算等级: '标准型', 交期要求: '常规', 安装位号: 'GAS-225' },
  { 需求编号: 9112, 项目名称: '海水冷却回路', 客户名称: '港口能源', 介质: '腐蚀液', 阀门品类: '蝶阀', 公称通径DN: 200, 压力等级PN: 16, 设计温度: 50, 目标流量: 320, 连接方式: '对夹', 驱动方式: '手动', 泄漏等级: '标准', 预算等级: '标准型', 交期要求: '常规', 安装位号: 'SEA-011' },
  { 需求编号: 9113, 项目名称: '锅炉补给水回路', 客户名称: '华北热能', 介质: '清水', 阀门品类: '闸阀', 公称通径DN: 125, 压力等级PN: 25, 设计温度: 110, 目标流量: 210, 连接方式: '法兰', 驱动方式: '手动', 泄漏等级: '标准', 预算等级: '标准型', 交期要求: '常规', 安装位号: 'BFW-102' },
  { 需求编号: 9114, 项目名称: '油品循环加热器', 客户名称: '中南储运', 介质: '油品', 阀门品类: '止回阀', 公称通径DN: 80, 压力等级PN: 25, 设计温度: 180, 目标流量: 102, 连接方式: '法兰', 驱动方式: '手动', 泄漏等级: '标准', 预算等级: '经济型', 交期要求: '常规', 安装位号: 'OIL-522' },
  { 需求编号: 9115, 项目名称: '极端蒸汽试验线', 客户名称: '华南研究院', 介质: '蒸汽', 阀门品类: '闸阀', 公称通径DN: 200, 压力等级PN: 40, 设计温度: 420, 目标流量: 280, 连接方式: '焊接', 驱动方式: '气动', 泄漏等级: 'VI级', 预算等级: '高配型', 交期要求: '加急', 安装位号: 'EXP-999' },
];

const valveSelectionV3RequestRows = valveSelectionV3BaseRequests.map((row, index) => ({
  ...row,
  受理状态: index < 5 ? '待确认' : index < 10 ? '待筛选' : '待澄清',
  技术完整度: index < 5 ? '完整' : index < 10 ? '高' : '中',
  风险标签: index % 3 === 0 ? '高温' : index % 3 === 1 ? '交付紧急' : '腐蚀',
  推荐方案号: index < 6 ? `CASE-${row.需求编号}` : '',
  最终确认人: index < 6 ? ['张工', '李工', '王工'][index % 3] : '',
  状态说明: index < 6 ? '已进入方案确认阶段' : '等待后续流程推进',
}));

const valveSelectionV3TechnicalProfileRows = valveSelectionV3RequestRows.map((row, index) => {
  const temp = Number(row.设计温度 || 0);
  const pn = Number(row.压力等级PN || 0);
  const medium = String(row.介质 || '');
  const riskFlags = [
    temp >= 260 ? '高温' : '',
    pn >= 25 ? '高压' : '',
    medium === '腐蚀液' ? '腐蚀' : '',
    String(row.交期要求 || '') === '加急' ? '交付紧急' : '',
  ].filter(Boolean);
  return {
    技术画像ID: 3001 + index,
    需求编号: row.需求编号,
    标准介质组: valveSelectionV3MediumGroupMap[medium] || '通用系统',
    温度分段: temp >= 260 ? '高温' : temp >= 120 ? '中高温' : '常温',
    压力分段: pn >= 40 ? '超高压' : pn >= 25 ? '中高压' : '常压',
    技术完整度: row.技术完整度,
    风险标签: riskFlags.join('、') || '常规',
    缺失项: index >= 10 ? '技术备注' : '',
    受理状态: row.受理状态,
    阀门品类: row.阀门品类,
    公称通径DN: row.公称通径DN,
    压力等级PN: row.压力等级PN,
    设计温度: row.设计温度,
    目标流量: row.目标流量,
    连接方式: row.连接方式,
    驱动方式: row.驱动方式,
    泄漏等级: row.泄漏等级,
    预算等级: row.预算等级,
    交期要求: row.交期要求,
    安装位号: row.安装位号,
    技术备注: index >= 10 ? '需补充现场安装空间' : '已完成一次澄清',
  };
});

const valveSelectionV3CoreValveRows: Record<string, unknown>[] = [
  { SKU编码: 'V3-CHK-W80-A', 型号: 'CHK-W80-16C', 阀门品类: '止回阀', 介质组: '水系统', 适用DN: 80, 最高PN: 16, 最高温度: 120, 连接方式: '法兰', 驱动方式: '手动', 泄漏等级: '标准', 材质: '碳钢', 预算等级: '经济型', 交期要求: '常规', 基础报价: 4200, 交期天数: 7, 风险系数: 1.1, 推荐优先级: 1, 维护系数: 1.2, 选项键: 'OPT-WATER-STD' },
  { SKU编码: 'V3-CHK-W80-B', 型号: 'CHK-W80-25S', 阀门品类: '止回阀', 介质组: '水系统', 适用DN: 80, 最高PN: 25, 最高温度: 180, 连接方式: '法兰', 驱动方式: '手动', 泄漏等级: '标准', 材质: '不锈钢', 预算等级: '标准型', 交期要求: '常规', 基础报价: 5600, 交期天数: 10, 风险系数: 0.9, 推荐优先级: 2, 维护系数: 1.1, 选项键: 'OPT-WATER-PLUS' },
  { SKU编码: 'V3-BALL-S100-A', 型号: 'BAL-S100-25E', 阀门品类: '球阀', 介质组: '蒸汽系统', 适用DN: 100, 最高PN: 25, 最高温度: 350, 连接方式: '法兰', 驱动方式: '电动', 泄漏等级: 'VI级', 材质: '不锈钢', 预算等级: '高配型', 交期要求: '加急', 基础报价: 15800, 交期天数: 9, 风险系数: 0.8, 推荐优先级: 1, 维护系数: 1.3, 选项键: 'OPT-STEAM-HOT' },
  { SKU编码: 'V3-BALL-S100-B', 型号: 'BAL-S100-40E', 阀门品类: '球阀', 介质组: '蒸汽系统', 适用DN: 100, 最高PN: 40, 最高温度: 380, 连接方式: '法兰', 驱动方式: '电动', 泄漏等级: 'VI级', 材质: '合金钢', 预算等级: '高配型', 交期要求: '常规', 基础报价: 17200, 交期天数: 14, 风险系数: 0.7, 推荐优先级: 2, 维护系数: 1.4, 选项键: 'OPT-STEAM-PRO' },
  { SKU编码: 'V3-BF-C50-A', 型号: 'BF-C50-16F', 阀门品类: '蝶阀', 介质组: '腐蚀系统', 适用DN: 50, 最高PN: 16, 最高温度: 120, 连接方式: '对夹', 驱动方式: '手动', 泄漏等级: '标准', 材质: '衬氟', 预算等级: '标准型', 交期要求: '加急', 基础报价: 7800, 交期天数: 8, 风险系数: 0.8, 推荐优先级: 1, 维护系数: 1.1, 选项键: 'OPT-CORR-FAST' },
  { SKU编码: 'V3-BF-C50-B', 型号: 'BF-C50-16SS', 阀门品类: '蝶阀', 介质组: '腐蚀系统', 适用DN: 50, 最高PN: 16, 最高温度: 160, 连接方式: '对夹', 驱动方式: '手动', 泄漏等级: '标准', 材质: '不锈钢', 预算等级: '高配型', 交期要求: '常规', 基础报价: 9200, 交期天数: 12, 风险系数: 0.9, 推荐优先级: 2, 维护系数: 1.2, 选项键: 'OPT-CORR-PLUS' },
  { SKU编码: 'V3-GATE-O150-A', 型号: 'GT-O150-16C', 阀门品类: '闸阀', 介质组: '油品系统', 适用DN: 150, 最高PN: 16, 最高温度: 160, 连接方式: '法兰', 驱动方式: '手动', 泄漏等级: '标准', 材质: '碳钢', 预算等级: '标准型', 交期要求: '常规', 基础报价: 11300, 交期天数: 11, 风险系数: 1, 推荐优先级: 1, 维护系数: 1.2, 选项键: 'OPT-OIL-GATE' },
  { SKU编码: 'V3-BALL-G100-A', 型号: 'BAL-G100-40P', 阀门品类: '球阀', 介质组: '气体系统', 适用DN: 100, 最高PN: 40, 最高温度: 120, 连接方式: '焊接', 驱动方式: '气动', 泄漏等级: 'VI级', 材质: '锻钢', 预算等级: '高配型', 交期要求: '加急', 基础报价: 19600, 交期天数: 10, 风险系数: 0.6, 推荐优先级: 1, 维护系数: 1.5, 选项键: 'OPT-GAS-ACT' },
  { SKU编码: 'V3-BF-G150-A', 型号: 'BF-G150-25A', 阀门品类: '蝶阀', 介质组: '气体系统', 适用DN: 150, 最高PN: 25, 最高温度: 80, 连接方式: '法兰', 驱动方式: '气动', 泄漏等级: 'VI级', 材质: '不锈钢', 预算等级: '标准型', 交期要求: '常规', 基础报价: 14100, 交期天数: 12, 风险系数: 0.8, 推荐优先级: 2, 维护系数: 1.3, 选项键: 'OPT-GAS-LINE' },
  { SKU编码: 'V3-GATE-W125-A', 型号: 'GT-W125-25C', 阀门品类: '闸阀', 介质组: '水系统', 适用DN: 125, 最高PN: 25, 最高温度: 180, 连接方式: '法兰', 驱动方式: '手动', 泄漏等级: '标准', 材质: '碳钢', 预算等级: '标准型', 交期要求: '常规', 基础报价: 8900, 交期天数: 10, 风险系数: 1, 推荐优先级: 1, 维护系数: 1.1, 选项键: 'OPT-WATER-GATE' },
];

const valveSelectionV3ValveCatalogRows = [
  ...valveSelectionV3CoreValveRows,
  ...Array.from({ length: 26 }, (_, index) => {
    const category = ['止回阀', '球阀', '蝶阀', '闸阀'][index % 4];
    const mediumGroup = ['水系统', '蒸汽系统', '油品系统', '腐蚀系统', '气体系统'][index % 5];
    const dn = [65, 80, 100, 125, 150, 200][index % 6];
    const pn = [16, 25, 40][index % 3];
    const temp = [120, 180, 260, 320][index % 4];
    const connection = ['法兰', '对夹', '焊接'][index % 3];
    const drive = ['手动', '电动', '气动'][index % 3];
    return {
      SKU编码: `V3-AUTO-${index + 1}`,
      型号: `${category.slice(0, 1)}-${mediumGroup.slice(0, 1)}-${dn}-${pn}-${index + 1}`,
      阀门品类: category,
      介质组: mediumGroup,
      适用DN: dn,
      最高PN: pn,
      最高温度: temp,
      连接方式: connection,
      驱动方式: drive,
      泄漏等级: drive === '手动' ? '标准' : 'VI级',
      材质: mediumGroup === '腐蚀系统' ? '衬氟' : mediumGroup === '蒸汽系统' ? '合金钢' : '不锈钢',
      预算等级: index % 3 === 0 ? '经济型' : index % 3 === 1 ? '标准型' : '高配型',
      交期要求: index % 2 === 0 ? '常规' : '加急',
      基础报价: 5000 + index * 320,
      交期天数: 7 + (index % 8),
      风险系数: Number((0.7 + (index % 5) * 0.1).toFixed(1)),
      推荐优先级: (index % 3) + 1,
      维护系数: Number((1 + (index % 4) * 0.1).toFixed(1)),
      选项键: ['OPT-WATER-STD', 'OPT-STEAM-HOT', 'OPT-OIL-GATE', 'OPT-CORR-FAST', 'OPT-GAS-ACT'][index % 5],
    };
  }),
];

const valveSelectionV3OptionCatalogRows = [
  { 选项键: 'OPT-WATER-STD', 执行器型号: 'ACT-MNL-080', 密封方案: 'EPDM', 附件包: 'ACC-WATER-STD', 报价附加: 800, 适配说明: '标准水系统附件包' },
  { 选项键: 'OPT-WATER-PLUS', 执行器型号: 'ACT-MNL-080P', 密封方案: 'NBR', 附件包: 'ACC-WATER-PLUS', 报价附加: 1200, 适配说明: '加强型水系统附件包' },
  { 选项键: 'OPT-STEAM-HOT', 执行器型号: 'ACT-ELC-HOT', 密封方案: '石墨', 附件包: 'ACC-STEAM-HOT', 报价附加: 2400, 适配说明: '高温蒸汽电动执行包' },
  { 选项键: 'OPT-STEAM-PRO', 执行器型号: 'ACT-ELC-PRO', 密封方案: '石墨加强', 附件包: 'ACC-STEAM-PRO', 报价附加: 3200, 适配说明: '高压高温增强包' },
  { 选项键: 'OPT-CORR-FAST', 执行器型号: 'ACT-MNL-CF', 密封方案: 'PTFE', 附件包: 'ACC-CORR-FAST', 报价附加: 1800, 适配说明: '防腐快交组合' },
  { 选项键: 'OPT-CORR-PLUS', 执行器型号: 'ACT-MNL-SS', 密封方案: 'PFA', 附件包: 'ACC-CORR-PLUS', 报价附加: 2100, 适配说明: '防腐耐久组合' },
  { 选项键: 'OPT-OIL-GATE', 执行器型号: 'ACT-MNL-GATE', 密封方案: 'NBR', 附件包: 'ACC-OIL-GATE', 报价附加: 1500, 适配说明: '油品闸阀常规包' },
  { 选项键: 'OPT-GAS-ACT', 执行器型号: 'ACT-PNE-GAS', 密封方案: '金属硬密封', 附件包: 'ACC-GAS-ACT', 报价附加: 3600, 适配说明: '燃气站气动执行包' },
  { 选项键: 'OPT-GAS-LINE', 执行器型号: 'ACT-PNE-LINE', 密封方案: '软硬双密封', 附件包: 'ACC-GAS-LINE', 报价附加: 2800, 适配说明: '燃气管线标准包' },
  { 选项键: 'OPT-WATER-GATE', 执行器型号: 'ACT-MNL-GT', 密封方案: 'EPDM', 附件包: 'ACC-WATER-GATE', 报价附加: 900, 适配说明: '补水闸阀包' },
  ...Array.from({ length: 14 }, (_, index) => ({
    选项键: `OPT-AUTO-${index + 1}`,
    执行器型号: `ACT-AUTO-${index + 1}`,
    密封方案: ['EPDM', 'NBR', '石墨', 'PTFE'][index % 4],
    附件包: `ACC-AUTO-${index + 1}`,
    报价附加: 600 + index * 110,
    适配说明: `通用附件组合 ${index + 1}`,
  })),
];

const valveSelectionV3SelectionCaseRows = Array.from({ length: 18 }, (_, index) => ({
  案例ID: `CASE-${9200 + index}`,
  需求编号: valveSelectionV3RequestRows[index % valveSelectionV3RequestRows.length].需求编号,
  推荐方案号: `CASE-${9200 + index}`,
  推荐型号: String(valveSelectionV3ValveCatalogRows[index % valveSelectionV3ValveCatalogRows.length].型号),
  推荐附件: String(valveSelectionV3OptionCatalogRows[index % valveSelectionV3OptionCatalogRows.length].附件包),
  推荐报价: Number(valveSelectionV3ValveCatalogRows[index % valveSelectionV3ValveCatalogRows.length].基础报价) + Number(valveSelectionV3OptionCatalogRows[index % valveSelectionV3OptionCatalogRows.length].报价附加),
  预计交期天数: Number(valveSelectionV3ValveCatalogRows[index % valveSelectionV3ValveCatalogRows.length].交期天数),
  风险标签: index % 3 === 0 ? '高温' : index % 3 === 1 ? '腐蚀' : '交付紧急',
  最终确认人: ['张工', '李工', '王工'][index % 3],
  候选数量: 2 + (index % 3),
  归档时间: `2026-07-${String((index % 9) + 1).padStart(2, '0')}T10:00:00.000Z`,
}));

const valveSelectionV3AuditLogRows = Array.from({ length: 30 }, (_, index) => ({
  审计ID: `AUD-${9300 + index}`,
  需求编号: valveSelectionV3RequestRows[index % valveSelectionV3RequestRows.length].需求编号,
  节点名称: ['受理申请', '标准化工况', '生成候选', '评分排序', '确认方案'][index % 5],
  节点结论: ['完成', '完成', '完成', '待人工确认', '已归档'][index % 5],
  状态流转: ['待受理->待澄清', '待澄清->待筛选', '待筛选->待确认', '待确认->待确认', '待确认->已确认'][index % 5],
  操作人: ['系统', '张工', '李工', '王工'][index % 4],
  时间戳: `2026-07-${String((index % 9) + 1).padStart(2, '0')}T${String(9 + (index % 8)).padStart(2, '0')}:15:00.000Z`,
  备注: index % 2 === 0 ? '按标准流程推进' : '已补充说明',
}));

function buildValveSelectionV3AcceptWorkflow(): WorkflowFile {
  return scriptWorkflow(
    'example_valve_selection_v3_wf_accept_request',
    '受理申请',
    '受理原始需求并写入受理台。',
    [{ name: 'request', type: 'object', value: {} }],
    { requestId: 'number', statusPatch: 'object' },
    `const request = inputs.request || {};
const required = ['需求编号', '项目名称', '介质', '阀门品类', '公称通径DN', '压力等级PN', '设计温度', '连接方式'];
const missing = required.filter((field) => request[field] === '' || request[field] === undefined || request[field] === null);
const status = missing.length > 0 ? '待澄清' : '待澄清';
const row = {
  ...request,
  受理状态: status,
  技术完整度: missing.length > 2 ? '低' : missing.length > 0 ? '中' : '待评估',
  风险标签: '',
  推荐方案号: '',
  最终确认人: '',
  状态说明: missing.length > 0 ? '已受理，等待工况澄清' : '已受理，进入标准化流程',
};
return {
  requestId: Number(request.需求编号 || 0),
  statusPatch: { 受理状态: status, 状态说明: row.状态说明 },
  sideEffects: [
    { kind: 'upsert-table-row', tableId: 'request_intake', sheetName: '需求受理台账', keyField: '需求编号', keyValue: request.需求编号, row },
    { kind: 'set-form-value', field: '受理状态', value: status },
    { kind: 'set-form-value', field: '状态说明', value: row.状态说明 },
    { kind: 'show-message', message: \`需求 \${request.需求编号 || ''} 已受理\`, level: 'success' },
  ],
};`,
  );
}

function buildValveSelectionV3NormalizeWorkflow(): WorkflowFile {
  return {
    id: 'example_valve_selection_v3_wf_normalize_profile',
    name: '标准化工况',
    description: '把原始业务字段转成标准技术画像并回填风险标签。',
    createdAt: now,
    updatedAt: now,
    nodes: [
      workflowNode('workflow:import', 'workflow:import', {
        outputPorts: portDefs([{ name: 'request', type: 'object', label: '原始需求', description: '当前表单原始需求对象' }]),
      }, { x: 40, y: 180 }, 'formflow'),
      workflowNode('next_profile_id', 'behavior-next-sequence', {
        tableId: 'technical_profile',
        sheetName: '技术画像',
        column: '技术画像ID',
        start: 3001,
        step: 1,
      }, { x: 240, y: 60 }, 'behavior'),
      {
        id: 'normalize_script',
        type: 'generic',
        specId: 'behavior-js-script',
        position: { x: 420, y: 180 },
        data: {
          propertiesJson: JSON.stringify({
            inputPorts: { request: 'object', profileId: 'number' },
            outputPorts: {
              normalizedProfile: 'object',
              missingFields: 'array',
              riskFlags: 'array',
              statusPatch: 'object',
              profileId: 'number',
            },
            script: `const request = inputs.request || {};
const profileId = Number(inputs.profileId || 0);
const mediumGroupMap = { 清水: '水系统', 蒸汽: '蒸汽系统', 油品: '油品系统', 腐蚀液: '腐蚀系统', 天然气: '气体系统' };
const temp = Number(request.设计温度 || 0);
const pn = Number(request.压力等级PN || 0);
const medium = String(request.介质 || '');
const missingFields = ['驱动方式', '泄漏等级', '预算等级', '交期要求', '安装位号'].filter((field) => request[field] === '' || request[field] === undefined || request[field] === null);
const riskFlags = [
  temp >= 260 ? '高温' : '',
  pn >= 25 ? '高压' : '',
  medium === '腐蚀液' ? '腐蚀' : '',
  String(request.交期要求 || '') === '加急' ? '交付紧急' : '',
  String(request.泄漏等级 || '') === 'VI级' ? '严密封' : '',
].filter(Boolean);
const profile = {
  技术画像ID: profileId,
  需求编号: request.需求编号,
  标准介质组: mediumGroupMap[medium] || '通用系统',
  温度分段: temp >= 260 ? '高温' : temp >= 120 ? '中高温' : '常温',
  压力分段: pn >= 40 ? '超高压' : pn >= 25 ? '中高压' : '常压',
  技术完整度: missingFields.length === 0 ? '高' : missingFields.length <= 2 ? '中' : '低',
  风险标签: riskFlags.join('、') || '常规',
  缺失项: missingFields.join('、'),
  受理状态: missingFields.length === 0 ? '待筛选' : '待澄清',
  阀门品类: request.阀门品类,
  公称通径DN: request.公称通径DN,
  压力等级PN: request.压力等级PN,
  设计温度: request.设计温度,
  目标流量: request.目标流量,
  连接方式: request.连接方式,
  驱动方式: request.驱动方式,
  泄漏等级: request.泄漏等级,
  预算等级: request.预算等级,
  交期要求: request.交期要求,
  安装位号: request.安装位号,
  技术备注: request.技术备注 || '',
};
return {
  normalizedProfile: profile,
  missingFields,
  riskFlags,
  statusPatch: { 受理状态: profile.受理状态, 技术完整度: profile.技术完整度, 风险标签: profile.风险标签 },
  profileId,
  sideEffects: [
    { kind: 'upsert-table-row', tableId: 'technical_profile', sheetName: '技术画像', keyField: '技术画像ID', keyValue: profileId, row: profile },
    { kind: 'upsert-table-row', tableId: 'request_intake', sheetName: '需求受理台账', keyField: '需求编号', keyValue: request.需求编号, row: { 需求编号: request.需求编号, 受理状态: profile.受理状态, 技术完整度: profile.技术完整度, 风险标签: profile.风险标签, 状态说明: missingFields.length === 0 ? '已生成技术画像，可进入候选筛选' : '存在待补充字段，仍需澄清' } },
    { kind: 'set-form-value', field: '技术画像ID', value: profileId },
    { kind: 'set-form-value', field: '标准介质组', value: profile.标准介质组 },
    { kind: 'set-form-value', field: '温度分段', value: profile.温度分段 },
    { kind: 'set-form-value', field: '压力分段', value: profile.压力分段 },
    { kind: 'set-form-value', field: '技术完整度', value: profile.技术完整度 },
    { kind: 'set-form-value', field: '风险标签', value: profile.风险标签 },
    { kind: 'set-form-value', field: '缺失项', value: profile.缺失项 },
    { kind: 'set-form-value', field: '受理状态', value: profile.受理状态 },
    { kind: 'show-message', message: missingFields.length === 0 ? '技术画像已固化，可进入筛选' : '技术画像已生成，但仍有待补充项', level: missingFields.length === 0 ? 'success' : 'warning' },
  ],
};`,
          }),
        },
      },
      workflowNode('workflow:export', 'workflow:export', {
        inputPorts: portDefs([
          { name: 'normalizedProfile', type: 'object' },
          { name: 'missingFields', type: 'array' },
          { name: 'riskFlags', type: 'array' },
          { name: 'statusPatch', type: 'object' },
          { name: 'profileId', type: 'number' },
        ]),
      }, { x: 760, y: 180 }, 'formflow'),
    ],
    edges: [
      workflowEdge('edge_request_script', 'workflow:import', 'normalize_script', 'request', 'request'),
      workflowEdge('edge_profile_id_script', 'next_profile_id', 'normalize_script', 'value', 'profileId'),
      workflowEdge('edge_profile_export', 'normalize_script', 'workflow:export', 'normalizedProfile', 'normalizedProfile'),
      workflowEdge('edge_missing_export', 'normalize_script', 'workflow:export', 'missingFields', 'missingFields'),
      workflowEdge('edge_risk_export', 'normalize_script', 'workflow:export', 'riskFlags', 'riskFlags'),
      workflowEdge('edge_status_export', 'normalize_script', 'workflow:export', 'statusPatch', 'statusPatch'),
      workflowEdge('edge_profile_id_export', 'normalize_script', 'workflow:export', 'profileId', 'profileId'),
    ],
  };
}

function buildValveSelectionV3CompleteWorkflow(): WorkflowFile {
  return scriptWorkflow(
    'example_valve_selection_v3_wf_complete_profile',
    '补全并固化画像',
    '在技术澄清后再次固化画像状态。',
    [{ name: 'profile', type: 'object', value: {} }],
    { normalizedProfile: 'object', statusPatch: 'object' },
    `const profile = { ...(inputs.profile || {}) };
const missingFields = ['驱动方式', '泄漏等级', '预算等级', '交期要求', '安装位号'].filter((field) => profile[field] === '' || profile[field] === undefined || profile[field] === null);
profile.技术完整度 = missingFields.length === 0 ? '完整' : missingFields.length <= 2 ? '中' : '低';
profile.缺失项 = missingFields.join('、');
profile.受理状态 = missingFields.length === 0 ? '待筛选' : '待澄清';
return {
  normalizedProfile: profile,
  statusPatch: { 受理状态: profile.受理状态, 技术完整度: profile.技术完整度, 缺失项: profile.缺失项 },
  sideEffects: [
    { kind: 'upsert-table-row', tableId: 'technical_profile', sheetName: '技术画像', keyField: '技术画像ID', keyValue: profile.技术画像ID, row: profile },
    { kind: 'upsert-table-row', tableId: 'request_intake', sheetName: '需求受理台账', keyField: '需求编号', keyValue: profile.需求编号, row: { 需求编号: profile.需求编号, 受理状态: profile.受理状态, 技术完整度: profile.技术完整度, 状态说明: missingFields.length === 0 ? '画像已固化，等待候选筛选' : '澄清未完成，需继续补充' } },
    { kind: 'set-form-value', field: '技术完整度', value: profile.技术完整度 },
    { kind: 'set-form-value', field: '缺失项', value: profile.缺失项 },
    { kind: 'set-form-value', field: '受理状态', value: profile.受理状态 },
    { kind: 'show-message', message: missingFields.length === 0 ? '技术画像已固化' : '仍有缺失字段', level: missingFields.length === 0 ? 'success' : 'warning' },
  ],
};`,
  );
}

function buildValveSelectionV3GenerateCandidatesWorkflow(): WorkflowFile {
  return {
    id: 'example_valve_selection_v3_wf_generate_candidates',
    name: '生成候选方案',
    description: '根据技术画像筛出候选阀门并匹配附件组合。',
    createdAt: now,
    updatedAt: now,
    nodes: [
      workflowNode('workflow:import', 'workflow:import', {
        outputPorts: portDefs([{ name: 'profile', type: 'object', label: '技术画像', description: '当前技术画像对象' }]),
      }, { x: 40, y: 180 }, 'formflow'),
      workflowNode('query_valves', 'behavior-data-query', { tableId: 'valve_catalog', sheetName: '阀门主数据' }, { x: 240, y: 80 }, 'behavior'),
      workflowNode('query_options', 'behavior-data-query', { tableId: 'option_catalog', sheetName: '选项附件库' }, { x: 240, y: 260 }, 'behavior'),
      {
        id: 'candidate_script',
        type: 'generic',
        specId: 'behavior-js-script',
        position: { x: 520, y: 180 },
        data: {
          propertiesJson: JSON.stringify({
            inputPorts: { profile: 'object', valves: 'array', options: 'array' },
            outputPorts: { candidateRows: 'array', candidateCount: 'number', filterSummary: 'string' },
            script: `const profile = inputs.profile || {};
const valves = Array.isArray(inputs.valves) ? inputs.valves : [];
const options = Array.isArray(inputs.options) ? inputs.options : [];
const optionMap = new Map(options.map((item) => [item.选项键, item]));
const matches = valves.filter((row) =>
  String(row.阀门品类 || '') === String(profile.阀门品类 || '')
  && String(row.介质组 || '') === String(profile.标准介质组 || '')
  && Number(row.适用DN || 0) === Number(profile.公称通径DN || 0)
  && Number(row.最高PN || 0) >= Number(profile.压力等级PN || 0)
  && Number(row.最高温度 || 0) >= Number(profile.设计温度 || 0)
  && String(row.连接方式 || '') === String(profile.连接方式 || '')
  && (String(row.驱动方式 || '') === String(profile.驱动方式 || '') || String(row.驱动方式 || '') === '通用')
  && (String(profile.泄漏等级 || '') !== 'VI级' || String(row.泄漏等级 || '') === 'VI级')
);
const candidateRows = matches.map((row, index) => {
  const option = optionMap.get(row.选项键) || {};
  return {
    方案编码: \`CAN-\${profile.需求编号 || ''}-\${index + 1}\`,
    型号: row.型号,
    阀门品类: row.阀门品类,
    材质: row.材质,
    基础报价: Number(row.基础报价 || 0),
    报价附加: Number(option.报价附加 || 0),
    组合报价: Number(row.基础报价 || 0) + Number(option.报价附加 || 0),
    预计交期天数: Number(row.交期天数 || 0),
    附件包: option.附件包 || '',
    执行器型号: option.执行器型号 || '',
    密封方案: option.密封方案 || '',
    风险系数: Number(row.风险系数 || 1),
    推荐优先级: Number(row.推荐优先级 || 99),
    维护系数: Number(row.维护系数 || 1),
    适配说明: option.适配说明 || '',
  };
});
const filterSummary = candidateRows.length === 0
  ? \`未找到满足 \${profile.阀门品类 || ''}/\${profile.标准介质组 || ''}/DN\${profile.公称通径DN || ''}/PN\${profile.压力等级PN || ''} 的候选\`
  : \`已根据阀门品类、介质组、DN、PN、温度、连接方式和驱动方式筛出 \${candidateRows.length} 条候选\`;
return {
  candidateRows,
  candidateCount: candidateRows.length,
  filterSummary,
  sideEffects: [
    { kind: 'set-form-value', field: '候选方案清单', value: candidateRows },
    { kind: 'set-form-value', field: '候选数量', value: candidateRows.length },
    { kind: 'set-form-value', field: '候选过滤摘要', value: filterSummary },
    { kind: 'show-message', message: candidateRows.length === 0 ? '未命中候选方案' : \`已生成 \${candidateRows.length} 条候选方案\`, level: candidateRows.length === 0 ? 'warning' : 'success' },
  ],
};`,
          }),
        },
      },
      workflowNode('workflow:export', 'workflow:export', {
        inputPorts: portDefs([
          { name: 'candidateRows', type: 'array' },
          { name: 'candidateCount', type: 'number' },
          { name: 'filterSummary', type: 'string' },
        ]),
      }, { x: 820, y: 180 }, 'formflow'),
    ],
    edges: [
      workflowEdge('edge_profile_to_script', 'workflow:import', 'candidate_script', 'profile', 'profile'),
      workflowEdge('edge_valves_to_script', 'query_valves', 'candidate_script', 'data', 'valves'),
      workflowEdge('edge_options_to_script', 'query_options', 'candidate_script', 'data', 'options'),
      workflowEdge('edge_rows_export', 'candidate_script', 'workflow:export', 'candidateRows', 'candidateRows'),
      workflowEdge('edge_count_export', 'candidate_script', 'workflow:export', 'candidateCount', 'candidateCount'),
      workflowEdge('edge_summary_export', 'candidate_script', 'workflow:export', 'filterSummary', 'filterSummary'),
    ],
  };
}

function buildValveSelectionV3ScoreWorkflow(): WorkflowFile {
  return scriptWorkflow(
    'example_valve_selection_v3_wf_score_candidates',
    '评分排序',
    '对候选方案进行技术、交期、成本与维护性评分。',
    [
      { name: 'profile', type: 'object', value: {} },
      { name: 'candidateRows', type: 'array', value: [] },
    ],
    { rankedCandidates: 'array', scoreSummary: 'string' },
    `const profile = inputs.profile || {};
const rows = Array.isArray(inputs.candidateRows) ? inputs.candidateRows : [];
const rankedCandidates = rows.map((row) => {
  const deliveryScore = String(profile.交期要求 || '') === '加急'
    ? Math.max(0, 40 - Number(row.预计交期天数 || 0) * 2)
    : Math.max(0, 30 - Number(row.预计交期天数 || 0));
  const costScore = String(profile.预算等级 || '') === '经济型'
    ? Math.max(0, 40 - Math.round(Number(row.组合报价 || 0) / 500))
    : String(profile.预算等级 || '') === '标准型'
      ? Math.max(0, 30 - Math.round(Number(row.组合报价 || 0) / 800))
      : Math.max(0, 25 - Math.round(Number(row.组合报价 || 0) / 1200));
  const techScore = 60 - Math.round(Number(row.风险系数 || 1) * 10) + Math.max(0, 6 - Number(row.推荐优先级 || 5));
  const maintenanceScore = Math.max(0, 20 - Math.round(Number(row.维护系数 || 1) * 8));
  const totalScore = techScore + deliveryScore + costScore + maintenanceScore;
  return { ...row, 技术评分: techScore, 交期评分: deliveryScore, 成本评分: costScore, 维护评分: maintenanceScore, 总评分: totalScore };
}).sort((a, b) => Number(b.总评分 || 0) - Number(a.总评分 || 0));
const scoreSummary = rankedCandidates.length === 0 ? '无候选可评分' : \`已完成 \${rankedCandidates.length} 条候选评分，最高分 \${rankedCandidates[0].总评分}\`;
return {
  rankedCandidates,
  scoreSummary,
  sideEffects: [
    { kind: 'set-form-value', field: '评分结果', value: rankedCandidates },
    { kind: 'set-form-value', field: '评分摘要', value: scoreSummary },
    { kind: 'show-message', message: scoreSummary, level: rankedCandidates.length === 0 ? 'warning' : 'success' },
  ],
};`,
  );
}

function buildValveSelectionV3ProposalWorkflow(): WorkflowFile {
  return scriptWorkflow(
    'example_valve_selection_v3_wf_build_proposal',
    '生成提案',
    '从评分结果生成推荐方案与备选方案。',
    [
      { name: 'profile', type: 'object', value: {} },
      { name: 'rankedCandidates', type: 'array', value: [] },
    ],
    {
      patch: 'object',
      recommendedOption: 'object',
      alternativeOptions: 'array',
      pricingSummary: 'string',
      reasonSummary: 'string',
    },
    `const profile = inputs.profile || {};
const rows = Array.isArray(inputs.rankedCandidates) ? inputs.rankedCandidates : [];
const recommended = rows[0] || null;
const alternatives = rows.slice(1, 4);
const pricingSummary = recommended ? '推荐组合报价 ' + recommended.组合报价 + ' 元，预计交期 ' + recommended.预计交期天数 + ' 天' : '暂无可生成提案的候选';
const reasonSummary = recommended
  ? '优先推荐 ' + recommended.型号 + '，因其总评分最高，兼顾 ' + (profile.预算等级 || '预算') + '、' + (profile.交期要求 || '交期') + ' 与 ' + (profile.风险标签 || '风险') + '。'
  : '未找到满足条件的候选，建议回到技术澄清阶段调整边界。';
const patch = recommended ? {
  推荐方案号: 'CASE-' + profile.需求编号,
  推荐型号: recommended.型号,
  推荐附件: recommended.附件包,
  推荐报价: recommended.组合报价,
  预计交期天数: recommended.预计交期天数,
  推荐理由: reasonSummary,
  备选方案: alternatives,
  受理状态: '待确认',
} : {
  推荐方案号: '',
  推荐型号: '',
  推荐附件: '',
  推荐报价: '',
  预计交期天数: '',
  推荐理由: reasonSummary,
  备选方案: [],
  受理状态: '待澄清',
};
return {
  patch,
  recommendedOption: recommended || {},
  alternativeOptions: alternatives,
  pricingSummary,
  reasonSummary,
  sideEffects: [
    { kind: 'set-form-value', field: '推荐方案号', value: patch.推荐方案号 },
    { kind: 'set-form-value', field: '推荐型号', value: patch.推荐型号 },
    { kind: 'set-form-value', field: '推荐附件', value: patch.推荐附件 },
    { kind: 'set-form-value', field: '推荐报价', value: patch.推荐报价 },
    { kind: 'set-form-value', field: '预计交期天数', value: patch.预计交期天数 },
    { kind: 'set-form-value', field: '推荐理由', value: patch.推荐理由 },
    { kind: 'set-form-value', field: '备选方案', value: patch.备选方案 },
    { kind: 'set-form-value', field: '受理状态', value: patch.受理状态 },
    { kind: 'show-message', message: recommended ? '推荐提案已生成' : '未生成提案，请先调整条件', level: recommended ? 'success' : 'warning' },
  ],
};`,
  );
}

function buildValveSelectionV3ConfirmWorkflow(): WorkflowFile {
  return scriptWorkflow(
    'example_valve_selection_v3_wf_confirm_selection',
    '确认方案',
    '把最终确认结果写回主记录。',
    [{ name: 'confirmation', type: 'object', value: {} }],
    { finalCaseId: 'string', statusPatch: 'object' },
    `const confirmation = inputs.confirmation || {};
const finalCaseId = String(confirmation.推荐方案号 || ('CASE-' + (confirmation.需求编号 || '')));
const rowPatch = {
  需求编号: confirmation.需求编号,
  受理状态: '已确认',
  推荐方案号: finalCaseId,
  最终确认人: confirmation.最终确认人 || '待指派',
  状态说明: '已完成方案确认，等待归档',
};
return {
  finalCaseId,
  statusPatch: rowPatch,
  sideEffects: [
    { kind: 'upsert-table-row', tableId: 'request_intake', sheetName: '需求受理台账', keyField: '需求编号', keyValue: confirmation.需求编号, row: rowPatch },
    { kind: 'upsert-table-row', tableId: 'technical_profile', sheetName: '技术画像', keyField: '技术画像ID', keyValue: confirmation.技术画像ID, row: { 技术画像ID: confirmation.技术画像ID, 需求编号: confirmation.需求编号, 受理状态: '已确认' } },
    { kind: 'set-form-value', field: '推荐方案号', value: finalCaseId },
    { kind: 'set-form-value', field: '受理状态', value: '已确认' },
    { kind: 'show-message', message: '方案 ' + finalCaseId + ' 已确认', level: 'success' },
  ],
};`,
  );
}

function buildValveSelectionV3ArchiveWorkflow(): WorkflowFile {
  return scriptWorkflow(
    'example_valve_selection_v3_wf_archive_case',
    '归档案例',
    '将最终方案沉淀到案例库和审计日志。',
    [{ name: 'archiveRecord', type: 'object', value: {} }],
    { caseId: 'string', auditId: 'string' },
    `const record = inputs.archiveRecord || {};
const caseId = String(record.推荐方案号 || ('CASE-' + (record.需求编号 || '')));
const auditId = 'AUD-' + (record.需求编号 || '') + '-FINAL';
const caseRow = {
  案例ID: caseId,
  需求编号: record.需求编号,
  推荐方案号: caseId,
  推荐型号: record.推荐型号,
  推荐附件: record.推荐附件,
  推荐报价: record.推荐报价,
  预计交期天数: record.预计交期天数,
  风险标签: record.风险标签,
  最终确认人: record.最终确认人,
  候选数量: Array.isArray(record.评分结果) ? record.评分结果.length : Number(record.候选数量 || 0),
  归档时间: '2026-07-06T18:00:00.000Z',
};
const auditRow = {
  审计ID: auditId,
  需求编号: record.需求编号,
  节点名称: '归档案例',
  节点结论: '已归档',
  状态流转: '已确认->已归档',
  操作人: record.最终确认人 || '系统',
  时间戳: '2026-07-06T18:00:00.000Z',
  备注: '由第三代流程样板自动归档',
};
return {
  caseId,
  auditId,
  sideEffects: [
    { kind: 'upsert-table-row', tableId: 'selection_cases', sheetName: '选型案例库', keyField: '案例ID', keyValue: caseId, row: caseRow },
    { kind: 'upsert-table-row', tableId: 'selection_audit_log', sheetName: '选型审计日志', keyField: '审计ID', keyValue: auditId, row: auditRow },
    { kind: 'set-form-value', field: '案例摘要', value: '已归档案例 ' + caseId + '，确认人 ' + (record.最终确认人 || '系统') },
    { kind: 'show-message', message: '案例 ' + caseId + ' 已归档', level: 'success' },
  ],
};`,
  );
}

function buildValveSelectionV3QuickRecommendWorkflow(): WorkflowFile {
  return {
    id: 'example_valve_selection_v3_wf_quick_recommend',
    name: '一页式快速推荐',
    description: '面向二代同款交互表单的一页式推荐流程，不复用旧二代流程拆法。',
    createdAt: now,
    updatedAt: now,
    nodes: [
      workflowNode('workflow:import', 'workflow:import', {
        outputPorts: portDefs([{ name: 'request', type: 'object', label: '选型输入', description: '快速推荐表单输入对象' }]),
      }, { x: 40, y: 180 }, 'formflow'),
      workflowNode('query_valves', 'behavior-data-query', { tableId: 'valve_catalog', sheetName: '阀门主数据' }, { x: 240, y: 80 }, 'behavior'),
      workflowNode('query_options', 'behavior-data-query', { tableId: 'option_catalog', sheetName: '选项附件库' }, { x: 240, y: 260 }, 'behavior'),
      {
        id: 'recommend_script',
        type: 'generic',
        specId: 'behavior-js-script',
        position: { x: 520, y: 180 },
        data: {
          propertiesJson: JSON.stringify({
            inputPorts: { request: 'object', valves: 'array', options: 'array' },
            outputPorts: {
              patch: 'object',
              candidateRows: 'array',
              recommendedOption: 'object',
              filterSummary: 'string',
              reasonSummary: 'string',
            },
            script: `const request = inputs.request || {};
const valves = Array.isArray(inputs.valves) ? inputs.valves : [];
const options = Array.isArray(inputs.options) ? inputs.options : [];
const mediumGroupMap = { 清水: '水系统', 蒸汽: '蒸汽系统', 油品: '油品系统', 腐蚀液: '腐蚀系统', 天然气: '气体系统' };
const mediumGroup = mediumGroupMap[String(request.介质 || '')] || '通用系统';
const optionMap = new Map(options.map((item) => [item.选项键, item]));
const candidates = valves
  .filter((row) =>
    String(row.阀门品类 || '') === String(request.阀门品类 || '')
    && String(row.介质组 || '') === mediumGroup
    && Number(row.适用DN || 0) === Number(request.公称通径DN || 0)
    && Number(row.最高PN || 0) >= Number(request.压力等级PN || 0)
    && Number(row.最高温度 || 0) >= Number(request.设计温度 || 0)
    && String(row.连接方式 || '') === String(request.连接方式 || '')
    && String(row.驱动方式 || '') === String(request.驱动方式 || '')
    && (String(request.泄漏等级 || '') !== 'VI级' || String(row.泄漏等级 || '') === 'VI级')
  )
  .map((row, index) => {
    const option = optionMap.get(row.选项键) || {};
    const deliveryScore = String(request.交期要求 || '') === '加急'
      ? Math.max(0, 40 - Number(row.交期天数 || 0) * 2)
      : Math.max(0, 30 - Number(row.交期天数 || 0));
    const costBase = Number(row.基础报价 || 0) + Number(option.报价附加 || 0);
    const costScore = String(request.预算等级 || '') === '经济型'
      ? Math.max(0, 40 - Math.round(costBase / 500))
      : String(request.预算等级 || '') === '标准型'
        ? Math.max(0, 30 - Math.round(costBase / 800))
        : Math.max(0, 25 - Math.round(costBase / 1200));
    const techScore = 60 - Math.round(Number(row.风险系数 || 1) * 10) + Math.max(0, 6 - Number(row.推荐优先级 || 5));
    const maintenanceScore = Math.max(0, 20 - Math.round(Number(row.维护系数 || 1) * 8));
    return {
      方案编码: 'FAST-' + (request.需求编号 || 'REQ') + '-' + (index + 1),
      型号: row.型号,
      阀门品类: row.阀门品类,
      材质: row.材质,
      附件包: option.附件包 || '',
      执行器型号: option.执行器型号 || '',
      密封方案: option.密封方案 || '',
      组合报价: costBase,
      预计交期天数: Number(row.交期天数 || 0),
      风险系数: Number(row.风险系数 || 1),
      推荐优先级: Number(row.推荐优先级 || 99),
      总评分: techScore + deliveryScore + costScore + maintenanceScore,
      适配说明: option.适配说明 || '',
    };
  })
  .sort((a, b) => Number(b.总评分 || 0) - Number(a.总评分 || 0))
  .slice(0, 5);
const recommended = candidates[0] || null;
const filterSummary = candidates.length === 0
  ? '未找到满足当前工况边界的候选，请调整温度、压力或驱动方式。'
  : '已按介质组、品类、DN、PN、温度、连接与驱动综合筛出 ' + candidates.length + ' 条候选';
const reasonSummary = recommended
  ? '推荐 ' + recommended.型号 + '，其综合评分最高，兼顾预算、交期与风险要求。'
  : '暂无可推荐型号，建议回到三代技术澄清流程补充条件。';
const patch = recommended ? {
  标准介质组: mediumGroup,
  候选方案清单: candidates,
  候选数量: candidates.length,
  推荐方案号: 'FAST-' + (request.需求编号 || 'REQ'),
  推荐型号: recommended.型号,
  推荐附件: recommended.附件包,
  推荐报价: recommended.组合报价,
  预计交期天数: recommended.预计交期天数,
  推荐理由: reasonSummary,
  候选过滤摘要: filterSummary,
} : {
  标准介质组: mediumGroup,
  候选方案清单: [],
  候选数量: 0,
  推荐方案号: '',
  推荐型号: '',
  推荐附件: '',
  推荐报价: '',
  预计交期天数: '',
  推荐理由: reasonSummary,
  候选过滤摘要: filterSummary,
};
return {
  patch,
  candidateRows: candidates,
  recommendedOption: recommended || {},
  filterSummary,
  reasonSummary,
  sideEffects: [
    { kind: 'set-form-value', field: '标准介质组', value: patch.标准介质组 },
    { kind: 'set-form-value', field: '候选方案清单', value: patch.候选方案清单 },
    { kind: 'set-form-value', field: '候选数量', value: patch.候选数量 },
    { kind: 'set-form-value', field: '推荐方案号', value: patch.推荐方案号 },
    { kind: 'set-form-value', field: '推荐型号', value: patch.推荐型号 },
    { kind: 'set-form-value', field: '推荐附件', value: patch.推荐附件 },
    { kind: 'set-form-value', field: '推荐报价', value: patch.推荐报价 },
    { kind: 'set-form-value', field: '预计交期天数', value: patch.预计交期天数 },
    { kind: 'set-form-value', field: '推荐理由', value: patch.推荐理由 },
    { kind: 'set-form-value', field: '候选过滤摘要', value: patch.候选过滤摘要 },
    { kind: 'show-message', message: candidates.length === 0 ? '快速推荐未命中候选' : '快速推荐已生成', level: candidates.length === 0 ? 'warning' : 'success' },
  ],
};`,
          }),
        },
      },
      workflowNode('workflow:export', 'workflow:export', {
        inputPorts: portDefs([
          { name: 'patch', type: 'object' },
          { name: 'candidateRows', type: 'array' },
          { name: 'recommendedOption', type: 'object' },
          { name: 'filterSummary', type: 'string' },
          { name: 'reasonSummary', type: 'string' },
        ]),
      }, { x: 860, y: 180 }, 'formflow'),
    ],
    edges: [
      workflowEdge('edge_quick_request', 'workflow:import', 'recommend_script', 'request', 'request'),
      workflowEdge('edge_quick_valves', 'query_valves', 'recommend_script', 'data', 'valves'),
      workflowEdge('edge_quick_options', 'query_options', 'recommend_script', 'data', 'options'),
      workflowEdge('edge_quick_patch', 'recommend_script', 'workflow:export', 'patch', 'patch'),
      workflowEdge('edge_quick_rows', 'recommend_script', 'workflow:export', 'candidateRows', 'candidateRows'),
      workflowEdge('edge_quick_recommended', 'recommend_script', 'workflow:export', 'recommendedOption', 'recommendedOption'),
      workflowEdge('edge_quick_filter', 'recommend_script', 'workflow:export', 'filterSummary', 'filterSummary'),
      workflowEdge('edge_quick_reason', 'recommend_script', 'workflow:export', 'reasonSummary', 'reasonSummary'),
    ],
  };
}

function buildValveSelectionV3QuickFillWorkflow(): WorkflowFile {
  return {
    id: 'example_valve_selection_v3_wf_quick_fill_request',
    name: '快速推荐台按编号回填',
    description: '输入需求编号后自动从受理台账回填历史工况。',
    createdAt: now,
    updatedAt: now,
    nodes: [
      workflowNode('workflow:import', 'workflow:import', {
        outputPorts: portDefs([{ name: 'requestId', type: 'number', label: '需求编号', description: '输入的需求编号' }]),
      }, { x: 40, y: 180 }, 'formflow'),
      workflowNode('query_requests', 'behavior-data-query', { tableId: 'request_intake', sheetName: '需求受理台账' }, { x: 240, y: 180 }, 'behavior'),
      {
        id: 'fill_script',
        type: 'generic',
        specId: 'behavior-js-script',
        position: { x: 500, y: 180 },
        data: {
          propertiesJson: JSON.stringify({
            inputPorts: { requestId: 'number', rows: 'array' },
            outputPorts: { record: 'object', matched: 'boolean' },
            script: `const requestId = Number(inputs.requestId || 0);
const rows = Array.isArray(inputs.rows) ? inputs.rows : [];
const record = rows.find((row) => Number(row?.需求编号 || 0) === requestId) || null;
const fillFields = ['介质', '阀门品类', '公称通径DN', '压力等级PN', '设计温度', '目标流量', '连接方式', '驱动方式', '泄漏等级', '预算等级', '交期要求'];
const sideEffects = [];
if (record) {
  for (const field of fillFields) sideEffects.push({ kind: 'set-form-value', field, value: record[field] ?? '' });
  sideEffects.push({ kind: 'show-message', message: '已按需求编号自动带出历史工况', level: 'success' });
} else if (requestId) {
  sideEffects.push({ kind: 'show-message', message: '未找到对应需求编号，保留手工输入', level: 'warning' });
}
return { record: record || {}, matched: !!record, sideEffects };`,
          }),
        },
      },
      workflowNode('workflow:export', 'workflow:export', {
        inputPorts: portDefs([
          { name: 'record', type: 'object' },
          { name: 'matched', type: 'boolean' },
        ]),
      }, { x: 760, y: 180 }, 'formflow'),
    ],
    edges: [
      workflowEdge('edge_fill_request_id', 'workflow:import', 'fill_script', 'requestId', 'requestId'),
      workflowEdge('edge_fill_rows', 'query_requests', 'fill_script', 'data', 'rows'),
      workflowEdge('edge_fill_record', 'fill_script', 'workflow:export', 'record', 'record'),
      workflowEdge('edge_fill_matched', 'fill_script', 'workflow:export', 'matched', 'matched'),
    ],
  };
}

function buildValveSelectionV3QuickRecommendForm(): FormEntry {
  const quickFields: FieldDef[] = [
    { field: '需求编号', label: '需求编号', type: 'number', required: true },
    { field: '介质', label: '介质', type: 'select', required: true, options: ['清水', '蒸汽', '油品', '腐蚀液', '天然气'] },
    { field: '阀门品类', label: '阀门品类', type: 'select', required: true, options: ['止回阀', '球阀', '蝶阀', '闸阀'] },
    { field: '公称通径DN', label: '公称通径DN', type: 'number', required: true },
    { field: '压力等级PN', label: '压力等级PN', type: 'number', required: true },
    { field: '设计温度', label: '设计温度', type: 'number', required: true },
    { field: '目标流量', label: '目标流量', type: 'number', required: true },
    { field: '连接方式', label: '连接方式', type: 'select', required: true, options: ['法兰', '对夹', '焊接'] },
    { field: '驱动方式', label: '驱动方式', type: 'select', required: true, options: ['手动', '电动', '气动'] },
    { field: '泄漏等级', label: '泄漏等级', type: 'select', required: true, options: ['标准', 'VI级'] },
    { field: '预算等级', label: '预算等级', type: 'select', required: true, options: ['经济型', '标准型', '高配型'] },
    { field: '交期要求', label: '交期要求', type: 'select', required: true, options: ['常规', '加急'] },
  ];
  const components: DesignComponent[] = [
    textComponent('example_valve_selection_v3_quick_title', '第三代阀门选型 · 快速推荐台', 24, 24, 960, 40, { fontSize: 22, fontWeight: 'bold', color: '#0f172a' }),
    textComponent('example_valve_selection_v3_quick_hint', '交互形态参考二代单页推荐，但底层走全新的三代快选流程。', 24, 70, 960, 28, { fontSize: 13, color: '#475569' }),
  ];
  quickFields.forEach((field, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const component = fieldComponent(`example_valve_selection_v3_quick_${index}`, field, 24 + col * 252, 116 + row * 80, 220, 60, 'create');
    if (field.field === '需求编号') {
      component.props = {
        ...component.props,
        flowTriggers: {
          onBlur: {
            enabled: true,
            workflowId: 'example_valve_selection_v3_wf_quick_fill_request',
            parameterMap: {
              'workflow:import.requestId': '$value',
            },
          },
        },
      };
    }
    components.push(component);
  });
  components.push(buttonComponent('example_valve_selection_v3_quick_run', '开始推荐', 24, 476, 180, 50, {
    flowTriggers: {
      onClick: {
        enabled: true,
        workflowId: 'example_valve_selection_v3_wf_quick_recommend',
        parameterMap: buildPortObjectParameterMap('request', quickFields.map((field) => field.field)),
      },
    },
  }));
  components.push(fieldComponent('example_valve_selection_v3_quick_medium_group', { field: '标准介质组', label: '标准介质组', type: 'input', createReadonly: true }, 224, 476, 180, 60, 'create'));
  components.push(fieldComponent('example_valve_selection_v3_quick_count', { field: '候选数量', label: '候选数量', type: 'number', createReadonly: true }, 424, 476, 140, 60, 'create'));
  components.push(fieldComponent('example_valve_selection_v3_quick_case', { field: '推荐方案号', label: '推荐方案号', type: 'input', createReadonly: true }, 584, 476, 180, 60, 'create'));
  components.push(fieldComponent('example_valve_selection_v3_quick_model', { field: '推荐型号', label: '推荐型号', type: 'input', createReadonly: true }, 784, 476, 220, 60, 'create'));
  components.push(fieldComponent('example_valve_selection_v3_quick_accessory', { field: '推荐附件', label: '推荐附件', type: 'input', createReadonly: true }, 24, 556, 220, 60, 'create'));
  components.push(fieldComponent('example_valve_selection_v3_quick_price', { field: '推荐报价', label: '推荐报价', type: 'number', createReadonly: true }, 276, 556, 180, 60, 'create'));
  components.push(fieldComponent('example_valve_selection_v3_quick_lead', { field: '预计交期天数', label: '预计交期天数', type: 'number', createReadonly: true }, 488, 556, 180, 60, 'create'));
  components.push({
    id: 'example_valve_selection_v3_quick_filter',
    type: 'textarea',
    x: 24,
    y: 636,
    width: 500,
    height: 100,
    zIndex: 2,
    fieldBinding: '候选过滤摘要',
    props: { name: '候选过滤摘要', label: '候选过滤摘要', readonly: true, rows: 3 },
  });
  components.push({
    id: 'example_valve_selection_v3_quick_reason',
    type: 'textarea',
    x: 544,
    y: 636,
    width: 460,
    height: 100,
    zIndex: 2,
    fieldBinding: '推荐理由',
    props: { name: '推荐理由', label: '推荐理由', readonly: true, rows: 3 },
  });
  components.push(tableComponent('example_valve_selection_v3_quick_candidates', '候选方案清单', ['方案编码', '型号', '组合报价', '预计交期天数', '附件包', '总评分'], 24, 760, 980, 220, { rows: 5 }));
  return {
    id: 'example_valve_selection_v3_form_quick_recommend',
    name: '快速推荐台',
    createdAt: now,
    updatedAt: now,
    behaviors: [],
    design: {
      id: 'example_valve_selection_v3_form_quick_recommend',
      name: '快速推荐台',
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

function buildValveSelectionV3IntakeForm(): FormEntry {
  const fieldDefs: FieldDef[] = [
    { field: '需求编号', label: '需求编号', type: 'number', required: true },
    { field: '项目名称', label: '项目名称', type: 'input', required: true },
    { field: '客户名称', label: '客户名称', type: 'input', required: true },
    { field: '介质', label: '介质', type: 'select', required: true, options: ['清水', '蒸汽', '油品', '腐蚀液', '天然气'] },
    { field: '阀门品类', label: '阀门品类', type: 'select', required: true, options: ['止回阀', '球阀', '蝶阀', '闸阀'] },
    { field: '公称通径DN', label: '公称通径DN', type: 'number', required: true },
    { field: '压力等级PN', label: '压力等级PN', type: 'number', required: true },
    { field: '设计温度', label: '设计温度', type: 'number', required: true },
    { field: '目标流量', label: '目标流量', type: 'number', required: true },
    { field: '连接方式', label: '连接方式', type: 'select', required: true, options: ['法兰', '对夹', '焊接'] },
    { field: '驱动方式', label: '驱动方式', type: 'select', required: true, options: ['手动', '电动', '气动'] },
    { field: '泄漏等级', label: '泄漏等级', type: 'select', required: true, options: ['标准', 'VI级'] },
    { field: '预算等级', label: '预算等级', type: 'select', required: true, options: ['经济型', '标准型', '高配型'] },
    { field: '交期要求', label: '交期要求', type: 'select', required: true, options: ['常规', '加急'] },
    { field: '安装位号', label: '安装位号', type: 'input', required: true },
  ];
  const components: DesignComponent[] = [
    textComponent('example_valve_selection_v3_intake_title', '第三代阀门选型 · 需求受理台', 24, 24, 960, 40, { fontSize: 22, fontWeight: 'bold', color: '#0f172a' }),
    textComponent('example_valve_selection_v3_intake_hint', '先受理原始需求，再进入技术画像和候选方案流程。', 24, 70, 960, 28, { fontSize: 13, color: '#475569' }),
  ];
  fieldDefs.forEach((field, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    components.push(fieldComponent(`example_valve_selection_v3_intake_${index}`, field, 24 + col * 252, 116 + row * 80, 220, 60, 'create'));
  });
  components.push(fieldComponent('example_valve_selection_v3_status', { field: '受理状态', label: '受理状态', type: 'input', createReadonly: true }, 24, 556, 220, 60, 'create'));
  components.push({
    id: 'example_valve_selection_v3_status_desc',
    type: 'textarea',
    x: 276,
    y: 556,
    width: 472,
    height: 90,
    zIndex: 2,
    fieldBinding: '状态说明',
    props: { name: '状态说明', label: '状态说明', readonly: true, rows: 3 },
  });
  components.push(buttonComponent('example_valve_selection_v3_accept_btn', '受理申请', 780, 556, 180, 50, {
    flowTriggers: {
      onClick: {
        enabled: true,
        workflowId: 'example_valve_selection_v3_wf_accept_request',
        parameterMap: buildPortObjectParameterMap('request', valveSelectionV3RequestFields),
      },
    },
  }));
  return {
    id: 'example_valve_selection_v3_form_intake',
    name: '需求受理台',
    createdAt: now,
    updatedAt: now,
    behaviors: [],
    design: {
      id: 'example_valve_selection_v3_form_intake',
      name: '需求受理台',
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

function buildValveSelectionV3TechForm(): FormEntry {
  const sourceFields: FieldDef[] = [
    { field: '需求编号', label: '需求编号', type: 'number', required: true },
    { field: '阀门品类', label: '阀门品类', type: 'select', required: true, options: ['止回阀', '球阀', '蝶阀', '闸阀'] },
    { field: '介质', label: '介质', type: 'select', required: true, options: ['清水', '蒸汽', '油品', '腐蚀液', '天然气'] },
    { field: '公称通径DN', label: '公称通径DN', type: 'number', required: true },
    { field: '压力等级PN', label: '压力等级PN', type: 'number', required: true },
    { field: '设计温度', label: '设计温度', type: 'number', required: true },
    { field: '目标流量', label: '目标流量', type: 'number', required: true },
    { field: '连接方式', label: '连接方式', type: 'select', required: true, options: ['法兰', '对夹', '焊接'] },
    { field: '驱动方式', label: '驱动方式', type: 'select', required: true, options: ['手动', '电动', '气动'] },
    { field: '泄漏等级', label: '泄漏等级', type: 'select', required: true, options: ['标准', 'VI级'] },
    { field: '预算等级', label: '预算等级', type: 'select', required: true, options: ['经济型', '标准型', '高配型'] },
    { field: '交期要求', label: '交期要求', type: 'select', required: true, options: ['常规', '加急'] },
    { field: '安装位号', label: '安装位号', type: 'input', required: true },
  ];
  const components: DesignComponent[] = [
    textComponent('example_valve_selection_v3_tech_title', '第三代阀门选型 · 技术澄清台', 24, 24, 960, 40, { fontSize: 22, fontWeight: 'bold', color: '#0f172a' }),
    textComponent('example_valve_selection_v3_tech_hint', '把原始需求标准化为技术画像，并固化待筛选状态。', 24, 70, 960, 28, { fontSize: 13, color: '#475569' }),
  ];
  sourceFields.forEach((field, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    components.push(fieldComponent(`example_valve_selection_v3_tech_${index}`, field, 24 + col * 252, 116 + row * 80, 220, 60, 'edit'));
  });
  components.push(fieldComponent('example_valve_selection_v3_profile_id', { field: '技术画像ID', label: '技术画像ID', type: 'number', editReadonly: true }, 24, 476, 220, 60, 'edit'));
  components.push(fieldComponent('example_valve_selection_v3_medium_group', { field: '标准介质组', label: '标准介质组', type: 'input', editReadonly: true }, 276, 476, 220, 60, 'edit'));
  components.push(fieldComponent('example_valve_selection_v3_temp_band', { field: '温度分段', label: '温度分段', type: 'input', editReadonly: true }, 528, 476, 220, 60, 'edit'));
  components.push(fieldComponent('example_valve_selection_v3_pressure_band', { field: '压力分段', label: '压力分段', type: 'input', editReadonly: true }, 780, 476, 220, 60, 'edit'));
  components.push(fieldComponent('example_valve_selection_v3_integrity', { field: '技术完整度', label: '技术完整度', type: 'input', editReadonly: true }, 24, 556, 220, 60, 'edit'));
  components.push(fieldComponent('example_valve_selection_v3_status_tech', { field: '受理状态', label: '受理状态', type: 'input', editReadonly: true }, 276, 556, 220, 60, 'edit'));
  components.push({
    id: 'example_valve_selection_v3_risk_tags',
    type: 'textarea',
    x: 528,
    y: 556,
    width: 220,
    height: 90,
    zIndex: 2,
    fieldBinding: '风险标签',
    props: { name: '风险标签', label: '风险标签', readonly: true, rows: 3 },
  });
  components.push({
    id: 'example_valve_selection_v3_missing_fields',
    type: 'textarea',
    x: 780,
    y: 556,
    width: 220,
    height: 90,
    zIndex: 2,
    fieldBinding: '缺失项',
    props: { name: '缺失项', label: '缺失项', readonly: true, rows: 3 },
  });
  components.push(buttonComponent('example_valve_selection_v3_normalize_btn', '标准化工况', 24, 672, 180, 50, {
    flowTriggers: {
      onClick: {
        enabled: true,
        workflowId: 'example_valve_selection_v3_wf_normalize_profile',
        parameterMap: buildPortObjectParameterMap('request', sourceFields.map((field) => field.field)),
      },
    },
  }));
  components.push(buttonComponent('example_valve_selection_v3_complete_btn', '补全并固化', 224, 672, 180, 50, {
    flowTriggers: {
      onClick: {
        enabled: true,
        workflowId: 'example_valve_selection_v3_wf_complete_profile',
        parameterMap: buildPortObjectParameterMap('profile', ['技术画像ID', '需求编号', '标准介质组', '温度分段', '压力分段', '技术完整度', '风险标签', '缺失项', '受理状态', ...sourceFields.map((field) => field.field), '技术备注']),
      },
    },
  }));
  return {
    id: 'example_valve_selection_v3_form_tech',
    name: '技术澄清台',
    createdAt: now,
    updatedAt: now,
    behaviors: [],
    design: {
      id: 'example_valve_selection_v3_form_tech',
      name: '技术澄清台',
      formMode: 'edit',
      viewport: { zoom: 1, panX: 0, panY: 0 },
      gridSize: 10,
      createdAt: now,
      updatedAt: now,
      bindings: [],
      components,
    },
  };
}

function buildValveSelectionV3DecisionForm(): FormEntry {
  const profileFields: FieldDef[] = [
    { field: '技术画像ID', label: '技术画像ID', type: 'number', required: true },
    { field: '需求编号', label: '需求编号', type: 'number', required: true },
    { field: '阀门品类', label: '阀门品类', type: 'select', required: true, options: ['止回阀', '球阀', '蝶阀', '闸阀'] },
    { field: '标准介质组', label: '标准介质组', type: 'input', required: true },
    { field: '公称通径DN', label: '公称通径DN', type: 'number', required: true },
    { field: '压力等级PN', label: '压力等级PN', type: 'number', required: true },
    { field: '设计温度', label: '设计温度', type: 'number', required: true },
    { field: '连接方式', label: '连接方式', type: 'select', required: true, options: ['法兰', '对夹', '焊接'] },
    { field: '驱动方式', label: '驱动方式', type: 'select', required: true, options: ['手动', '电动', '气动'] },
    { field: '泄漏等级', label: '泄漏等级', type: 'select', required: true, options: ['标准', 'VI级'] },
    { field: '预算等级', label: '预算等级', type: 'select', required: true, options: ['经济型', '标准型', '高配型'] },
    { field: '交期要求', label: '交期要求', type: 'select', required: true, options: ['常规', '加急'] },
    { field: '风险标签', label: '风险标签', type: 'input', editReadonly: true },
    { field: '受理状态', label: '受理状态', type: 'input', editReadonly: true },
    { field: '最终确认人', label: '最终确认人', type: 'input', required: true },
  ];
  const components: DesignComponent[] = [
    textComponent('example_valve_selection_v3_decision_title', '第三代阀门选型 · 方案决策台', 24, 24, 1080, 40, { fontSize: 22, fontWeight: 'bold', color: '#0f172a' }),
    textComponent('example_valve_selection_v3_decision_hint', '候选、评分、提案、确认和归档分阶段推进，每一步都是独立流程。', 24, 70, 1080, 28, { fontSize: 13, color: '#475569' }),
  ];
  profileFields.forEach((field, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    components.push(fieldComponent(`example_valve_selection_v3_decision_${index}`, field, 24 + col * 252, 116 + row * 80, 220, 60, 'edit'));
  });
  components.push(buttonComponent('example_valve_selection_v3_generate_btn', '生成候选', 24, 556, 160, 50, {
    flowTriggers: {
      onClick: {
        enabled: true,
        workflowId: 'example_valve_selection_v3_wf_generate_candidates',
        parameterMap: buildPortObjectParameterMap('profile', ['技术画像ID', '需求编号', '阀门品类', '标准介质组', '公称通径DN', '压力等级PN', '设计温度', '连接方式', '驱动方式', '泄漏等级', '预算等级', '交期要求', '风险标签']),
      },
    },
  }));
  components.push(buttonComponent('example_valve_selection_v3_score_btn', '评分排序', 204, 556, 160, 50, {
    flowTriggers: {
      onClick: {
        enabled: true,
        workflowId: 'example_valve_selection_v3_wf_score_candidates',
        parameterMap: {
          ...buildPortObjectParameterMap('profile', ['技术画像ID', '需求编号', '阀门品类', '标准介质组', '公称通径DN', '压力等级PN', '设计温度', '连接方式', '驱动方式', '泄漏等级', '预算等级', '交期要求', '风险标签']),
          'workflow:import.candidateRows': '$form.候选方案清单',
        },
      },
    },
  }));
  components.push(buttonComponent('example_valve_selection_v3_proposal_btn', '生成提案', 384, 556, 160, 50, {
    flowTriggers: {
      onClick: {
        enabled: true,
        workflowId: 'example_valve_selection_v3_wf_build_proposal',
        parameterMap: {
          ...buildPortObjectParameterMap('profile', ['技术画像ID', '需求编号', '阀门品类', '标准介质组', '公称通径DN', '压力等级PN', '设计温度', '连接方式', '驱动方式', '泄漏等级', '预算等级', '交期要求', '风险标签']),
          'workflow:import.rankedCandidates': '$form.评分结果',
        },
      },
    },
  }));
  components.push(buttonComponent('example_valve_selection_v3_confirm_btn', '确认方案', 564, 556, 160, 50, {
    flowTriggers: {
      onClick: {
        enabled: true,
        workflowId: 'example_valve_selection_v3_wf_confirm_selection',
        parameterMap: buildPortObjectParameterMap('confirmation', ['技术画像ID', '需求编号', '风险标签', '最终确认人', '推荐方案号', '推荐型号', '推荐附件', '推荐报价', '预计交期天数']),
      },
    },
  }));
  components.push(buttonComponent('example_valve_selection_v3_archive_btn', '归档案例', 744, 556, 160, 50, {
    flowTriggers: {
      onClick: {
        enabled: true,
        workflowId: 'example_valve_selection_v3_wf_archive_case',
        parameterMap: buildPortObjectParameterMap('archiveRecord', ['需求编号', '风险标签', '最终确认人', '推荐方案号', '推荐型号', '推荐附件', '推荐报价', '预计交期天数', '候选数量', '评分结果']),
      },
    },
  }));
  components.push(fieldComponent('example_valve_selection_v3_candidate_count', { field: '候选数量', label: '候选数量', type: 'number', editReadonly: true }, 924, 556, 140, 60, 'edit'));
  components.push({
    id: 'example_valve_selection_v3_filter_summary',
    type: 'textarea',
    x: 24,
    y: 636,
    width: 340,
    height: 96,
    zIndex: 2,
    fieldBinding: '候选过滤摘要',
    props: { name: '候选过滤摘要', label: '候选过滤摘要', readonly: true, rows: 3 },
  });
  components.push({
    id: 'example_valve_selection_v3_score_summary',
    type: 'textarea',
    x: 384,
    y: 636,
    width: 320,
    height: 96,
    zIndex: 2,
    fieldBinding: '评分摘要',
    props: { name: '评分摘要', label: '评分摘要', readonly: true, rows: 3 },
  });
  components.push({
    id: 'example_valve_selection_v3_reason',
    type: 'textarea',
    x: 724,
    y: 636,
    width: 340,
    height: 96,
    zIndex: 2,
    fieldBinding: '推荐理由',
    props: { name: '推荐理由', label: '推荐理由', readonly: true, rows: 3 },
  });
  components.push(fieldComponent('example_valve_selection_v3_case_id', { field: '推荐方案号', label: '推荐方案号', type: 'input', editReadonly: true }, 24, 748, 220, 60, 'edit'));
  components.push(fieldComponent('example_valve_selection_v3_model', { field: '推荐型号', label: '推荐型号', type: 'input', editReadonly: true }, 276, 748, 220, 60, 'edit'));
  components.push(fieldComponent('example_valve_selection_v3_accessory', { field: '推荐附件', label: '推荐附件', type: 'input', editReadonly: true }, 528, 748, 220, 60, 'edit'));
  components.push(fieldComponent('example_valve_selection_v3_price', { field: '推荐报价', label: '推荐报价', type: 'number', editReadonly: true }, 780, 748, 140, 60, 'edit'));
  components.push(fieldComponent('example_valve_selection_v3_lead', { field: '预计交期天数', label: '预计交期天数', type: 'number', editReadonly: true }, 944, 748, 120, 60, 'edit'));
  components.push(tableComponent('example_valve_selection_v3_candidates', '候选方案清单', ['方案编码', '型号', '组合报价', '预计交期天数', '附件包', '风险系数'], 24, 828, 500, 190, { rows: 4 }));
  components.push(tableComponent('example_valve_selection_v3_scores', '评分结果', ['方案编码', '型号', '总评分', '技术评分', '交期评分', '成本评分'], 544, 828, 520, 190, { rows: 4 }));
  components.push(tableComponent('example_valve_selection_v3_alternatives', '备选方案', ['方案编码', '型号', '组合报价', '预计交期天数'], 24, 1038, 1040, 150, { rows: 3 }));
  return {
    id: 'example_valve_selection_v3_form_decision',
    name: '方案决策台',
    createdAt: now,
    updatedAt: now,
    behaviors: [],
    design: {
      id: 'example_valve_selection_v3_form_decision',
      name: '方案决策台',
      formMode: 'edit',
      viewport: { zoom: 1, panX: 0, panY: 0 },
      gridSize: 10,
      createdAt: now,
      updatedAt: now,
      bindings: [],
      components,
    },
  };
}

function buildValveSelectionV3ReviewForm(): FormEntry {
  const components: DesignComponent[] = [
    textComponent('example_valve_selection_v3_review_title', '第三代阀门选型 · 案例复盘台', 24, 24, 960, 40, { fontSize: 22, fontWeight: 'bold', color: '#0f172a' }),
    textComponent('example_valve_selection_v3_review_hint', '这一页用于查看归档结果和审计轨迹，验证流程闭环。', 24, 70, 960, 28, { fontSize: 13, color: '#475569' }),
    tableComponent('example_valve_selection_v3_case_table', '案例列表', ['案例ID', '需求编号', '推荐型号', '推荐报价', '最终确认人', '归档时间'], 24, 116, 1040, 240, { rows: 6 }),
    tableComponent('example_valve_selection_v3_audit_table', '审计轨迹', ['审计ID', '需求编号', '节点名称', '节点结论', '状态流转', '操作人'], 24, 384, 1040, 260, { rows: 7 }),
    {
      id: 'example_valve_selection_v3_review_summary',
      type: 'textarea',
      x: 24,
      y: 670,
      width: 1040,
      height: 120,
      zIndex: 2,
      fieldBinding: '案例摘要',
      props: { name: '案例摘要', label: '案例摘要', readonly: true, rows: 4 },
    },
  ];
  return {
    id: 'example_valve_selection_v3_form_review',
    name: '案例复盘台',
    createdAt: now,
    updatedAt: now,
    behaviors: [],
    design: {
      id: 'example_valve_selection_v3_form_review',
      name: '案例复盘台',
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

function buildValveSelectionV3Project(): ProjectStructure {
  return {
    config: {
      id: 'example_valve_selection_v3',
      name: '第三代阀门选型',
      description: '基于全新流程域拆分的通用阀门选型平台示例，覆盖受理、澄清、筛选、评分、提案、确认与归档。',
      version: '3.0.0',
      createdAt: now,
      updatedAt: now,
      author: 'FormFlow Studio',
      tags: ['示例', '阀门', '选型', '第三代', '流程架构'],
    },
    settings: {
      ...createDefaultProjectSettings(),
      publish: {
        format: 'json',
        allowWriteBack: true,
        generateChangeLog: true,
        outputFileName: 'example_valve_selection_v3-export',
      },
      updatedAt: now,
    },
    release: {
      ...createDefaultProjectRelease(),
      mode: 'use',
      defaultFormId: 'example_valve_selection_v3_form_intake',
      defaultSheet: '需求受理台账',
      allowDesigner: false,
      allowBehaviorEditor: false,
      allowWorkflowEditor: false,
      lastVerifiedAt: now,
    },
    srcTable: [
      buildRowsTable('request_intake', '需求受理台账', '需求受理台账.json', '需求编号', valveSelectionV3RequestRows, '第三代阀门选型'),
      buildRowsTable('technical_profile', '技术画像', '技术画像.json', '技术画像ID', valveSelectionV3TechnicalProfileRows, '第三代阀门选型'),
      buildRowsTable('valve_catalog', '阀门主数据', '阀门主数据.json', 'SKU编码', valveSelectionV3ValveCatalogRows, '第三代阀门选型'),
      buildRowsTable('option_catalog', '选项附件库', '选项附件库.json', '选项键', valveSelectionV3OptionCatalogRows, '第三代阀门选型'),
      buildRowsTable('selection_cases', '选型案例库', '选型案例库.json', '案例ID', valveSelectionV3SelectionCaseRows, '第三代阀门选型'),
      buildRowsTable('selection_audit_log', '选型审计日志', '选型审计日志.json', '审计ID', valveSelectionV3AuditLogRows, '第三代阀门选型'),
    ],
    globalBehaviors: [],
    forms: [
      buildValveSelectionV3IntakeForm(),
      buildValveSelectionV3QuickRecommendForm(),
      buildValveSelectionV3TechForm(),
      buildValveSelectionV3DecisionForm(),
      buildValveSelectionV3ReviewForm(),
    ],
    workflows: [
      buildValveSelectionV3AcceptWorkflow(),
      buildValveSelectionV3NormalizeWorkflow(),
      buildValveSelectionV3CompleteWorkflow(),
      buildValveSelectionV3GenerateCandidatesWorkflow(),
      buildValveSelectionV3ScoreWorkflow(),
      buildValveSelectionV3ProposalWorkflow(),
      buildValveSelectionV3ConfirmWorkflow(),
      buildValveSelectionV3ArchiveWorkflow(),
      buildValveSelectionV3QuickFillWorkflow(),
      buildValveSelectionV3QuickRecommendWorkflow(),
    ],
    outputs: [
      { id: 'example_valve_selection_v3_output_candidates', name: '候选方案', format: 'json', size: 0, createdAt: now },
      { id: 'example_valve_selection_v3_output_proposal', name: '推荐提案', format: 'json', size: 0, createdAt: now },
    ],
  };
}

const configs = [employeeConfig, studentConfig, valveConfig, renewableConfig];
const customProjects = [buildValveSelectionV2Project(), buildValveSelectionV3Project()];

mkdirSync(outputDir, { recursive: true });

for (const config of configs) {
  const project = buildProject(config);
  writeProjectPackage(project);
  const zip = await exportToZip(project);
  writeFileSync(join(outputDir, `${config.id}.zip`), new Uint8Array(await zip.arrayBuffer()));
  console.log(`Generated industry example: ${config.id}`);
}

for (const project of customProjects) {
  writeProjectPackage(project);
  const zip = await exportToZip(project);
  writeFileSync(join(outputDir, `${project.config.id}.zip`), new Uint8Array(await zip.arrayBuffer()));
  console.log(`Generated industry example: ${project.config.id}`);
}
