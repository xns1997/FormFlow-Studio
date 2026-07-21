import { createHash, randomUUID } from 'node:crypto';
import { runRuleSandbox } from './rule-agent';
import { validateProjectModel, type JsonObject } from './project-authoring';
import { evaluatePropertyExpression } from '../../../ui/src/services/engine/propertyExpression';

export type MockScenario = 'normal' | 'boundary' | 'empty' | 'wrong_type' | 'enum_outside' | 'duplicate_key' | 'not_found' | 'multiple_matches' | 'workflow_failure';

export interface MockGenerationInput {
  tableId: string;
  sheetName: string;
  rowCount?: number;
  seed?: number | string;
  scenarios?: MockScenario[];
}

export function inspectButtonAction(component: any, workflowIds: Set<string>) {
  const events = component?.props?.events;
  const eventEntries = events && typeof events === 'object' && !Array.isArray(events) ? Object.entries(events) : [];
  const executableEvents = eventEntries.filter(([, handler]) => typeof handler === 'string' && handler.trim().length > 0);
  const flowTriggers = component?.props?.flowTriggers;
  const triggerEntries = flowTriggers && typeof flowTriggers === 'object' && !Array.isArray(flowTriggers) ? Object.entries(flowTriggers) : [];
  const enabledTriggers = triggerEntries.filter(([, trigger]) => trigger && typeof trigger === 'object' && (trigger as any).enabled === true);
  const validTriggers = enabledTriggers.filter(([, trigger]) => {
    const workflowId = String((trigger as any).workflowId || '').trim();
    return workflowId.length > 0 && workflowIds.has(workflowId);
  });
  const invalidWorkflowIds = enabledTriggers
    .map(([, trigger]) => String((trigger as any).workflowId || '').trim())
    .filter((workflowId) => workflowId.length > 0 && !workflowIds.has(workflowId));
  const incompleteTriggers = enabledTriggers.length - validTriggers.length - invalidWorkflowIds.length;
  return {
    hasAction: executableEvents.length > 0 || validTriggers.length > 0,
    invalidWorkflowIds: [...new Set(invalidWorkflowIds)],
    incompleteTriggers,
  };
}

function seedNumber(value: number | string | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
  const hash = createHash('sha256').update(String(value ?? 20260715)).digest();
  return hash.readUInt32LE(0);
}

