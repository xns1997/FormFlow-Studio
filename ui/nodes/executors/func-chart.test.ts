import assert from 'node:assert/strict';
import test from 'node:test';
import { getExecutor, type NodeExecContext } from '../executor-registry';
import { checkPortType } from '../port-types';
import './func';

async function runChart(inputs: Record<string, unknown>, properties: Record<string, unknown>) {
  const executor = getExecutor('func-create-chart');
  assert.ok(executor, 'missing executor func-create-chart');
  return executor({
    inputs,
    properties,
    tables: [],
    getNodeOutput: () => ({}),
    checkType: (type, value) => checkPortType(type, value),
    assertType: (_type, value) => value,
  } as NodeExecContext);
}

test('创建图表节点为全部声明类型生成对应 SVG 图形', async () => {
  const data = [
    { 月份: '一月', 营收: 12 },
    { 月份: '二月', 营收: 34 },
    { 月份: '三月', 营收: 23 },
  ];
  const cases: Array<[string, string]> = [
    ['bar', '<rect'],
    ['line', '<polyline'],
    ['pie', '<path'],
    ['scatter', '<circle'],
    ['area', '<polygon'],
    ['doughnut', '<path'],
    ['radar', '<polygon'],
    ['polarArea', '<path'],
  ];
  for (const [type, marker] of cases) {
    const result = await runChart({ data }, { chartType: type, title: `${type} 测试`, xField: '月份', yField: '营收' });
    assert.equal(result.chartCreated, true, `${type} 应创建成功`);
    assert.equal(result.chartType, type);
    const svg = String(result.svg);
    assert.ok(svg.startsWith('<svg'), `${type} 应输出 SVG`);
    assert.ok(svg.includes(marker), `${type} 应包含 ${marker}`);
    assert.ok(!svg.includes('NaN'), `${type} 不应包含 NaN 坐标`);
  }
});

test('创建图表节点数据错误时返回错误而不是异常', async () => {
  const result = await runChart({ data: 'not-rows' }, { chartType: 'bar' });
  assert.equal(result.chartCreated, false);
  assert.ok(String(result.error).includes('数据格式错误'));
});

test('创建图表节点写入 worksheet 时记录图表元数据', async () => {
  const worksheet = { '!ref': 'A1:C3' };
  const result = await runChart({ worksheet }, { chartType: 'radar', title: '质量雷达', width: 500, height: 300 });
  const charts = (worksheet as any)['!charts'];
  assert.equal(charts.length, 1);
  assert.equal(charts[0].name, 'Chart1');
  assert.equal(charts[0].type, 'radar');
  assert.equal(charts[0].title, '质量雷达');
  assert.equal(result.chartName, 'Chart1');
});
