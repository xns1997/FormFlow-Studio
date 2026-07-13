import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProjectPackage } from '../server/src/services/project-package-store';
import { exportToZip } from '../ui/src/project/packageManager';
import { createDefaultProjectSettings, type ProjectStructure } from '../ui/src/project/types';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectsDir = join(root, 'projects', 'data');
const now = '2026-07-03T00:00:00.000Z';

const salesRows = [
  { 订单号: 'SO-1001', 客户: '华东科技', 金额: 12800, 状态: '待审批' },
  { 订单号: 'SO-1002', 客户: '远航贸易', 金额: 5600, 状态: '已通过' },
  { 订单号: 'SO-1003', 客户: '北辰制造', 金额: 23600, 状态: '待审批' },
];

const project: ProjectStructure = {
  config: {
    id: 'example_sales_approval',
    name: '示例 · 销售订单审批',
    description: 'FormFlow v2 目录式项目包示例，包含数据、流程、表单和行为。',
    version: '2.0.0',
    createdAt: now,
    updatedAt: now,
    author: 'FormFlow Studio',
    tags: ['示例', 'FormFlow v2', '销售审批'],
  },
  settings: { ...createDefaultProjectSettings(), updatedAt: now },
  srcTable: [{
    id: 'sales_orders',
    fileName: '销售订单.json',
    fileSize: JSON.stringify(salesRows).length,
    fileType: 'json',
    uploadedAt: now,
    dataHash: 'example-sales-orders-v2',
    sheets: [{
      name: '销售订单', rowCount: salesRows.length, colCount: 4,
      headers: ['订单号', '客户', '金额', '状态'], columns: [], preview: salesRows,
    }],
  }],
  workflows: [{
    id: 'workflow_high_value_orders',
    name: '筛选高价值待审批订单',
    description: '按表单输入的最低金额筛选销售订单并输出表格。',
    nodes: [
      { id: 'source', specId: 'generic:value-input', position: { x: 80, y: 160 }, data: { propertiesJson: JSON.stringify({ name: 'orders', valueType: 'array', value: salesRows }) } },
      { id: 'filter', specId: 'generic:filter', position: { x: 380, y: 160 }, data: { propertiesJson: JSON.stringify({ field: '金额', operator: '>=', value: 10000 }) } },
      { id: 'display', specId: 'generic:display-table', position: { x: 700, y: 160 }, data: { propertiesJson: '{}' } },
    ],
    edges: [
      { id: 'edge-source-filter', source: 'source', target: 'filter', sourceHandle: 'out:value', targetHandle: 'in:data' },
      { id: 'edge-filter-display', source: 'filter', target: 'display', sourceHandle: 'out:result', targetHandle: 'in:data' },
    ],
    variables: [{ name: 'orders', type: 'array', defaultValue: salesRows }],
    createdAt: now,
    updatedAt: now,
  }],
  behaviors: [{
    id: 'behavior_approval_notice',
    name: '审批提示',
    trigger: { type: 'buttonClick', target: 'runApproval' },
    conditions: [],
    actions: [{ type: 'showMessage', config: { message: '高价值订单筛选已完成', level: 'success' } }],
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }],
  outputs: [{
    id: 'output_approval_list', name: '高价值订单清单', format: 'json', size: 0, createdAt: now,
  }],
  designs: [{
    id: 'form_sales_approval',
    name: '销售审批表单',
    viewport: { zoom: 1, panX: 0, panY: 0 },
    gridSize: 12,
    components: [
      { id: 'form_root', type: 'form', x: 40, y: 40, width: 880, height: 560, zIndex: 0, props: { title: '销售订单审批', subtitle: '筛选需要重点审批的高价值订单' }, children: ['minimum_amount', 'run_approval', 'orders_table'] },
      { id: 'minimum_amount', type: 'number', x: 100, y: 150, width: 280, height: 72, zIndex: 2, parentId: 'form_root', props: { name: 'minimumAmount', label: '最低订单金额', defaultValue: 10000, min: 0 } },
      { id: 'run_approval', type: 'button', x: 100, y: 250, width: 280, height: 52, zIndex: 2, parentId: 'form_root', props: { name: 'runApproval', label: '筛选待审批订单', variant: 'primary', flowTriggers: { onClick: { enabled: true, workflowId: 'workflow_high_value_orders', parameterMap: { orders: salesRows, 'filter.value': '$form.minimumAmount' } } } } },
      { id: 'orders_table', type: 'table', x: 430, y: 140, width: 420, height: 300, zIndex: 2, parentId: 'form_root', props: { name: 'ordersTable', columns: ['订单号', '客户', '金额', '状态'], rows: 3 } },
    ],
    bindings: [],
    createdAt: now,
    updatedAt: now,
  }],
};

mkdirSync(projectsDir, { recursive: true });
for (const entry of readdirSync(projectsDir)) rmSync(join(projectsDir, entry), { recursive: true, force: true });
rmSync(join(root, 'projects', 'example'), { recursive: true, force: true });
writeProjectPackage(project);

const zip = await exportToZip(project);
writeFileSync(join(root, 'projects', 'example_sales_approval.zip'), new Uint8Array(await zip.arrayBuffer()));
console.log(`Generated FormFlow v2 example: ${project.config.id}`);
