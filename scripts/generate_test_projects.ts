import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DesignComponent, DesignFile, ProjectStructure, SrcTableEntry, WorkflowFile } from '../ui/src/project/types';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectsDir = join(root, 'projects', 'data');
const now = '2026-06-30T08:00:00.000Z';

type Row = Record<string, unknown>;

function table(id: string, fileName: string, sheetName: string, rows: Row[]): SrcTableEntry {
  const headers = Object.keys(rows[0] || {});
  return {
    id,
    fileName,
    fileSize: JSON.stringify(rows).length,
    fileType: 'json',
    uploadedAt: now,
    dataHash: `test-${id}`,
    sheets: [{
      name: sheetName,
      rowCount: rows.length,
      colCount: headers.length,
      headers,
      columns: headers.map((name, index) => {
        const values = rows.map((row) => row[name]);
        const sample = values.find((value) => value !== null && value !== undefined);
        return {
          name,
          index,
          dataType: typeof sample === 'number' ? 'number' : typeof sample === 'boolean' ? 'boolean' : 'string',
          nullable: values.some((value) => value == null),
          uniqueCount: new Set(values.map(String)).size,
          sampleValues: values.slice(0, 5),
        };
      }),
      preview: rows,
    }],
  };
}

function node(id: string, specId: string, x: number, y: number, properties: Row = {}): WorkflowFile['nodes'][number] {
  return { id, type: 'formflow', specId, position: { x, y }, data: { specId, propertiesJson: JSON.stringify(properties), connectedPortsJson: '[]' } };
}

function edge(id: string, source: string, sourcePort: string, target: string, targetPort: string): WorkflowFile['edges'][number] {
  return { id, source, target, sourceHandle: `out:${sourcePort}`, targetHandle: `in:${targetPort}` };
}

function workflow(id: string, name: string, description: string, nodes: WorkflowFile['nodes'], edges: WorkflowFile['edges']): WorkflowFile {
  return { id, name, description, nodes, edges, createdAt: now, updatedAt: now };
}

let componentSequence = 0;
function component(type: string, x: number, y: number, width: number, height: number, props: Row, parentId = 'form_root'): DesignComponent {
  componentSequence += 1;
  return { id: `${type}_${componentSequence}`, type, x, y, width, height, props, parentId, zIndex: parentId ? 2 : 0 };
}

function formComponent(title: string, subtitle: string): DesignComponent {
  return {
    id: 'form_root', type: 'form', x: 40, y: 40, width: 900, height: 650, zIndex: 0,
    props: { title, subtitle, background: '#f2f2f7', padding: 20, showFooter: false },
    children: [],
  };
}

function design(id: string, name: string, components: DesignComponent[]): DesignFile {
  const rootForm = components.find((item) => item.id === 'form_root');
  if (rootForm) rootForm.children = components.filter((item) => item.parentId === rootForm.id).map((item) => item.id);
  return { id, name, viewport: { zoom: 1, panX: 0, panY: 0 }, gridSize: 12, components, bindings: [], createdAt: now, updatedAt: now };
}

function project(id: string, name: string, description: string, source: SrcTableEntry, flow: WorkflowFile, form: DesignFile): ProjectStructure {
  return {
    config: { id, name, description, version: '1.0.0', createdAt: now, updatedAt: now, author: 'FormFlow QA', tags: ['回归测试', '可运行案例'] },
    srcTable: [source], workflows: [flow], behaviors: [], outputs: [], designs: [form],
  };
}

const salesRows = [
  { 订单号: 'SO-001', 产品: '笔记本', 地区: '华东', 金额: 6800, 数量: 2 },
  { 订单号: 'SO-002', 产品: '显示器', 地区: '华南', 金额: 2400, 数量: 3 },
  { 订单号: 'SO-003', 产品: '笔记本', 地区: '华北', 金额: 9200, 数量: 3 },
  { 订单号: 'SO-004', 产品: '键盘', 地区: '华东', 金额: 680, 数量: 8 },
  { 订单号: 'SO-005', 产品: '显示器', 地区: '华北', 金额: 3200, 数量: 4 },
];
const dataWorkflow = workflow('wf_data_processing', '销售数据清洗与聚合', '按表单阈值筛选、排序并按产品汇总销售额', [
  node('rows', 'generic:variable-input', 40, 180, { varName: 'rows', varType: 'array', varValue: salesRows }),
  node('filter', 'generic:filter', 300, 180, { field: '金额', operator: '>=', value: 1000 }),
  node('sort', 'generic:sort', 540, 180, { field: '金额', order: 'desc' }),
  node('group', 'generic:group-by', 780, 180, { groupByField: '产品', aggField: '金额', aggFunc: 'sum' }),
  node('display', 'generic:display-table', 1020, 180),
], [
  edge('d1', 'rows', 'value', 'filter', 'data'), edge('d2', 'filter', 'result', 'sort', 'data'),
  edge('d3', 'sort', 'result', 'group', 'data'), edge('d4', 'group', 'data', 'display', 'data'),
]);
componentSequence = 0;
const dataDesign = design('design_data_processing', '销售数据处理表单', [
  formComponent('销售数据处理', '输入最低金额并执行筛选、排序和产品聚合'),
  component('number', 100, 150, 260, 72, { label: '最低订单金额', name: 'minAmount', defaultValue: 1000, min: 0, step: 100 }),
  component('button', 100, 250, 300, 52, {
    label: '执行数据处理', name: 'runDataProcessing', variant: 'primary',
    flowTriggers: { onClick: { enabled: true, workflowId: dataWorkflow.id, parameterMap: { rows: salesRows, 'filter.value': '$form.minAmount' } } },
  }),
  component('table', 440, 140, 430, 260, { name: 'salesPreview', columns: ['订单号', '产品', '地区', '金额', '数量'], rows: 5 }),
  component('text', 100, 340, 700, 60, { content: '结果链路：筛选 → 金额降序 → 产品汇总 → 表格输出', fontSize: 15, color: '#248a3d' }),
]);

