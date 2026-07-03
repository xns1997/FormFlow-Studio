import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ComponentNode } from '../models';
import type { DesignComponent, ProjectStructure } from '../project/types';
import { exportToComponentNodes } from '../designer/export';
import { executeDesignPreviewEvent } from './designPreviewRuntime';
import { executeFormFlowTrigger, type FormFlowTriggerConfig } from './formFlowTrigger';
import { collectFlowSideEffects } from './flowSideEffects';
import { applyPreviewFlowSideEffects, applyProjectWriteBacks } from './projectWriteBack';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const projectsDir = join(dirname(root), 'projects', 'data');

function loadProject(id: string): ProjectStructure {
  return JSON.parse(readFileSync(join(projectsDir, `${id}.json`), 'utf8')) as ProjectStructure;
}

function findComponent(project: ProjectStructure, name: string): ComponentNode {
  const components = exportToComponentNodes(project.designs[0].components);
  const component = components.find((item) => item.name === name);
  assert.ok(component, `${project.config.id} 缺少表单控件: ${name}`);
  return component;
}

function findDesignComponent(project: ProjectStructure, name: string): DesignComponent {
  const component = project.designs[0].components.find((item) => String(item.props.name || '') === name);
  assert.ok(component, `${project.config.id} 缺少设计态控件: ${name}`);
  return component;
}

async function runButton(
  project: ProjectStructure,
  componentName: string,
  values: Record<string, unknown>,
  originalValues: Record<string, unknown> = values,
) {
  const component = findComponent(project, componentName);
  const config = (component.props.flowTriggers as Record<string, FormFlowTriggerConfig>)?.onClick;
  assert.equal(config?.enabled, true, `${componentName} 未启用 onClick 流程`);
  const workflow = project.workflows.find((item) => item.id === config.workflowId);
  assert.ok(workflow, `${componentName} 绑定的流程不存在`);
  return executeFormFlowTrigger(workflow, config, {
    eventName: 'onClick', field: component.name, value: undefined, values, originalValues, component,
  }, project.srcTable);
}

test('project storage contains exactly five purpose-built runnable cases', () => {
  const ids = readdirSync(projectsDir).filter((file) => file.endsWith('.json')).map((file) => file.replace(/\.json$/, '')).sort();
  assert.deepEqual(ids, ['case_chart', 'case_data_processing', 'case_information', 'case_product_lookup_edit', 'case_regression']);
  for (const id of ids) {
    const project = loadProject(id);
    assert.equal(project.srcTable.length > 0, true, `${id} 缺少数据源`);
    assert.equal(project.workflows.length > 0, true, `${id} 缺少流程`);
    assert.equal(project.designs.length > 0, true, `${id} 缺少表单设计`);
    assert.equal(project.designs[0].components.some((component) => component.type === 'form'), true, `${id} 缺少表单窗体`);
    for (const chart of project.designs[0].components.filter((component) => component.type === 'chart')) {
      const chartData = chart.props.chartData;
      assert.equal(Array.isArray(chartData?.labels), true, `${id}.${chart.id} 图表缺少 labels`);
      assert.equal(Array.isArray(chartData?.datasets), true, `${id}.${chart.id} 图表缺少 datasets`);
      assert.equal(chartData.datasets.every((dataset: any) => Array.isArray(dataset.data)), true, `${id}.${chart.id} 图表数据集无效`);
    }
  }
});

test('data-processing case filters by form threshold, sorts and groups sales rows', async () => {
  const project = loadProject('case_data_processing');
  const result = await runButton(project, 'runDataProcessing', { minAmount: 2000 });
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.deepEqual(result.nodeResults.get('group')?.outputs.data, [
    { 产品: '笔记本', sum_金额: 16000 },
    { 产品: '显示器', sum_金额: 5600 },
  ]);
  assert.equal(result.nodeResults.get('display')?.outputs.rowCount, 2);
});

test('regression case calculates a deterministic local linear model end to end', async () => {
  const project = loadProject('case_regression');
  const result = await runButton(project, 'runRegression', {});
  assert.equal(result.success, true, result.errors.join('\n'));
  const outputs = result.nodeResults.get('regression')?.outputs;
  assert.equal(outputs?.slope, 2);
  assert.equal(outputs?.intercept, 10);
  assert.equal(outputs?.r2, 1);
  assert.deepEqual(outputs?.predictions, [30, 50, 70, 90, 110, 130]);
});

test('chart case creates a worksheet chart and exposes its chart name', async () => {
  const project = loadProject('case_chart');
  const result = await runButton(project, 'drawChart', {});
  assert.equal(result.success, true, result.errors.join('\n'));
  const outputs = result.nodeResults.get('chart')?.outputs;
  assert.equal(outputs?.chartName, 'Chart1');
  assert.deepEqual((outputs?.worksheet as any)?.['!charts'], [{
    name: 'Chart1', type: 'line', dataRange: 'A1:C7', title: '上半年销售趋势', width: 640, height: 360,
  }]);
  assert.equal(result.nodeResults.get('chartName')?.outputs.value, 'Chart1');
});

test('information case records field-level edits against original form values', async () => {
  const project = loadProject('case_information');
  const original = { employeeId: 'E-1001', name: '林晓', department: '研发部', level: 'P5', active: true };
  const edited = { ...original, name: '林晓云', department: '产品部', level: 'P6' };
  const result = await runButton(project, 'saveEmployee', edited, original);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.deepEqual(result.nodeResults.get('submit')?.outputs.changeLog, {
    name: { oldValue: '林晓', newValue: '林晓云' },
    department: { oldValue: '研发部', newValue: '产品部' },
    level: { oldValue: 'P5', newValue: 'P6' },
  });
  assert.equal((result.nodeResults.get('submit')?.outputs.success as Record<string, unknown>).trigger, 'onClick');
  const written = applyProjectWriteBacks(project, result);
  assert.equal(written.applied, 1);
  assert.deepEqual(written.project.srcTable[0].sheets[0].preview[0], {
    员工编号: 'E-1001', 姓名: '林晓云', 部门: '产品部', 职级: 'P6', 在职: true,
  });
});

