import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Filler, Title, Tooltip, Legend,
} from 'chart.js';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Filler, Title, Tooltip, Legend,
);

// ── 聚合函数 ──────────────────────────────────────────────

export type ColDataType = 'number' | 'string' | 'date' | 'boolean' | 'mixed';

export type AggFn =
  | 'group'
  // 通用
  | 'count' | 'first' | 'last'
  // 文本
  | 'unique_count' | 'concat' | 'mode'
  | 'length_avg' | 'length_max' | 'length_min'
  // 数值
  | 'sum' | 'avg' | 'min' | 'max'
  | 'median' | 'std' | 'variance'
  | 'product' | 'range'
  | 'p25' | 'p50' | 'p75' | 'p90' | 'p95'
  | 'skewness' | 'kurtosis'
  | 'coeff_var' | 'harmonic_mean' | 'geometric_mean'
  | 'sum_sq' | 'rms'
  | 'nstd' | 'mean_plus_nstd' | 'mean_minus_nstd';

// ── 后处理计算 ────────────────────────────────────────────

export type PostCalc =
  | 'none'
  | 'pct_of_total'
  | 'rank' | 'rank_desc'
  | 'running_total'
  | 'diff' | 'growth_pct'
  | 'normalize'
  | 'z_score' | 'pct_change';

export interface MetricConfig {
  col: number;
  agg: AggFn;
  post?: PostCalc;
  label?: string;
  separator?: string;
  n?: number;
}

// ── 数据类型检测 ──────────────────────────────────────────

export function detectColType(values: unknown[]): ColDataType {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && v !== '');
  if (nonEmpty.length === 0) return 'mixed';
  let numCount = 0, dateCount = 0, boolCount = 0, strCount = 0;
  for (const v of nonEmpty) {
    const s = String(v);
    if (s === 'true' || s === 'false' || s === '0' || s === '1') { boolCount++; continue; }
    if (!isNaN(Number(v))) { numCount++; continue; }
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) || !isNaN(Date.parse(s))) { dateCount++; continue; }
    strCount++;
  }
  const total = nonEmpty.length;
  if (numCount / total >= 0.8) return 'number';
  if (dateCount / total >= 0.8) return 'date';
  if (boolCount / total >= 0.8) return 'boolean';
  if (strCount / total >= 0.6) return 'string';
  return 'mixed';
}

// ── 聚合选项定义（带数据类型限制）────────────────────────

