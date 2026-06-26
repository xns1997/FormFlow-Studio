import { executeFlow, type FlowNodeDef, type FlowEdgeDef } from './src/services/flowEngine';
import { loadNodeRegistry } from './nodes/registry';
import type { SrcTableEntry } from './src/project/types';

const testTable: SrcTableEntry = {
  id: 'test', fileName: 'test.csv', fileSize: 512, fileType: 'csv',
  uploadedAt: new Date().toISOString(), dataHash: 'test',
  sheets: [{
    name: 'Sheet1', rowCount: 3, colCount: 3,
    headers: ['姓名', '年龄', '部门'],
    columns: [],
    preview: [
      { '姓名': '张三', '年龄': 28, '部门': '技术部' },
      { '姓名': '李四', '年龄': 35, '部门': '市场部' },
      { '姓名': '王五', '年龄': 42, '部门': '技术部' },
    ],
  }],
};

const tables = [testTable];
let passed = 0, failed = 0;
const failures: string[] = [];

function node(id: string, specId: string, props: Record<string, unknown> = {}): FlowNodeDef {
  return { id, specId, position: { x: 0, y: 0 }, data: { propertiesJson: JSON.stringify(props) } };
}
function edge(s: string, t: string, sh: string, th: string): FlowEdgeDef {
  return { id: `e-${s}-${t}`, source: s, target: t, sourceHandle: sh, targetHandle: th };
}

// 数据源节点组
const dataSrc: FlowNodeDef[] = [
  node('ws', 'generic:worksheet-select', { sheetName: 'Sheet1' }),
  node('s2j', 'method:XLSX.utils.sheet_to_json'),
  node('json_out', 'generic:output-display'),
];
const dataEdges: FlowEdgeDef[] = [
  edge('ws', 's2j', 'out:worksheet', 'in:worksheet'),
];

