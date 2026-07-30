/**
 * DataCharts Component
 *
 * Provides data visualization for the data overview (describe) tab.
 * Uses chart.js via react-chartjs-2.
 */
import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  RadialLinearScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Pie, Scatter, Radar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  ArcElement, RadialLinearScale, Tooltip, Legend, Filler,
);

// ── Types ──────────────────────────────────────────────

interface DistributionInfo {
  column: string;
  bins: number[];
  counts: number[];
}

interface ColumnAnalysis {
  name: string;
  type: string;
  nonNullCount: number;
  nullCount: number;
  nullPercent: number;
  uniqueCount: number;
  stats?: {
    mean?: number;
    std?: number;
    min?: number;
    q25?: number;
    median?: number;
    q75?: number;
    max?: number;
  };
  topValues?: Array<{ value: unknown; count: number }>;
  hasOutliers?: boolean;
  outlierCount?: number;
  cardinality?: string;
}

interface DataScienceReport {
  overview: {
    rows: number;
    columns: number;
    memoryUsage: number;
    missingTotal: number;
    missingPercent: number;
    duplicateRows: number;
    duplicatePercent: number;
  };
  columns: ColumnAnalysis[];
  correlations?: Record<string, Record<string, number>>;
  distributions?: DistributionInfo[];
  qualityScore: number;
}

// ── Colors ─────────────────────────────────────────────

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

const COLORS_ALPHA = COLORS.map((c) => c + '33');

// ── Histogram Chart ────────────────────────────────────

export function HistogramChart({ distribution }: { distribution: DistributionInfo }) {
  const data = {
    labels: distribution.bins.slice(0, -1).map((b, i) => {
      const next = distribution.bins[i + 1];
      return Number.isInteger(b) && Number.isInteger(next) ? `${b}-${next}` : `${b.toFixed(1)}-${next.toFixed(1)}`;
    }),
    datasets: [{
      label: distribution.column,
      data: distribution.counts,
      backgroundColor: COLORS_ALPHA[0],
      borderColor: COLORS[0],
      borderWidth: 1,
    }],
  };

  return (
    <div className="data-chart-container">
      <Bar data={data} options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxRotation: 45, font: { size: 10 } } },
          y: { beginAtZero: true },
        },
      }} />
    </div>
  );
}

// ── Category Bar Chart (horizontal) ────────────────────

export function CategoryBarChart({ column, topValues }: { column: string; topValues: Array<{ value: unknown; count: number }> }) {
  const sorted = [...topValues].sort((a, b) => b.count - a.count).slice(0, 15);
  const data = {
    labels: sorted.map((v) => String(v.value ?? '(空)')),
    datasets: [{
      label: column,
      data: sorted.map((v) => v.count),
      backgroundColor: COLORS_ALPHA[1],
      borderColor: COLORS[1],
      borderWidth: 1,
    }],
  };

  return (
    <div className="data-chart-container data-chart-horizontal">
      <Bar data={data} options={{
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } },
      }} />
    </div>
  );
}

// ── Pie Chart ──────────────────────────────────────────

export function PieChart({ column, topValues }: { column: string; topValues: Array<{ value: unknown; count: number }> }) {
  const sorted = [...topValues].sort((a, b) => b.count - a.count).slice(0, 8);
  const total = sorted.reduce((sum, v) => sum + v.count, 0);

  const data = {
    labels: sorted.map((v) => String(v.value ?? '(空)')),
    datasets: [{
      data: sorted.map((v) => v.count),
      backgroundColor: COLORS.slice(0, sorted.length),
      borderWidth: 1,
    }],
  };

  return (
    <div className="data-chart-container data-chart-pie">
      <Pie data={data} options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                return `${ctx.label}: ${ctx.parsed} (${pct}%)`;
              },
            },
          },
        },
      }} />
    </div>
  );
}

// ── Correlation Heatmap ────────────────────────────────