export const AGG_OPTIONS: { value: AggFn; label: string; dimOk: boolean; metOk: boolean; types: ColDataType[] }[] = [
  // 通用（所有类型）
  { value: 'group',        label: '分组',       dimOk: true,  metOk: false, types: ['number','string','date','boolean','mixed'] },
  { value: 'count',        label: '计数',       dimOk: true,  metOk: true,  types: ['number','string','date','boolean','mixed'] },
  { value: 'first',        label: '首个',       dimOk: true,  metOk: true,  types: ['number','string','date','boolean','mixed'] },
  { value: 'last',         label: '末个',       dimOk: true,  metOk: true,  types: ['number','string','date','boolean','mixed'] },
  // 文本/混合
  { value: 'unique_count', label: '去重计数',   dimOk: true,  metOk: false, types: ['string','mixed','number','date','boolean'] },
  { value: 'concat',       label: '拼接',       dimOk: true,  metOk: false, types: ['string','mixed','number','date'] },
  { value: 'mode',         label: '众数',       dimOk: true,  metOk: true,  types: ['string','number','boolean','mixed'] },
  { value: 'length_avg',   label: '平均长度',   dimOk: true,  metOk: false, types: ['string'] },
  { value: 'length_max',   label: '最大长度',   dimOk: true,  metOk: false, types: ['string'] },
  { value: 'length_min',   label: '最小长度',   dimOk: true,  metOk: false, types: ['string'] },
  // 数值
  { value: 'sum',          label: '求和',       dimOk: false, metOk: true,  types: ['number'] },
  { value: 'avg',          label: '平均',       dimOk: false, metOk: true,  types: ['number'] },
  { value: 'min',          label: '最小',       dimOk: false, metOk: true,  types: ['number','date'] },
  { value: 'max',          label: '最大',       dimOk: false, metOk: true,  types: ['number','date'] },
  { value: 'median',       label: '中位数',     dimOk: false, metOk: true,  types: ['number'] },
  { value: 'std',          label: '标准差',     dimOk: false, metOk: true,  types: ['number'] },
  { value: 'variance',     label: '方差',       dimOk: false, metOk: true,  types: ['number'] },
  { value: 'product',      label: '乘积',       dimOk: false, metOk: true,  types: ['number'] },
  { value: 'range',        label: '极差',       dimOk: false, metOk: true,  types: ['number'] },
  { value: 'p25',          label: '25%分位',    dimOk: false, metOk: true,  types: ['number'] },
  { value: 'p50',          label: '50%分位',    dimOk: false, metOk: true,  types: ['number'] },
  { value: 'p75',          label: '75%分位',    dimOk: false, metOk: true,  types: ['number'] },
  { value: 'p90',          label: '90%分位',    dimOk: false, metOk: true,  types: ['number'] },
  { value: 'p95',          label: '95%分位',    dimOk: false, metOk: true,  types: ['number'] },
  { value: 'skewness',     label: '偏度',       dimOk: false, metOk: true,  types: ['number'] },
  { value: 'kurtosis',     label: '峰度',       dimOk: false, metOk: true,  types: ['number'] },
  { value: 'coeff_var',    label: '变异系数',   dimOk: false, metOk: true,  types: ['number'] },
  { value: 'harmonic_mean', label: '调和平均',  dimOk: false, metOk: true,  types: ['number'] },
  { value: 'geometric_mean', label: '几何平均', dimOk: false, metOk: true,  types: ['number'] },
  { value: 'sum_sq',       label: '平方和',     dimOk: false, metOk: true,  types: ['number'] },
  { value: 'rms',          label: '均方根',     dimOk: false, metOk: true,  types: ['number'] },
  { value: 'nstd',         label: 'N倍标准差',  dimOk: false, metOk: true,  types: ['number'] },
  { value: 'mean_plus_nstd',  label: '均值+Nσ', dimOk: false, metOk: true,  types: ['number'] },
  { value: 'mean_minus_nstd', label: '均值-Nσ', dimOk: false, metOk: true,  types: ['number'] },
];

export const POST_CALC_OPTIONS: { value: PostCalc; label: string; types: ColDataType[] }[] = [
  { value: 'none',          label: '无',           types: ['number','string','date','boolean','mixed'] },
  { value: 'pct_of_total',  label: '占比(%)',      types: ['number'] },
  { value: 'rank',          label: '排名(升)',     types: ['number','string','date'] },
  { value: 'rank_desc',     label: '排名(降)',     types: ['number','string','date'] },
  { value: 'running_total',  label: '累计',        types: ['number'] },
  { value: 'diff',          label: '环比差',       types: ['number','date'] },
  { value: 'growth_pct',    label: '环比增长%',    types: ['number'] },
  { value: 'normalize',     label: '归一化',       types: ['number'] },
  { value: 'z_score',       label: 'Z-Score',     types: ['number'] },
  { value: 'pct_change',    label: '环比变化%',    types: ['number'] },
];