test('product lookup case fills the edit form after a successful find', async () => {
  const project = loadProject('case_product_lookup_edit');
  const initial = {
    lookupProductId: 'P-1001',
    lookupProductName: '无线鼠标',
    productId: '',
    productName: '',
    productCategory: '',
    productPrice: '',
    productStatus: '',
    loadedProductId: '',
    originalProductId: '',
    originalProductName: '',
    originalProductCategory: '',
    originalProductPrice: '',
    originalProductStatus: '',
  };
  const result = await runButton(project, 'findProduct', initial);
  assert.equal(result.success, true, result.errors.join('\n'));
  const effectResult = applyPreviewFlowSideEffects(project, collectFlowSideEffects(result));
  assert.equal(effectResult.applied, 0);
  assert.deepEqual(effectResult.formValuePatches, {
    productId: 'P-1001',
    productName: '无线鼠标',
    productCategory: '外设',
    productPrice: 8,
    productStatus: '上架',
    originalProductId: 'P-1001',
    originalProductName: '无线鼠标',
    originalProductCategory: '外设',
    originalProductPrice: 8,
    originalProductStatus: '上架',
    loadedProductId: 'P-1001',
  });
  assert.deepEqual(effectResult.componentDisabledPatches, { button_save_product: false });
  assert.equal(effectResult.messages.at(-1)?.message, '已加载商品，可修改后保存');
});

test('product lookup case does not overwrite edit fields when the lookup fails', async () => {
  const project = loadProject('case_product_lookup_edit');
  const initial = {
    lookupProductId: 'P-1001',
    lookupProductName: '机械键盘',
    productId: 'P-1002',
    productName: '机械键盘',
    productCategory: '外设',
    productPrice: 299,
    productStatus: '上架',
    loadedProductId: 'P-1002',
    originalProductId: 'P-1002',
    originalProductName: '机械键盘',
    originalProductCategory: '外设',
    originalProductPrice: 299,
    originalProductStatus: '上架',
  };
  const result = await runButton(project, 'findProduct', initial);
  assert.equal(result.success, true, result.errors.join('\n'));
  const effectResult = applyPreviewFlowSideEffects(project, collectFlowSideEffects(result));
  assert.deepEqual(effectResult.formValuePatches, { loadedProductId: '' });
  assert.deepEqual(effectResult.componentDisabledPatches, { button_save_product: true });
  assert.equal(effectResult.messages.at(-1)?.message, '未找到匹配商品，请检查编号和名称');
});

test('product lookup case writes modified product fields back to the source sheet', async () => {
  const project = loadProject('case_product_lookup_edit');
  const initial = {
    lookupProductId: 'P-1001',
    lookupProductName: '无线鼠标',
    productId: '',
    productName: '',
    productCategory: '',
    productPrice: '',
    productStatus: '',
    loadedProductId: '',
    originalProductId: '',
    originalProductName: '',
    originalProductCategory: '',
    originalProductPrice: '',
    originalProductStatus: '',
  };
  const lookup = await runButton(project, 'findProduct', initial);
  const patches = applyPreviewFlowSideEffects(project, collectFlowSideEffects(lookup)).formValuePatches;
  const edited = {
    ...initial,
    ...patches,
    productName: '无线鼠标 Pro',
    productPrice: 129,
    productStatus: '下架',
  };
  const result = await runButton(project, 'saveProduct', edited);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.deepEqual(result.nodeResults.get('submit')?.outputs.changeLog, {
    productName: { oldValue: '无线鼠标', newValue: '无线鼠标 Pro' },
    productPrice: { oldValue: 8, newValue: 129 },
    productStatus: { oldValue: '上架', newValue: '下架' },
  });
  const written = applyProjectWriteBacks(project, result);
  assert.equal(written.applied, 1);
  assert.deepEqual(written.project.srcTable[0].sheets[0].preview[0], {
    商品编号: 'P-1001',
    商品名称: '无线鼠标 Pro',
    商品分类: '外设',
    价格: 129,
    状态: '下架',
  });
});

test('product lookup case blocks save before any successful lookup', async () => {
  const project = loadProject('case_product_lookup_edit');
  const component = findDesignComponent(project, 'saveProduct');
  const originalConsoleError = console.error;
  console.error = () => {};
  const result = await executeDesignPreviewEvent({
    eventName: 'onClick',
    field: 'saveProduct',
    value: undefined,
    values: {
      lookupProductId: 'P-1001',
      lookupProductName: '无线鼠标',
      productId: 'P-1001',
      productName: '无线鼠标',
      productCategory: '外设',
      productPrice: 99,
      productStatus: '上架',
      loadedProductId: '',
      originalProductId: '',
      originalProductName: '',
      originalProductCategory: '',
      originalProductPrice: '',
      originalProductStatus: '',
    },
    component,
    originalValues: {},
  }, {
    workflows: project.workflows,
    tables: project.srcTable,
    setValue: () => {},
    setDisabled: () => {},
  });
  console.error = originalConsoleError;
  assert.equal(result.flowExecuted, false);
  assert.equal(result.error?.message, '请先查找到商品');
});
