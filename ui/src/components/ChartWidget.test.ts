import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHART_TYPE_OPTIONS,
  normalizeChartInput,
  sanitizeChartSchema,
  toScatterPoints,
} from './ChartWidget';

test('CHART_TYPE_OPTIONS 覆盖全部图表类型并包含中文标签', () => {
  const values = CHART_TYPE_OPTIONS.map((item) => item.value);
  assert.deepEqual(values, ['bar', 'line', 'pie', 'doughnut', 'area', 'radar', 'polarArea', 'scatter']);
  for (const option of CHART_TYPE_OPTIONS) {
    assert.ok(option.label.length > 0);
  }
});

test('toScatterPoints 将数值标签作为 X 坐标，非数值标签回退为序号', () => {
  const points = toScatterPoints({
    labels: ['10', '20', '华东', '40'],
    datasets: [{ label: '系列', data: [1, 2, 3, 4] }],
  });
  assert.deepEqual(points.datasets[0]?.data, [
    { x: 10, y: 1 },
    { x: 20, y: 2 },
    { x: 2, y: 3 },
    { x: 40, y: 4 },
  ]);
  assert.equal(points.labels[0], '10');
});

test('toScatterPoints 多数据集按各自数值转换', () => {
  const points = toScatterPoints({
    labels: ['一月', '二月'],
    datasets: [
      { label: 'A', data: [5, 8] },
      { label: 'B', data: [9, 3] },
    ],
  });
  assert.deepEqual(points.datasets.map((dataset) => dataset.data), [
    [{ x: 0, y: 5 }, { x: 1, y: 8 }],
    [{ x: 0, y: 9 }, { x: 1, y: 3 }],
  ]);
});

test('normalizeChartInput 兼容现有三种数据形态', () => {
  assert.equal(normalizeChartInput(null), null);
  assert.equal(normalizeChartInput(''), null);

  const chartData = normalizeChartInput({ labels: ['A'], datasets: [{ label: 'v', data: [1] }] });
  assert.deepEqual(chartData?.data?.labels, ['A']);

  const rows = normalizeChartInput([['A', 1], ['B', 2]]);
  assert.equal(rows?.headers?.length, 2);
  assert.equal(rows?.rawData?.length, 2);

  const records = normalizeChartInput([{ 名称: 'A', 值: 1 }]);
  assert.deepEqual(records?.headers, ['名称', '值']);
});

test('sanitizeChartSchema 过滤越界维度和指标', () => {
  const result = sanitizeChartSchema(['A', 'B', 'C'], [0, 9], [{ col: 1, agg: 'sum' }, { col: 99, agg: 'avg' }]);
  assert.deepEqual(result.dimensions, [0]);
  assert.deepEqual(result.metrics, [{ col: 1, agg: 'sum' }]);
  assert.equal(result.valid, true);
});