// ── 聚合计算 ──────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function aggValues(values: number[], fn: AggFn, n = 2): number {
  const nums = values.filter(v => !isNaN(v));
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = sum / nums.length;
  switch (fn) {
    case 'sum':       return sum;
    case 'avg':       return avg;
    case 'count':     return nums.length;
    case 'min':       return sorted[0];
    case 'max':       return sorted[sorted.length - 1];
    case 'median':    return percentile(sorted, 50);
    case 'mode':      { const freq = new Map<number, number>(); nums.forEach(v => freq.set(v, (freq.get(v) || 0) + 1)); let maxF = 0, mode = nums[0]; freq.forEach((f, v) => { if (f > maxF) { maxF = f; mode = v; } }); return mode; }
    case 'std':       return Math.sqrt(nums.reduce((s, v) => s + (v - avg) ** 2, 0) / nums.length);
    case 'variance':  return nums.reduce((s, v) => s + (v - avg) ** 2, 0) / nums.length;
    case 'product':   return nums.reduce((a, b) => a * b, 1);
    case 'range':     return sorted[sorted.length - 1] - sorted[0];
    case 'p25':       return percentile(sorted, 25);
    case 'p50':       return percentile(sorted, 50);
    case 'p75':       return percentile(sorted, 75);
    case 'p90':       return percentile(sorted, 90);
    case 'p95':       return percentile(sorted, 95);
    case 'skewness':  { const sd = Math.sqrt(nums.reduce((s, v) => s + (v - avg) ** 2, 0) / nums.length); return sd === 0 ? 0 : nums.reduce((s, v) => s + ((v - avg) / sd) ** 3, 0) / nums.length; }
    case 'kurtosis':  { const sd = Math.sqrt(nums.reduce((s, v) => s + (v - avg) ** 2, 0) / nums.length); return sd === 0 ? 0 : nums.reduce((s, v) => s + ((v - avg) / sd) ** 4, 0) / nums.length - 3; }
    case 'coeff_var': { const sd = Math.sqrt(nums.reduce((s, v) => s + (v - avg) ** 2, 0) / nums.length); return avg === 0 ? 0 : sd / Math.abs(avg); }
    case 'harmonic_mean':  { const recipSum = nums.filter(v => v !== 0).reduce((s, v) => s + 1 / v, 0); return recipSum === 0 ? 0 : nums.filter(v => v !== 0).length / recipSum; }
    case 'geometric_mean': { const pos = nums.filter(v => v > 0); return pos.length === 0 ? 0 : Math.exp(pos.reduce((s, v) => s + Math.log(v), 0) / pos.length); }
    case 'sum_sq':    return nums.reduce((s, v) => s + v * v, 0);
    case 'rms':       return Math.sqrt(nums.reduce((s, v) => s + v * v, 0) / nums.length);
    case 'nstd':      { const sd = Math.sqrt(nums.reduce((s, v) => s + (v - avg) ** 2, 0) / nums.length); return Math.round(sd * n * 100) / 100; }
    case 'mean_plus_nstd':  { const sd = Math.sqrt(nums.reduce((s, v) => s + (v - avg) ** 2, 0) / nums.length); return Math.round((avg + sd * n) * 100) / 100; }
    case 'mean_minus_nstd': { const sd = Math.sqrt(nums.reduce((s, v) => s + (v - avg) ** 2, 0) / nums.length); return Math.round((avg - sd * n) * 100) / 100; }
    default:          return sum;
  }
}

function aggRawValues(values: unknown[], fn: AggFn, sep = ', '): string | number {
  if (fn === 'count') return values.length;
  if (fn === 'unique_count') return new Set(values.map(String)).size;
  if (fn === 'concat') return values.map(v => String(v ?? '')).join(sep);
  if (fn === 'first') return String(values[0] ?? '');
  if (fn === 'last') return String(values[values.length - 1] ?? '');
  if (fn === 'mode') { const freq = new Map<string, number>(); values.forEach(v => { const s = String(v ?? ''); freq.set(s, (freq.get(s) || 0) + 1); }); let maxF = 0, mode = ''; freq.forEach((f, s) => { if (f > maxF) { maxF = f; mode = s; } }); return mode; }
  if (fn === 'length_avg') { const lens = values.map(v => String(v ?? '').length); return lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length * 10) / 10 : 0; }
  if (fn === 'length_max') return Math.max(...values.map(v => String(v ?? '').length));
  if (fn === 'length_min') return Math.min(...values.map(v => String(v ?? '').length));
  if (fn === 'min') return String(values.sort()[0] ?? '');
  if (fn === 'max') return String(values.sort().reverse()[0] ?? '');
  const nums = values.map(Number).filter(n => !isNaN(n));
  return aggValues(nums, fn);
}

// ── 后处理 ────────────────────────────────────────────────