export function CorrelationHeatmap({ correlations }: { correlations: Record<string, Record<string, number>> }) {
  const columns = Object.keys(correlations);
  if (columns.length < 2) return null;

  // Render as a grid of colored cells
  return (
    <div className="data-chart-container data-chart-heatmap">
      <div className="heatmap-grid" style={{ gridTemplateColumns: `80px repeat(${columns.length}, 1fr)` }}>
        <div className="heatmap-corner" />
        {columns.map((col) => <div key={`h-${col}`} className="heatmap-header">{col}</div>)}
        {columns.map((row) => (
          <React.Fragment key={row}>
            <div className="heatmap-row-header">{row}</div>
            {columns.map((col) => {
              const val = correlations[row]?.[col] ?? 0;
              const absVal = Math.abs(val);
              const hue = val >= 0 ? 210 : 0; // blue for positive, red for negative
              const bg = `hsla(${hue}, 80%, ${50 + (1 - absVal) * 40}%, ${absVal * 0.8 + 0.1})`;
              return (
                <div
                  key={`${row}-${col}`}
                  className="heatmap-cell"
                  style={{ background: bg }}
                  title={`${row} × ${col}: ${val.toFixed(3)}`}
                >
                  {val.toFixed(2)}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Scatter Plot ───────────────────────────────────────

export function ScatterPlot({
  xColumn, yColumn, xValues, yValues,
}: {
  xColumn: string; yColumn: string;
  xValues: number[]; yValues: number[];
}) {
  const data = {
    datasets: [{
      label: `${xColumn} vs ${yColumn}`,
      data: xValues.map((x, i) => ({ x, y: yValues[i] })),
      backgroundColor: COLORS_ALPHA[2],
      borderColor: COLORS[2],
      pointRadius: 3,
    }],
  };

  return (
    <div className="data-chart-container">
      <Scatter data={data} options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: xColumn } },
          y: { title: { display: true, text: yColumn } },
        },
      }} />
    </div>
  );
}

// ── Quality Radar Chart ────────────────────────────────

export function QualityRadarChart({ report }: { report: DataScienceReport }) {
  const { overview, columns, qualityScore } = report;

  // Compute quality dimensions
  const completeness = 100 - overview.missingPercent;
  const uniqueness = columns.length > 0
    ? columns.reduce((sum, c) => sum + Math.min(100, (c.uniqueCount / Math.max(1, c.nonNullCount)) * 100), 0) / columns.length
    : 0;
  const consistency = columns.length > 0
    ? (columns.filter((c) => c.nullPercent < 20).length / columns.length) * 100
    : 0;
  const outlierFree = columns.length > 0
    ? (columns.filter((c) => !c.hasOutliers).length / columns.length) * 100
    : 0;
  const noDuplicates = 100 - overview.duplicatePercent;

  const data = {
    labels: ['完整性', '唯一性', '一致性', '无异常值', '无重复'],
    datasets: [{
      label: '数据质量',
      data: [completeness, uniqueness, consistency, outlierFree, noDuplicates],
      backgroundColor: 'rgba(59, 130, 246, 0.2)',
      borderColor: '#3b82f6',
      borderWidth: 2,
      pointBackgroundColor: '#3b82f6',
    }],
  };

  return (
    <div className="data-chart-container data-chart-radar">
      <Radar data={data} options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { stepSize: 20, font: { size: 10 } },
            pointLabels: { font: { size: 12 } },
          },
        },
      }} />
    </div>
  );
}

// ── Missing Value Heatmap ──────────────────────────────

export function MissingValueHeatmap({ columns, totalRows }: { columns: ColumnAnalysis[]; totalRows: number }) {
  const cols = columns.filter((c) => c.nullCount > 0);
  if (cols.length === 0) return <div className="data-chart-empty">无缺失值</div>;

  return (
    <div className="data-chart-container data-chart-missing">
      <div className="missing-bars">
        {cols.map((col) => {
          const pct = (col.nullCount / totalRows) * 100;
          return (
            <div key={col.name} className="missing-bar-row">
              <span className="missing-bar-label" title={col.name}>{col.name}</span>
              <div className="missing-bar-track">
                <div
                  className="missing-bar-fill"
                  style={{ width: `${Math.max(pct, 1)}%` }}
                  title={`${col.nullCount} 行缺失 (${pct.toFixed(1)}%)`}
                />
              </div>
              <span className="missing-bar-value">{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Box Plot (approximated with bar chart + error bars) ──

export function BoxPlotChart({ column }: { column: ColumnAnalysis }) {
  if (!column.stats) return null;
  const { min, q25, median, q75, max } = column.stats;

  const data = {
    labels: [column.name],
    datasets: [{
      label: '分布',
      data: [median || 0],
      backgroundColor: COLORS_ALPHA[4],
      borderColor: COLORS[4],
      borderWidth: 1,
    }],
  };

  // Show as a summary card instead of a chart for single column
  return (
    <div className="data-chart-boxplot">
      <div className="boxplot-stats">
        <div className="boxplot-stat"><span className="boxplot-label">最小值</span><span className="boxplot-value">{min?.toFixed(2)}</span></div>
        <div className="boxplot-stat"><span className="boxplot-label">Q25</span><span className="boxplot-value">{q25?.toFixed(2)}</span></div>
        <div className="boxplot-stat boxplot-median"><span className="boxplot-label">中位数</span><span className="boxplot-value">{median?.toFixed(2)}</span></div>
        <div className="boxplot-stat"><span className="boxplot-label">Q75</span><span className="boxplot-value">{q75?.toFixed(2)}</span></div>
        <div className="boxplot-stat"><span className="boxplot-label">最大值</span><span className="boxplot-value">{max?.toFixed(2)}</span></div>
      </div>
      <div className="boxplot-visual">
        <div className="boxplot-whisker-left" style={{ left: '0%', width: '25%' }} />
        <div className="boxplot-box" style={{ left: '25%', width: '50%' }} />
        <div className="boxplot-whisker-right" style={{ left: '75%', width: '25%' }} />
        <div className="boxplot-median-line" style={{ left: '50%' }} />
      </div>
    </div>
  );
}
