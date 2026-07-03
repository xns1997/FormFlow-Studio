import React, { useMemo, useCallback } from 'react';
import type { RangeRef } from '../models';
import type { MetricConfig, AggFn, PostCalc, ColDataType } from '../components/ChartWidget';
import { AGG_OPTIONS, POST_CALC_OPTIONS, detectColType } from '../components/ChartWidget';
import { resolveRange } from '../services/rangeResolver';
import { useProjectStore } from '../project/store';

export type ColRole = 'dimension' | 'metric' | 'skip';

export interface ColConfig {
  role: ColRole;
  agg: AggFn;
  post: PostCalc;
  n: number;
}

interface Props {
  rangeRef: RangeRef | null;
  dimensions: number[];
  metrics: MetricConfig[];
  onChange: (dimensions: number[], metrics: MetricConfig[]) => void;
}

function inferColConfigs(headers: string[], data: unknown[][], dimensions: number[], metrics: MetricConfig[]): ColConfig[] {
  const dimSet = new Set(dimensions);
  const metricMap = new Map(metrics.map(m => [m.col, { agg: m.agg, post: m.post || 'none' as PostCalc, n: m.n ?? 2 }]));

  return headers.map((_, ci) => {
    if (dimSet.has(ci)) return { role: 'dimension' as const, agg: 'group' as AggFn, post: 'none' as PostCalc, n: 2 };
    if (metricMap.has(ci)) {
      const m = metricMap.get(ci)!;
      return { role: 'metric' as const, agg: m.agg, post: m.post, n: m.n };
    }
    const values = data.map(row => row[ci]).filter(v => v !== null && v !== undefined && v !== '');
    if (values.length === 0) return { role: 'dimension' as const, agg: 'group' as AggFn, post: 'none' as PostCalc, n: 2 };
    const numericCount = values.filter(v => !isNaN(Number(v))).length;
    return {
      role: numericCount / values.length >= 0.8 ? 'metric' : 'dimension',
      agg: numericCount / values.length >= 0.8 ? 'sum' as AggFn : 'group' as AggFn,
      post: 'none' as PostCalc,
      n: 2,
    };
  });
}

function getColDataType(data: unknown[][], colIndex: number): ColDataType {
  const values = data.map(row => row[colIndex]);
  return detectColType(values);
}

const NSTD_TYPES = new Set(['nstd', 'mean_plus_nstd', 'mean_minus_nstd']);

export default function DimMetricField({ rangeRef, dimensions, metrics, onChange }: Props) {
  const tables = useProjectStore((s) => s.project?.srcTable || []);
  const resolved = rangeRef ? resolveRange(rangeRef, tables) : null;
  const headers = resolved?.headers || [];
  const data = resolved?.data || [];

  const colConfigs = useMemo(() => {
    if (!headers.length) return [];
    return inferColConfigs(headers, data, dimensions, metrics);
  }, [headers, data, dimensions, metrics]);

  const colTypes = useMemo(() => {
    return headers.map((_, ci) => getColDataType(data, ci));
  }, [headers, data]);

  const emitChange = useCallback((newConfigs: ColConfig[]) => {
    const newDims: number[] = [];
    const newMets: MetricConfig[] = [];
    newConfigs.forEach((c, i) => {
      if (c.role === 'dimension') newDims.push(i);
      else if (c.role === 'metric') newMets.push({ col: i, agg: c.agg, post: c.post, n: c.n });
    });
    onChange(newDims, newMets);
  }, [onChange]);

  const handleChange = useCallback((colIndex: number, patch: Partial<ColConfig>) => {
    const newConfigs = colConfigs.map((c, i) => {
      if (i !== colIndex) return c;
      const next = { ...c, ...patch };
      if (patch.role && patch.role !== c.role) {
        next.agg = patch.role === 'metric' ? 'sum' : 'group';
        next.post = 'none';
        next.n = 2;
      }
      return next;
    });
    emitChange(newConfigs);
  }, [colConfigs, emitChange]);

  if (!rangeRef) return <div className="dm-empty">请先连接数据源</div>;
  if (!headers.length) return <div className="dm-empty">数据源为空</div>;

  return (
    <div className="dm-field">
      <div className="dm-header">
        <span className="dm-col">列名</span>
        <span className="dm-type">类型</span>
        <span className="dm-role">角色</span>
        <span className="dm-agg">聚合</span>
        <span className="dm-post">计算</span>
      </div>
      {headers.map((h, ci) => {
        const cfg = colConfigs[ci] || { role: 'skip' as ColRole, agg: 'sum' as AggFn, post: 'none' as PostCalc, n: 2 };
        const dtype = colTypes[ci] || 'mixed';
        const isDim = cfg.role === 'dimension';
        const isMet = cfg.role === 'metric';

        // 按数据类型过滤聚合选项
        const aggOpts = (isDim ? AGG_OPTIONS.filter(o => o.dimOk) : isMet ? AGG_OPTIONS.filter(o => o.metOk) : [])
          .filter(o => o.types.includes(dtype));
        const postOpts = POST_CALC_OPTIONS.filter(o => o.types.includes(dtype));

        // 类型标签
        const typeLabels: Record<ColDataType, string> = {
          number: '数值', string: '文本', date: '日期', boolean: '布尔', mixed: '混合',
        };

        return (
          <div key={ci} className={`dm-row dm-${cfg.role}`}>
            <span className="dm-col" title={h}>{h || `列${ci}`}</span>
            <span className={`dm-type-badge dm-type-${dtype}`}>{typeLabels[dtype]}</span>
            <select
              className="dm-sel"
              value={cfg.role}
              onChange={(e) => handleChange(ci, { role: e.target.value as ColRole })}
            >
              <option value="dimension">维度</option>
              <option value="metric">指标</option>
              <option value="skip">忽略</option>
            </select>
            {cfg.role !== 'skip' ? (
              <select
                className="dm-sel"
                value={aggOpts.some(o => o.value === cfg.agg) ? cfg.agg : aggOpts[0]?.value || 'group'}
                onChange={(e) => handleChange(ci, { agg: e.target.value as AggFn })}
              >
                {aggOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <span className="dm-placeholder">—</span>
            )}
            {isMet && NSTD_TYPES.has(cfg.agg) ? (
              <input
                className="dm-n-input"
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                value={cfg.n}
                title="N 倍标准差"
                onChange={(e) => handleChange(ci, { n: Number(e.target.value) || 2 })}
              />
            ) : isMet && postOpts.length > 1 ? (
              <select
                className="dm-sel"
                value={cfg.post}
                onChange={(e) => handleChange(ci, { post: e.target.value as PostCalc })}
              >
                {postOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <span className="dm-placeholder">—</span>
            )}
          </div>
        );
      })}
      <div className="dm-summary">
        {colConfigs.filter(c => c.role === 'dimension').length} 维度 ·{' '}
        {colConfigs.filter(c => c.role === 'metric').length} 指标
      </div>
    </div>
  );
}