function applyPostCalc(data: number[], calc: PostCalc): number[] {
  if (calc === 'none' || !data.length) return data;
  switch (calc) {
    case 'pct_of_total': {
      const total = data.reduce((a, b) => a + Math.abs(b), 0);
      return total === 0 ? data.map(() => 0) : data.map(v => Math.round(v / total * 10000) / 100);
    }
    case 'rank': {
      const sorted = [...data].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
      const ranks = new Array(data.length);
      sorted.forEach((item, rank) => { ranks[item.i] = rank + 1; });
      return ranks;
    }
    case 'rank_desc': {
      const sorted = [...data].map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
      const ranks = new Array(data.length);
      sorted.forEach((item, rank) => { ranks[item.i] = rank + 1; });
      return ranks;
    }
    case 'running_total': {
      let sum = 0;
      return data.map(v => { sum += v; return Math.round(sum * 100) / 100; });
    }
    case 'diff': {
      return data.map((v, i) => i === 0 ? 0 : Math.round((v - data[i - 1]) * 100) / 100);
    }
    case 'growth_pct': {
      return data.map((v, i) => {
        if (i === 0 || data[i - 1] === 0) return 0;
        return Math.round((v - data[i - 1]) / Math.abs(data[i - 1]) * 10000) / 100;
      });
    }
    case 'normalize': {
      const min = Math.min(...data);
      const max = Math.max(...data);
      const range = max - min;
      return range === 0 ? data.map(() => 50) : data.map(v => Math.round((v - min) / range * 100));
    }
    case 'z_score': {
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const sd = Math.sqrt(data.reduce((s, v) => s + (v - avg) ** 2, 0) / data.length);
      return sd === 0 ? data.map(() => 0) : data.map(v => Math.round((v - avg) / sd * 100) / 100);
    }
    case 'pct_change': {
      return data.map((v, i) => {
        if (i === 0 || data[i - 1] === 0) return 0;
        return Math.round((v - data[i - 1]) / Math.abs(data[i - 1]) * 10000) / 100;
      });
    }
    default:
      return data;
  }
}

export function aggLabel(fn: AggFn): string {
  return AGG_OPTIONS.find(o => o.value === fn)?.label || fn;
}

export function postLabel(fn: PostCalc): string {
  return POST_CALC_OPTIONS.find(o => o.value === fn)?.label || fn;
}

// ── 图表数据 ──────────────────────────────────────────────

export interface ChartDataConfig {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
    fill?: boolean;
    tension?: number;
  }>;
}

interface ChartWidgetProps {
  chartType: 'bar' | 'line' | 'pie' | 'doughnut' | 'area';
  title?: string;
  data?: ChartDataConfig;
  rawData?: unknown[][];
  headers?: string[];
  dimensions?: number[];
  metrics?: MetricConfig[];
  barColor?: string;
  lineColor?: string;
  showLegend?: boolean;
  showValues?: boolean;
  height?: number;
}

const DEFAULT_DATA: ChartDataConfig = {
  labels: ['一月', '二月', '三月', '四月', '五月'],
  datasets: [{ label: '数据系列', data: [35, 59, 28, 48, 67] }],
};

const PIE_COLORS = ['#007AFF', '#FF9500', '#34C759', '#FF3B30', '#AF52DE', '#5AC8FA', '#FFCC00', '#FF2D55', '#5856D6', '#FF6482'];

function buildDimKey(row: unknown[], dimCols: number[]): string {
  return dimCols.map(c => String(row[c] ?? '')).join(' · ');
}