function randomSource(seed: number) {
  let state = seed || 0x9e3779b9;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

const familyNames = ['张', '王', '李', '赵', '陈', '刘', '杨', '黄', '周', '吴'];
const givenNames = ['伟', '芳', '娜', '敏', '静', '磊', '洋', '勇', '艳', '杰'];
const departments = ['技术部', '产品部', '销售部', '运营部', '财务部', '人力资源部'];
const cities = ['上海', '北京', '深圳', '杭州', '成都', '南京', '苏州', '武汉'];
const statuses = ['草稿', '处理中', '已完成'];

function pick<T>(values: T[], random: () => number): T { return values[Math.floor(random() * values.length)]!; }
function columnKind(column: any) {
  const name = String(column.name || '');
  if (/姓名|联系人|负责人/.test(name)) return 'person';
  if (/部门|组织/.test(name)) return 'department';
  if (/城市|地区|地址/.test(name)) return 'city';
  if (/手机|电话/.test(name)) return 'phone';
  if (/邮箱|email/i.test(name)) return 'email';
  if (/状态|阶段/.test(name)) return 'status';
  if (/日期|时间/.test(name) || column.dataType === 'date') return 'date';
  if (/金额|价格|数量|年龄|比例|得分/.test(name) || column.dataType === 'number') return 'number';
  if (column.dataType === 'boolean') return 'boolean';
  if (column.dataType === 'enum') return 'enum';
  return 'text';
}

function valueFor(column: any, rowIndex: number, random: () => number, key: boolean) {
  const name = String(column.name || `字段${rowIndex + 1}`);
  if (key) return `${name.replace(/[^A-Za-z0-9\u4e00-\u9fff]/g, '').slice(0, 8) || 'KEY'}-${String(rowIndex + 1).padStart(5, '0')}`;
  const samples = Array.isArray(column.sampleValues) ? column.sampleValues.filter((item: unknown) => item != null && item !== '') : [];
  switch (columnKind(column)) {
    case 'person': return `${pick(familyNames, random)}${pick(givenNames, random)}`;
    case 'department': return pick(departments, random);
    case 'city': return pick(cities, random);
    case 'phone': return `1${pick(['3', '5', '7', '8', '9'], random)}${String(Math.floor(random() * 1e9)).padStart(9, '0')}`;
    case 'email': return `user${rowIndex + 1}@example.test`;
    case 'status': return samples.length ? pick(samples, random) : pick(statuses, random);
    case 'date': return new Date(Date.UTC(2025 + Math.floor(random() * 2), Math.floor(random() * 12), 1 + Math.floor(random() * 27))).toISOString().slice(0, 10);
    case 'number': return Math.round(random() * 10000) / 100;
    case 'boolean': return random() >= 0.5;
    case 'enum': return samples.length ? pick(samples, random) : `选项${1 + Math.floor(random() * 3)}`;
    default: return samples.length && random() < 0.4 ? pick(samples, random) : `${name}示例${rowIndex + 1}`;
  }
}

function findSheet(project: JsonObject, tableId: string, sheetName: string) {
  const table = (project.srcTable || []).find((item: any) => item.id === tableId);
  if (!table) throw new Error(`数据源 ${tableId} 不存在`);
  const sheet = (table.sheets || []).find((item: any) => item.name === sheetName);
  if (!sheet) throw new Error(`Sheet ${sheetName} 不存在`);
  return { table, sheet };
}

export function profileMockData(project: JsonObject, input: MockGenerationInput) {
  const { sheet } = findSheet(project, input.tableId, input.sheetName);
  const keys = Array.isArray(sheet.config?.keyFields) ? sheet.config.keyFields : [];
  return {
    tableId: input.tableId,
    sheetName: input.sheetName,
    rowCount: sheet.rowCount || sheet.preview?.length || 0,
    keyFields: keys,
    writable: !sheet.config?.readOnly,
    columns: (sheet.columns || []).map((column: any) => ({
      name: column.name,
      dataType: column.dataType,
      nullable: column.nullable,
      generator: columnKind(column),
      samples: (column.sampleValues || []).slice(0, 5),
      key: keys.includes(column.name),
    })),
  };
}

export function generateMockData(project: JsonObject, input: MockGenerationInput) {
  const { sheet } = findSheet(project, input.tableId, input.sheetName);
  const rowCount = Math.min(Math.max(Number(input.rowCount || 20), 1), 1000);
  const seed = seedNumber(input.seed);
  const random = randomSource(seed);
  const keys: string[] = sheet.config?.keyFields || [];
  const existing = new Set((sheet.preview || []).map((row: any) => JSON.stringify(keys.map((key) => row[key]))));
  const rows: JsonObject[] = [];
  let offset = Number(sheet.rowCount || sheet.preview?.length || 0);
  while (rows.length < rowCount) {
    const index = offset + rows.length;
    const row = Object.fromEntries((sheet.columns || []).map((column: any) => [column.name, valueFor(column, index, random, keys.includes(column.name))]));
    const signature = JSON.stringify(keys.map((key) => row[key]));
    if (keys.length && existing.has(signature)) { offset += 1; continue; }
    existing.add(signature); rows.push(row);
  }
  const scenarios = input.scenarios?.length ? input.scenarios : ['normal', 'boundary', 'empty', 'wrong_type', 'enum_outside', 'duplicate_key', 'not_found', 'multiple_matches', 'workflow_failure'];
  const base = structuredClone(rows[0] || {});
  const firstColumn = sheet.columns?.[0];
  const enumColumn = (sheet.columns || []).find((column: any) => column.dataType === 'enum');
  const isolatedCases = scenarios.filter((scenario) => scenario !== 'normal').map((scenario) => {
    const values = structuredClone(base);
    if (scenario === 'empty' && firstColumn) values[firstColumn.name] = '';
    if (scenario === 'wrong_type' && firstColumn) values[firstColumn.name] = { invalid: true };
    if (scenario === 'enum_outside' && enumColumn) values[enumColumn.name] = '__不存在的选项__';
    if (scenario === 'duplicate_key' && keys.length && sheet.preview?.[0]) keys.forEach((key) => { values[key] = sheet.preview[0][key]; });
    if (scenario === 'not_found') keys.forEach((key) => { values[key] = `NOT-FOUND-${seed}`; });
    return { id: `mock-${scenario}`, name: scenario, scenario, values, expectedValid: !['empty', 'wrong_type', 'enum_outside', 'duplicate_key', 'workflow_failure'].includes(scenario) };
  });
  return { id: `mock_${input.tableId}_${input.sheetName}_${seed}`, seed, tableId: input.tableId, sheetName: input.sheetName, rows, isolatedCases, generatedAt: new Date().toISOString(), appendOnly: true };
}

function fieldComponents(form: any) {
  return (form.design?.components || []).filter((item: any) => ['input', 'textarea', 'number', 'datePicker', 'dateRange', 'timePicker', 'switch', 'select', 'checkbox', 'radio', 'rating', 'slider', 'tagInput', 'upload', 'imageUpload'].includes(item.type));
}

function normalFormValue(component: any, index: number) {
  const options = component.props?.options || [];
  if (options.length) return options[0]?.value ?? options[0]?.label;
  if (component.type === 'number' || component.type === 'rating' || component.type === 'slider') return index + 1;
  if (component.type === 'switch') return false;
  if (component.type === 'checkbox' || component.type === 'tagInput') return [];
  if (component.type === 'datePicker') return '2026-07-21';
  if (component.type === 'dateRange') return ['2026-07-01', '2026-07-21'];
  if (component.type === 'timePicker') return '09:30:00';
  if (component.type === 'upload' || component.type === 'imageUpload') return [{ name: `test-${index + 1}.${component.type === 'imageUpload' ? 'png' : 'pdf'}`, size: 1024 }];
  return `测试值${index + 1}`;
}

function requirementStyleCases(project: JsonObject) {
  const allFields = (project.forms || []).flatMap((form: any) => fieldComponents(form).map((component: any) => String(component.fieldBinding || component.props?.name || '')));
  const cases: any[] = [];
  if (allFields.includes('巡检结论') && allFields.includes('工单编号')) cases.push({ id: 'scenario:abnormal-creates-work-order', name: '异常巡检生成工单', category: 'business', assertion: 'abnormal_creates_work_order', expectValid: true });
  if (allFields.includes('设备编号') && allFields.includes('设备名称')) cases.push({ id: 'scenario:device-autofill', name: '设备信息自动带出', category: 'business', assertion: 'lookup_autofill', expectValid: true });
  if (allFields.includes('处理负责人') && allFields.includes('处理结果')) cases.push({ id: 'scenario:assignee-permission', name: '处理负责人权限', category: 'business', assertion: 'identity_permission', expectValid: true });
  if (allFields.includes('实际完成时间') && allFields.includes('创建时间')) cases.push({ id: 'scenario:date-order', name: '完成时间不早于创建时间', category: 'business', assertion: 'date_order', expectValid: true });
  if ((project.forms || []).some((form: any) => (form.design?.components || []).some((component: any) => component.type === 'table'))) cases.push({ id: 'scenario:query-results', name: '查询结果与统计', category: 'business', assertion: 'query_results', expectValid: true });
  if ((project.workflows || []).some((workflow: any) => (workflow.nodes || []).filter((node: any) => node.specId === 'state').length >= 3)) cases.push({ id: 'scenario:workflow-return', name: '状态流转与复核退回', category: 'business', assertion: 'workflow_return', expectValid: true });
  return cases;
}

export function generateProjectTestSuite(project: JsonObject, seed = 20260715) {
  const cases = (project.forms || []).flatMap((form: any) => {
    const fields = fieldComponents(form);
    const normal = Object.fromEntries(fields.map((component: any, index: number) => [component.fieldBinding || component.props?.name, component.props?.defaultValue ?? normalFormValue(component, index)]));
    const required = fields.filter((component: any) => component.props?.required).map((component: any) => component.fieldBinding || component.props?.name);
    return [
      { id: `${form.id}:normal`, formId: form.id, name: '主路径', category: 'normal', values: normal, expectValid: true },
      ...(required.length ? [{ id: `${form.id}:required`, formId: form.id, name: '必填缺失', category: 'required', values: { ...normal, ...Object.fromEntries(required.map((field: string) => [field, ''])) }, expectValid: false }] : []),
    ];
  });
  cases.push(...requirementStyleCases(project));
  return { id: `suite_${seed}`, name: '项目自动回归', seed, cases, createdAt: new Date().toISOString() };
}

function evaluateBusinessAssertion(project: JsonObject, assertion: string) {
  const allBehaviors = (project.forms || []).flatMap((form: any) => form.behaviors || []);
  const ruleCode = (project.forms || []).map((form: any) => String(form.ruleCode || '')).join('\n');
  if (assertion === 'lookup_autofill') {
    const actions = allBehaviors.flatMap((behavior: any) => behavior.actions || []);
    const targets = new Set(actions.filter((action: any) => action.type === 'setValue' && !/["']未知/.test(String(action.expression || ''))).map((action: any) => action.targetField));
    const supported = actions.every((action: any) => !/[A-Za-z0-9_-]+\s*\[[^\]]+=.*\]\s*\./.test(String(action.expression || '')));
    return supported && ['设备名称', '所属区域', '责任人'].every((field) => targets.has(field));
  }
  if (assertion === 'abnormal_creates_work_order') return allBehaviors.some((behavior: any) => /(巡检结论|需要维修)/.test(JSON.stringify(behavior)) && (behavior.actions || []).some((action: any) => ['runWorkflow', 'submitData'].includes(action.type))) && (project.workflows || []).some((workflow: any) => (workflow.nodes || []).some((node: any) => /(write|create|insert|upsert)/i.test(String(node.specId || ''))));
  if (assertion === 'identity_permission') return /(处理负责人|处理人)/.test(ruleCode) && /(\$user|currentUser|user\.|identity|当前用户|用户身份)/i.test(ruleCode);
  if (assertion === 'date_order') return /实际完成时间/.test(ruleCode) && /创建时间/.test(ruleCode) && /(>=|>|before|after|早于|晚于)/.test(ruleCode);
  if (assertion === 'query_results') return (project.forms || []).some((form: any) => { const components = form.design?.components || []; const bindings = form.design?.bindings || []; const table = components.find((component: any) => component.type === 'table'); const button = components.find((component: any) => component.type === 'button' && /(查询|搜索|筛选)/.test(String(component.props?.label || component.props?.name || ''))); return table && button && (table.props?.dataSource || bindings.some((binding: any) => binding.targetId === table.id)) && /query|fetch|request|refreshData|runWorkflow/i.test(JSON.stringify({ events: button.props?.events, flowTriggers: button.props?.flowTriggers })); });
  if (assertion === 'workflow_return') return (project.workflows || []).some((workflow: any) => { const positions = new Map((workflow.nodes || []).map((node: any) => [node.id, Number(node.position?.x || 0)])); return (workflow.edges || []).some((edge: any) => (positions.get(edge.target) || 0) < (positions.get(edge.source) || 0)); });
  return false;
}

export function inspectProjectQuality(project: JsonObject) {
  const validation = validateProjectModel(project);
  const diagnostics: any[] = [...validation.errors.map((item) => ({ severity: 'error', ...item }))];
  for (const table of project.srcTable || []) for (const sheet of table.sheets || []) {
    for (const computed of sheet.config?.computedFields || []) {
      const target = String(computed.target || ''); const expression = String(computed.expression || ''); const tolerance = Math.max(0, Number(computed.tolerance ?? 0.000001));
      if (!target || !expression) { diagnostics.push({ severity: 'error', code: 'INVALID_COMPUTED_FIELD', path: `data.${table.id}.${sheet.name}.config.computedFields`, message: '计算字段必须声明 target 和 expression' }); continue; }
      const mismatches: number[] = []; let expressionError = '';
      for (const [index, row] of (sheet.preview || []).entries()) {
        const evaluated = evaluatePropertyExpression(expression, { form: row, row });
        if (!evaluated.ok) { expressionError = evaluated.error || '表达式无法计算'; break; }
        const expected = Number(evaluated.value); const actual = Number(row[target]);
        if (!Number.isFinite(expected) || !Number.isFinite(actual) || Math.abs(expected - actual) > tolerance) mismatches.push(index);
      }
      if (expressionError) diagnostics.push({ severity: 'error', code: 'INVALID_COMPUTED_EXPRESSION', path: `data.${table.id}.${sheet.name}.config.computedFields.${target}`, message: expressionError });
      else if (mismatches.length) diagnostics.push({ severity: 'error', code: 'COMPUTED_FIELD_MISMATCH', path: `data.${table.id}.${sheet.name}.${target}`, message: `计算字段 ${target} 有 ${mismatches.length} 条预览数据与公式不一致`, rows: mismatches.slice(0, 20) });
    }
  }
  for (const form of project.forms || []) {
    const components = form.design?.components || [];
    const interactive = components.filter((component: any) => component.type !== 'form' && component.type !== 'container');
    if (!interactive.length) diagnostics.push({ severity: 'error', code: 'EMPTY_FORM', path: `forms.${form.id}`, message: '表单只有空容器，没有可录入、查询、展示或执行的控件' });
    const workflowIds = new Set((project.workflows || []).map((item: any) => item.id));
    for (const component of components) {
      const field = component.fieldBinding || component.props?.name;
      if (['input', 'textarea', 'number', 'select', 'datePicker'].includes(component.type) && !field) diagnostics.push({ severity: 'error', code: 'MISSING_FIELD_NAME', path: `forms.${form.id}.${component.id}`, message: '字段控件缺少稳定名称' });
      if (component.type === 'button') {
        const action = inspectButtonAction(component, workflowIds);
        if (!action.hasAction) diagnostics.push({ severity: 'error', code: 'BUTTON_WITHOUT_ACTION', path: `forms.${form.id}.${component.id}`, message: '按钮没有可执行事件或指向现有流程的启用触发器' });
        for (const workflowId of action.invalidWorkflowIds) diagnostics.push({ severity: 'error', code: 'MISSING_WORKFLOW', path: `forms.${form.id}.${component.id}`, message: `流程 ${workflowId} 不存在` });
        if (action.incompleteTriggers > 0) diagnostics.push({ severity: 'error', code: 'INVALID_FLOW_TRIGGER', path: `forms.${form.id}.${component.id}`, message: '启用的流程触发器必须提供 workflowId' });
      }
    }
  }
  const suiteCount = project.testing?.suites?.length || 0;
  const latestRun = project.testing?.runs?.at?.(-1) || project.testing?.runs?.[project.testing?.runs?.length - 1];
  const behaviorCount = (project.globalBehaviors?.length || 0) + (project.sheetBehaviors || []).reduce((total: number, entry: any) => total + (entry.behaviors?.length || 0), 0) + (project.forms || []).reduce((total: number, form: any) => total + (form.behaviors?.length || 0) + (form.ruleCode ? 1 : 0), 0);
  const tasks = [
    { id: 'data', ready: (project.srcTable || []).length > 0 && !diagnostics.some((item) => String(item.code).includes('KEY')), summary: `${project.srcTable?.length || 0} 个数据源` },
    { id: 'forms', ready: (project.forms || []).length > 0 && !diagnostics.some((item) => String(item.path).startsWith('forms.')), summary: `${project.forms?.length || 0} 个表单` },
    { id: 'workflows', ready: (project.workflows || []).every((flow: any) => (flow.nodes || []).length > 0), summary: `${project.workflows?.length || 0} 个流程` },
    { id: 'behaviors', ready: !diagnostics.some((item) => /BEHAVIOR|RULE/.test(String(item.code))), summary: `${behaviorCount} 个全局/Sheet/表单行为或规则` },
    { id: 'tests', ready: Boolean(latestRun?.passed), summary: `${suiteCount} 个测试套件` },
  ];
  const blockers = diagnostics.filter((item) => item.severity === 'error').map((item) => item.message);
  if (!(project.srcTable || []).length) blockers.push('项目尚未配置数据源');
  if (!(project.forms || []).length) blockers.push('项目尚未配置表单');
  if (!latestRun?.passed) blockers.push('项目尚未通过最近一次回归测试');
  return { ready: blockers.length === 0, validation, diagnostics, tasks, blockers, latestRun };
}

export function runProjectTests(project: JsonObject, suite?: any) {
  const activeSuite = suite || project.testing?.suites?.at?.(-1) || generateProjectTestSuite(project);
  const validation = validateProjectModel(project);
  const results = (activeSuite.cases || []).map((testCase: any) => {
    if (testCase.category === 'business' && testCase.assertion) { const actualValid = evaluateBusinessAssertion(project, testCase.assertion); return { ...testCase, passed: actualValid === testCase.expectValid, actualValid, errors: actualValid ? [] : [`业务断言未获得可执行证据：${testCase.assertion}`], evidenceKind: 'scenario_result' }; }
    const form = (project.forms || []).find((item: any) => item.id === testCase.formId);
    if (!form) return { ...testCase, passed: false, errors: ['表单不存在'] };
    const errors: string[] = [];
    for (const component of fieldComponents(form)) {
      const field = component.fieldBinding || component.props?.name;
      const value = testCase.values?.[field];
      if (component.props?.required && (value == null || value === '' || (Array.isArray(value) && !value.length))) errors.push(`${field} 为必填项`);
    }
    const actualValid = errors.length === 0;
    return { ...testCase, passed: actualValid === testCase.expectValid, actualValid, errors };
  });
  const ruleResults = (project.forms || []).filter((form: any) => form.ruleCode).map((form: any) => {
    try { return { formId: form.id, ...runRuleSandbox(project.config.id, form.id, form.ruleCode) }; }
    catch (error) { return { formId: form.id, passed: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  const passed = validation.valid && results.every((item: any) => item.passed) && ruleResults.every((item: any) => item.passed);
  return { id: `run_${randomUUID()}`, suiteId: activeSuite.id, passed, coverage: results.length ? Math.round(results.filter((item: any) => item.passed).length / results.length * 100) : 0, validation, results, ruleResults, mockedEffects: ['数据写回', '外部 API', '流程副作用'], ranAt: new Date().toISOString() };
}