async function runTest(name: string, extraNodes: FlowNodeDef[], extraEdges: FlowEdgeDef[]) {
  const allNodes = [...dataSrc, ...extraNodes];
  const allEdges = [...dataEdges, ...extraEdges];
  try {
    const result = await executeFlow(allNodes, allEdges, tables);
    // 找到最后一个额外节点的结果
    const lastNode = extraNodes[extraNodes.length - 1];
    const nr = result.nodeResults.get(lastNode.id);
    if (nr?.success) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.log(`  ✗ ${name}: ${nr?.error || '无输出'}`);
      failures.push(`${name}: ${nr?.error}`);
      failed++;
    }
  } catch (e) {
    console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`);
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}

async function main() {
  console.log('=== 全节点入参测试 ===\n');
  await loadNodeRegistry();

  // ── Generic 节点 (自包含，无前置依赖) ──
  console.log('--- Generic ---');
  for (const [name, specId, props] of [
    ['文件选择器', 'generic:file-picker', {}],
    ['工作表选择器', 'generic:worksheet-select', { sheetName: 'Sheet1' }],
    ['区域选择器', 'generic:range-select', { address: 'A1:C3' }],
    ['变量输入', 'generic:variable-input', { varName: 'x', varValue: 'hello' }],
    ['文本输入', 'generic:text-input', { value: 'test' }],
    ['数字输入', 'generic:number-input', { value: 42 }],
    ['布尔开关', 'generic:boolean-switch', { value: true }],
    ['输出显示', 'generic:output-display', {}],
  ] as const) {
    await runTest(name, [node('t', specId, props)], []);
  }

  // ── Behavior 触发器节点 (需要 trigger 前置) ──
  console.log('\n--- Behavior 触发器 ---');
  const triggerSrc: FlowNodeDef[] = [node('trig', 'behavior-on-form-load')];
  const triggerEdge = edge('s2j', 'trig', 'out:rows', 'in:data');

  for (const [name, specId, props] of [
    ['表单加载', 'behavior-on-form-load', {}],
    ['字段变化', 'behavior-on-field-change', { fieldName: '姓名' }],
    ['提交触发', 'behavior-on-submit', {}],
    ['校验触发', 'behavior-on-validate', {}],
    ['按钮点击', 'behavior-on-button-click', { buttonName: 'btn' }],
    ['行加载', 'behavior-on-row-load', {}],
  ] as const) {
    await runTest(name, [node('t', specId, props)], [triggerEdge]);
  }

  // ── Behavior 动作节点 (需要 data 前置) ──
  console.log('\n--- Behavior 动作 ---');
  const dataEdge = edge('s2j', 't', 'out:rows', 'in:data');

  for (const [name, specId, props] of [
    ['条件判断', 'behavior-condition', { fieldName: '年龄', operator: '>', value: 30 }],
    ['赋值', 'behavior-set-value', { fieldName: '姓名', valueType: 'static', staticValue: '新值' }],
    ['设为可见', 'behavior-set-visible', { componentId: 'c1' }],
    ['设为禁用', 'behavior-set-disabled', { componentId: 'c1' }],
    ['设为必填', 'behavior-set-required', { fieldName: '姓名' }],
    ['计算', 'behavior-calculate', { expression: '1+1', targetField: 'result' }],
    ['显示消息', 'behavior-show-message', { message: 'hello' }],
    ['校验', 'behavior-validate', { fieldName: '姓名' }],
    ['提交', 'behavior-submit', {}],
    ['API请求', 'behavior-api-request', { url: 'https://api.test.com' }],
    ['JS脚本', 'behavior-js-script', { code: 'return 42;' }],
    ['循环', 'behavior-loop', { count: 3 }],
    ['数据查询', 'behavior-data-query', { sheetName: 'Sheet1' }],
    ['切换标签', 'behavior-switch-tab', { tabName: 't1' }],
    ['刷新数据', 'behavior-refresh-data', {}],
    ['日志', 'behavior-log', { message: 'test' }],
    ['延时', 'behavior-delay', { ms: 10 }],
    ['清空字段', 'behavior-clear-field', { fieldName: '姓名' }],
    ['停止', 'behavior-stop', {}],
    ['筛选数据', 'behavior-filter-data', { fieldName: '部门', operator: '==', value: '技术部' }],
    ['排序数据', 'behavior-sort-data', { fieldName: '年龄', order: 'desc' }],
  ] as const) {
    await runTest(name, [node('t', specId, props)], [dataEdge]);
  }

  // ── Func 节点 (需要 worksheet 前置) ──
  console.log('\n--- Func (worksheet) ---');
  const wsEdge = edge('ws', 't', 'out:worksheet', 'in:worksheet');

  for (const [name, specId, props] of [
    ['区域选择', 'func-range-select', { address: 'A1:C3' }],
    ['样式', 'func-style', {}],
    ['应用样式', 'func-apply-style', {}],
    ['条件格式', 'func-conditional-format', {}],
    ['数据校验', 'func-data-validation', {}],
    ['添加批注', 'func-add-comment', {}],
    ['命名项', 'func-named-item', {}],
    ['保护工作表', 'func-protect-sheet', {}],
    ['合并单元格', 'func-merge-cells', {}],
    ['复制区域', 'func-copy-range', {}],
    ['导出工作表', 'func-export-sheet', { format: 'xlsx' }],
    ['保护工作簿', 'func-protect-workbook', {}],
  ] as const) {
    await runTest(name, [node('t', specId, props)], [wsEdge]);
  }

  // ── Func 节点 (需要 data 前置) ──
  console.log('\n--- Func (data) ---');

  for (const [name, specId, props] of [
    ['字段绑定', 'func-column-bind', { dataField: '姓名', direction: 'twoWay' }],
    ['行导航', 'func-row-navigator', {}],
    ['排序表格', 'func-sort-table', { column: '年龄', order: 'desc' }],
    ['筛选表格', 'func-filter-table', { column: '部门', value: '技术部' }],
    ['查找替换', 'func-find-replace', { find: '张三', replace: '李四' }],
    ['去重', 'func-remove-duplicates', {}],
  ] as const) {
    await runTest(name, [node('t', specId, props)], [dataEdge]);
  }

  // ── Func 自包含节点 ──
  console.log('\n--- Func (self-contained) ---');

  for (const [name, specId, props] of [
    ['表单校验', 'func-form-validate', {}],
    ['表单提交', 'func-form-submit', {}],
    ['下拉选择', 'func-select-input', { options: [{ label: 'A', value: 'a' }] }],
    ['单选', 'func-radio-input', { options: [{ label: 'A', value: 'a' }] }],
    ['多选', 'func-checkbox-input', { options: [{ label: 'A', value: 'a' }] }],
    ['日期输入', 'func-date-input', {}],
    ['开关', 'func-switch-input', {}],
    ['评分', 'func-rating-input', {}],
  ] as const) {
    await runTest(name, [node('t', specId, props)], []);
  }

  // ── Func workbook 节点 ──
  console.log('\n--- Func (workbook) ---');
  // 需要先创建 workbook
  const wbNodes: FlowNodeDef[] = [
    node('wb_new', 'method:XLSX.utils.book_new'),
    node('wb_append', 'method:XLSX.utils.book_append_sheet'),
    node('t', 'func-sheet-operation', { operation: 'create', sheetName: 'New' }),
  ];
  const wbEdges: FlowEdgeDef[] = [
    edge('ws', 'wb_append', 'out:worksheet', 'in:worksheet'),
    edge('wb_new', 'wb_append', 'out:result', 'in:workbook'),
    edge('wb_append', 't', 'out:result', 'in:workbook'),
  ];
  await runTest('创建工作表', wbNodes, wbEdges);

  // ── Scenario 节点 ──
  console.log('\n--- Scenario ---');
  await runTest('追加行', [
    node('t', 'scenario:append-rows'),
  ], [wsEdge]);

  await runTest('工作表预览', [
    node('t', 'scenario:sheet-preview'),
  ], [wsEdge]);

  await runTest('地址工具', [
    node('t', 'scenario:cell-address-toolkit'),
  ], []);

  // ── XLSX Method 节点 (需要 worksheet 前置) ──
  console.log('\n--- XLSX Method (worksheet) ---');
  for (const [name, methodName] of [
    ['Sheet转JSON', 'XLSX.utils.sheet_to_json'],
    ['Sheet转CSV', 'XLSX.utils.sheet_to_csv'],
    ['Sheet转AOA', 'XLSX.utils.sheet_to_aoa'],
    ['Sheet转HTML', 'XLSX.utils.sheet_to_html'],
    ['Sheet转公式', 'XLSX.utils.sheet_to_formulae'],
    ['Sheet转行对象', 'XLSX.utils.sheet_to_row_object_array'],
    ['获取单元格', 'XLSX.utils.sheet_get_cell'],
    ['编码单元格', 'XLSX.utils.encode_cell'],
    ['编码列', 'XLSX.utils.encode_col'],
    ['编码行', 'XLSX.utils.encode_row'],
  ] as const) {
    await runTest(name, [node('t', `method:${methodName}`)], [wsEdge]);
  }

  // ── XLSX Method (address 输入) ──
  console.log('\n--- XLSX Method (address) ---');
  for (const [name, methodName, props] of [
    ['解码单元格', 'XLSX.utils.decode_cell', {}],
    ['解码列', 'XLSX.utils.decode_col', {}],
    ['解码行', 'XLSX.utils.decode_row', {}],
  ] as const) {
    // 这些节点通过 _args 传参
    await runTest(name, [node('t', `method:${methodName}`, { _args: methodName.includes('cell') ? 'A1' : methodName.includes('col') ? 'A' : '1' })], []);
  }

  // ── 汇总 ──
  console.log('\n=== 汇总 ===');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`总计: ${passed + failed}`);
  console.log(`通过率: ${(passed / (passed + failed) * 100).toFixed(1)}%`);

  if (failures.length > 0) {
    console.log('\n失败项:');
    failures.forEach(f => console.log(`  ✗ ${f}`));
  }
}

main().catch(console.error);