function dimMetricToChartData(raw: unknown[][], headers: string[], dimCols: number[], metricCfgs: MetricConfig[]): ChartDataConfig {
  if (!raw.length || !dimCols.length || !metricCfgs.length) return DEFAULT_DATA;

  const groups = new Map<string, unknown[][]>();
  for (const row of raw) {
    const key = buildDimKey(row, dimCols);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  // 维度标签：支持维度聚合
  const labels = [...groups.keys()].map(key => {
    const rows = groups.get(key) || [];
    // 多维度时取第一个维度的聚合结果作为标签
    const dimAgg = metricCfgs.length > 0 ? undefined : undefined;
    return key;
  });

  // 维度聚合产生的额外数据集
  const dimDatasets: ChartDataConfig['datasets'] = [];
  // 这里维度聚合主要用于改变标签或产生额外数据系列

  const datasets = metricCfgs.map((mc) => {
    const isRawAgg = ['count', 'unique_count', 'concat', 'first', 'last'].includes(mc.agg);
    const seriesData: number[] = [];

    for (const key of labels) {
      const rows = groups.get(key) || [];
      if (isRawAgg) {
        const values = rows.map(r => r[mc.col]);
        seriesData.push(Number(aggRawValues(values, mc.agg, mc.separator)) || 0);
      } else {
        const values = rows
          .map(r => r[mc.col])
          .filter(v => v !== null && v !== undefined && v !== '')
          .map(Number)
          .filter(n => !isNaN(n));
        seriesData.push(Math.round(aggValues(values, mc.agg, mc.n ?? 2) * 100) / 100);
      }
    }

    const processed = applyPostCalc(seriesData, mc.post || 'none');
    const metricLabel = mc.label || headers[mc.col] || `指标${mc.col}`;
    const postSuffix = mc.post && mc.post !== 'none' ? `(${postLabel(mc.post)})` : '';

    return {
      label: `${metricLabel}(${aggLabel(mc.agg)})${postSuffix}`,
      data: processed,
    };
  });

  return { labels, datasets: [...dimDatasets, ...datasets] };
}

function rawDataToChartData(raw: unknown[][], headers: string[]): ChartDataConfig {
  if (!raw.length || !headers.length) return DEFAULT_DATA;
  const firstRow = raw[0] || [];
  const hasNumericFirstCol = firstRow.every(v => v === null || v === undefined || !isNaN(Number(v)));
  if (hasNumericFirstCol) {
    const labels = headers.map((_, i) => headers[i] || `列${i + 1}`);
    return {
      labels,
      datasets: raw.length === 1
        ? [{ label: '数据', data: raw[0].map(v => Number(v) || 0) }]
        : raw.map((row, ri) => ({ label: `行${ri + 1}`, data: row.map(v => Number(v) || 0) })),
    };
  }
  const labels = raw.map(row => String(row[0] ?? ''));
  const seriesCount = Math.max(0, headers.length - 1);
  const datasets = Array.from({ length: seriesCount }, (_, ci) => ({
    label: headers[ci + 1] || `系列${ci + 1}`,
    data: raw.map(row => Number(row[ci + 1]) || 0),
  }));
  return { labels, datasets: datasets.length ? datasets : [{ label: '数据', data: raw.map(r => Number(r[0]) || 0) }] };
}

export default function ChartWidget({
  chartType, title, data, rawData, headers, dimensions, metrics,
  barColor = '#007AFF', lineColor = '#FF9500',
  showLegend = false, height,
}: ChartWidgetProps) {
  const isArea = chartType === 'area';
  const effectiveType = isArea ? 'line' : chartType;

  const chartData = useMemo(() => {
    if (data) return data;
    if (rawData && rawData.length > 0 && headers && headers.length > 0) {
      if (dimensions && dimensions.length > 0 && metrics && metrics.length > 0) {
        return dimMetricToChartData(rawData, headers, dimensions, metrics);
      }
      return rawDataToChartData(rawData, headers);
    }
    return DEFAULT_DATA;
  }, [data, rawData, headers, dimensions, metrics]);

  const enrichedData: ChartDataConfig = useMemo(() => ({
    ...chartData,
    datasets: chartData.datasets.map((ds, i) => {
      const color = i === 0 ? barColor : (i === 1 ? lineColor : PIE_COLORS[i % PIE_COLORS.length]);
      return {
        ...ds,
        backgroundColor: ds.backgroundColor || (effectiveType === 'pie' || effectiveType === 'doughnut'
          ? PIE_COLORS.slice(0, chartData.labels.length)
          : effectiveType === 'line' && !isArea ? 'transparent' : hexToRgba(color, 0.7)),
        borderColor: ds.borderColor || (effectiveType === 'pie' || effectiveType === 'doughnut' ? '#ffffff' : color),
        borderWidth: ds.borderWidth ?? 2,
        fill: isArea ? true : ds.fill,
        tension: ds.tension ?? (effectiveType === 'line' || isArea ? 0.4 : 0),
      };
    }),
  }), [chartData, barColor, lineColor, effectiveType, isArea]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: showLegend, position: 'bottom' as const },
      title: { display: !!title, text: title || '' },
      tooltip: { enabled: true },
    },
    scales: effectiveType === 'pie' || effectiveType === 'doughnut' ? {} : {
      x: { display: true, grid: { display: false } },
      y: { display: true, grid: { color: 'rgba(0,0,0,0.06)' } },
    },
    animation: { duration: 600 },
  };

  const style: React.CSSProperties = { width: '100%', height: height || '100%', minHeight: 0 };

  switch (effectiveType) {
    case 'bar': return <div style={style}><Bar data={enrichedData} options={options} /></div>;
    case 'line': return <div style={style}><Line data={enrichedData} options={options} /></div>;
    case 'pie': return <div style={style}><Pie data={enrichedData} options={options} /></div>;
    case 'doughnut': return <div style={style}><Doughnut data={enrichedData} options={options} /></div>;
    default: return <div style={style}><Bar data={enrichedData} options={options} /></div>;
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