const regressionRows = [
  { 广告投入: 10, 销售额: 30 }, { 广告投入: 20, 销售额: 50 }, { 广告投入: 30, 销售额: 70 },
  { 广告投入: 40, 销售额: 90 }, { 广告投入: 50, 销售额: 110 }, { 广告投入: 60, 销售额: 130 },
];
const regressionWorkflow = workflow('wf_regression', '广告投入线性回归', '计算斜率、截距、R² 和样本预测值', [
  node('rows', 'generic:variable-input', 60, 200, { varName: 'rows', varType: 'array', varValue: regressionRows }),
  node('regression', 'ml:linear-regression', 360, 200, { x_field: '广告投入', y_field: '销售额' }),
  node('slope', 'generic:output-display', 700, 80),
  node('r2', 'generic:output-display', 700, 260),
  node('predictions', 'generic:output-display', 700, 440),
], [
  edge('r1', 'rows', 'value', 'regression', 'data'), edge('r2', 'regression', 'slope', 'slope', 'value'),
  edge('r3', 'regression', 'r2', 'r2', 'value'), edge('r4', 'regression', 'predictions', 'predictions', 'value'),
]);
componentSequence = 0;
const regressionDesign = design('design_regression', '回归分析表单', [
  formComponent('广告投入回归分析', '基于历史投入与销售额拟合线性模型'),
  component('button', 100, 150, 300, 52, {
    label: '运行线性回归', name: 'runRegression',
    flowTriggers: { onClick: { enabled: true, workflowId: regressionWorkflow.id, parameterMap: { rows: regressionRows } } },
  }),
  component('chart', 440, 130, 420, 300, {
    name: 'regressionChart', title: '广告投入与销售额', chartType: 'line',
    chartData: {
      labels: regressionRows.map((row) => String(row.广告投入)),
      datasets: [{ label: '销售额', data: regressionRows.map((row) => row.销售额) }],
    },
    showValues: true,
  }),
  component('text', 100, 250, 300, 100, { content: '预期模型：销售额 = 2 × 广告投入 + 10，R² = 1', fontSize: 16, lineHeight: 1.6 }),
]);

const chartRows = [
  { 月份: '1月', 品类: '软件', 销售额: 120 }, { 月份: '2月', 品类: '软件', 销售额: 180 },
  { 月份: '3月', 品类: '软件', 销售额: 160 }, { 月份: '4月', 品类: '软件', 销售额: 240 },
  { 月份: '5月', 品类: '软件', 销售额: 300 }, { 月份: '6月', 品类: '软件', 销售额: 360 },
];
const chartWorkflow = workflow('wf_chart', '月度销售图表绘制', '将月度销售数据写入工作表并创建折线图配置', [
  node('rows', 'generic:variable-input', 60, 200, { varName: 'rows', varType: 'array', varValue: chartRows }),
  node('worksheet', 'method:XLSX.utils.json_to_sheet', 340, 200),
  node('chart', 'func-create-chart', 640, 200, { chartType: 'line', title: '上半年销售趋势', dataRange: 'A1:C7', width: 640, height: 360 }),
  node('chartName', 'generic:output-display', 940, 200),
], [
  edge('c1', 'rows', 'value', 'worksheet', 'data'), edge('c2', 'worksheet', 'worksheet', 'chart', 'worksheet'),
  edge('c3', 'chart', 'chartName', 'chartName', 'value'),
]);
componentSequence = 0;
const chartDesign = design('design_chart', '图表绘制表单', [
  formComponent('月度销售图表', '运行流程创建工作表图表，同时在表单内展示可交互图表'),
  component('button', 100, 150, 280, 52, {
    label: '生成销售趋势图', name: 'drawChart',
    flowTriggers: { onClick: { enabled: true, workflowId: chartWorkflow.id, parameterMap: { rows: chartRows } } },
  }),
  component('chart', 420, 120, 450, 340, {
    name: 'salesChart', title: '上半年销售趋势', chartType: 'line',
    chartData: {
      labels: chartRows.map((row) => String(row.月份)),
      datasets: [{ label: '销售额', data: chartRows.map((row) => row.销售额) }],
    },
    showValues: true, showLegend: false,
  }),
  component('text', 100, 260, 280, 100, { content: '流程输出包含带图表配置的工作表与图表名称。', fontSize: 15, lineHeight: 1.6 }),
]);

const employeeRows = [{ 员工编号: 'E-1001', 姓名: '林晓', 部门: '研发部', 职级: 'P5', 在职: true }];
const infoWorkflow = workflow('wf_information', '员工信息录入与修改', '比较原始信息与表单信息并生成字段级变更记录', [
  node('formData', 'generic:variable-input', 60, 100, { varName: 'formData', varType: 'object', varValue: {} }),
  node('originalData', 'generic:variable-input', 60, 320, { varName: 'originalData', varType: 'object', varValue: {} }),
  node('submit', 'behavior:submit', 440, 200, {
    target: 'changeLog', validateFirst: true,
    writeBackMode: 'upsert', writeBackTableId: 'employee', writeBackSheetName: '员工档案',
    writeBackKeyField: '员工编号', writeBackKeyFormField: 'employeeId',
    writeBackFieldMap: { employeeId: '员工编号', name: '姓名', department: '部门', level: '职级', active: '在职' },
  }),
  node('changes', 'generic:output-display', 780, 200),
], [
  edge('i1', 'formData', 'value', 'submit', 'formData'), edge('i2', 'originalData', 'value', 'submit', 'originalData'),
  edge('i3', 'submit', 'changeLog', 'changes', 'value'),
]);
componentSequence = 0;
const employeeBinding = (column: string) => ({ tableId: 'employee', sheetName: '员工档案', keyField: '员工编号', keyValue: 'E-1001', column });
const infoDesign = design('design_information', '员工信息录入修改表单', [
  formComponent('员工信息维护', '录入新信息或修改现有员工，提交后生成变更记录'),
  component('input', 100, 140, 300, 72, { label: '员工编号', name: 'employeeId', defaultValue: 'E-1001', readonly: true, tableBinding: employeeBinding('员工编号') }),
  component('input', 100, 230, 300, 72, { label: '姓名', name: 'name', defaultValue: '林晓', required: true, tableBinding: employeeBinding('姓名') }),
  component('select', 100, 320, 300, 72, { label: '部门', name: 'department', defaultValue: '研发部', options: ['研发部', '产品部', '市场部'], tableBinding: employeeBinding('部门') }),
  component('select', 460, 140, 300, 72, { label: '职级', name: 'level', defaultValue: 'P5', options: ['P4', 'P5', 'P6'], tableBinding: employeeBinding('职级') }),
  component('switch', 460, 240, 300, 52, { label: '在职状态', name: 'active', defaultValue: true, tableBinding: employeeBinding('在职') }),
  component('button', 460, 330, 300, 52, {
    label: '保存员工信息', name: 'saveEmployee',
    flowTriggers: { onClick: { enabled: true, workflowId: infoWorkflow.id, parameterMap: { formData: '$values', originalData: '$originalValues', 'submit.trigger': '$event' } } },
  }),
]);

const projects: ProjectStructure[] = [
  project('case_data_processing', '测试用例 1 · 数据处理', '销售数据动态筛选、排序和分组聚合', table('sales', '销售订单.json', '销售订单', salesRows), dataWorkflow, dataDesign),
  project('case_regression', '测试用例 2 · 回归分析', '广告投入与销售额线性回归', table('regression', '广告销售.json', '回归样本', regressionRows), regressionWorkflow, regressionDesign),
  project('case_chart', '测试用例 3 · 图表绘制', '月度销售趋势 SVG 与交互图表', table('chart', '月度销售.json', '月度销售', chartRows), chartWorkflow, chartDesign),
  project('case_information', '测试用例 4 · 信息录入与修改', '员工信息录入、修改和变更记录', table('employee', '员工档案.json', '员工档案', employeeRows), infoWorkflow, infoDesign),
];

mkdirSync(projectsDir, { recursive: true });
for (const file of readdirSync(projectsDir)) {
  if (file.endsWith('.json')) rmSync(join(projectsDir, file));
}
for (const item of projects) {
  writeFileSync(join(projectsDir, `${item.config.id}.json`), `${JSON.stringify(item, null, 2)}\n`);
}
console.log(`Generated ${projects.length} runnable projects: ${projects.map((item) => item.config.id).join(', ')}`);
