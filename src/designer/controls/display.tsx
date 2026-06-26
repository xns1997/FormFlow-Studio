import React, { useMemo } from 'react';
import { registerControl } from '../registry';
import type { DesignComponent } from '../../project/types';
import { controlText, ios } from './styles';
import ChartWidget from '../../components/ChartWidget';
import type { MetricConfig } from '../../components/ChartWidget';
import { resolveRange } from '../../services/rangeResolver';
import { useProjectStore } from '../../project/store';
import { DesignerIcon } from '../icons';

registerControl({
  type: 'text', label: '文本', category: 'display', icon: '📄',
  defaultProps: {
    content: '文本内容', name: '',
    fontSize: 15, fontWeight: 'normal', fontFamily: '', color: '#1c1c1e',
    textAlign: 'left', letterSpacing: 0, lineHeight: 1.5, textDecoration: 'none',
    rangeRef: null,
  },
  propSchema: [
    { key: 'content', label: '内容', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'fontSize', label: '字号', type: 'number', group: '文本样式', min: 8, max: 72 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '文本样式', options: [
      { label: '细体', value: '300' }, { label: '常规', value: 'normal' }, { label: '中等', value: '500' },
      { label: '半粗', value: '600' }, { label: '粗体', value: 'bold' },
    ]},
    { key: 'fontFamily', label: '字体', type: 'select', group: '文本样式', options: [
      { label: '系统默认', value: '' }, { label: '等宽字体', value: 'monospace' },
      { label: '衬线体', value: 'Georgia, serif' }, { label: '无衬线', value: 'Helvetica, sans-serif' },
    ]},
    { key: 'color', label: '颜色', type: 'color', group: '文本样式' },
    { key: 'textAlign', label: '对齐', type: 'select', group: '文本样式', options: [
      { label: '左对齐', value: 'left' }, { label: '居中', value: 'center' }, { label: '右对齐', value: 'right' },
    ]},
    { key: 'letterSpacing', label: '字间距', type: 'number', group: '文本样式', min: -2, max: 10, step: 0.5 },
    { key: 'lineHeight', label: '行高', type: 'number', group: '文本样式', min: 1, max: 3, step: 0.1 },
    { key: 'textDecoration', label: '装饰', type: 'select', group: '文本样式', options: [
      { label: '无', value: 'none' }, { label: '下划线', value: 'underline' },
      { label: '删除线', value: 'line-through' }, { label: '上划线', value: 'overline' },
    ]},
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [],
  defaultSize: { w: 180, h: 36 },
  render: ({ component }: { component: DesignComponent }) => (
    <div style={{ width: '100%', height: '100%', minWidth: 0, display: 'flex', alignItems: 'center', padding: '0 2px', boxSizing: 'border-box', overflow: 'hidden' }}>
      <span style={controlText({
        fontSize: component.props.fontSize || 15,
        fontWeight: component.props.fontWeight || 'normal',
        fontFamily: component.props.fontFamily || undefined,
        color: component.props.color || '#1c1c1e',
        textAlign: component.props.textAlign || 'left',
        letterSpacing: component.props.letterSpacing || 0,
        lineHeight: component.props.lineHeight || 1.5,
        textDecoration: component.props.textDecoration || 'none',
      })}>
        {component.props.content || '文本'}
      </span>
    </div>
  ),
});

registerControl({
  type: 'image', label: '图片', category: 'display', icon: '🖼️',
  defaultProps: {
    src: '', alt: '图片', name: '', fit: 'cover', borderRadius: 0, opacity: 1,
    rangeRef: null,
  },
  propSchema: [
    { key: 'src', label: '图片URL', type: 'string', group: '基础' },
    { key: 'alt', label: '替代文本', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'fit', label: '填充方式', type: 'select', group: '样式', options: [
      { label: '覆盖', value: 'cover' }, { label: '包含', value: 'contain' },
      { label: '拉伸', value: 'fill' }, { label: '适应', value: 'scale-down' },
    ]},
    { key: 'borderRadius', label: '圆角', type: 'number', group: '样式', min: 0, max: 100 },
    { key: 'opacity', label: '透明度', type: 'number', group: '样式', min: 0, max: 1, step: 0.1 },
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [{ key: 'onClick', label: '点击', description: '点击图片时触发' }],
  defaultSize: { w: 240, h: 160 },
  render: ({ component }: { component: DesignComponent }) => (
    <div style={{ ...ios.glass, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(118,118,128,0.08)', borderRadius: component.props.borderRadius || 0 }}>
      {component.props.src ? (
        <img src={component.props.src} alt={component.props.alt || ''} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: component.props.fit || 'cover', borderRadius: component.props.borderRadius || 0, opacity: component.props.opacity ?? 1 }} />
      ) : (
        <span style={{ fontSize: 24, opacity: 0.2 }}><DesignerIcon name="image" size={24} /></span>
      )}
    </div>
  ),
});

registerControl({
  type: 'table', label: '数据表格', category: 'display', icon: '📊',
  defaultProps: {
    columns: ['名称', '类型', '状态'], rows: 3, name: '',
    headerBackground: 'rgba(118,118,128,0.06)', headerColor: '#8e8e93', headerFontWeight: '600',
    cellColor: '#3a3a3c', showGrid: true, striped: true,
    rangeRef: null,
  },
  propSchema: [
    { key: 'columns', label: '列名 (JSON)', type: 'json', group: '数据' },
    { key: 'rows', label: '行数', type: 'number', group: '数据', min: 1, max: 50 },
    { key: 'name', label: '字段名', type: 'string', group: '数据', placeholder: 'field_name' },
    { key: 'headerBackground', label: '表头背景', type: 'color', group: '样式' },
    { key: 'headerColor', label: '表头文字颜色', type: 'color', group: '样式' },
    { key: 'headerFontWeight', label: '表头字重', type: 'select', group: '样式', options: [
      { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '粗体', value: '600' },
    ]},
    { key: 'cellColor', label: '单元格文字颜色', type: 'color', group: '样式' },
    { key: 'showGrid', label: '显示网格线', type: 'boolean', group: '样式' },
    { key: 'striped', label: '斑马纹', type: 'boolean', group: '样式' },
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [{ key: 'onRowClick', label: '行点击', description: '点击表格行时触发' }],
  defaultSize: { w: 360, h: 180 },
  render: ({ component }: { component: DesignComponent }) => {
    const cols = component.props.columns || ['列A', '列B'];
    const rows = component.props.rows || 3;
    return (
      <div style={ios.glass}>
        <table style={{ width: '100%', minWidth: 0, borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {cols.map((c: string, i: number) => (
                <th key={i} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: component.props.headerFontWeight || 600, color: component.props.headerColor || '#8e8e93', fontSize: 12, borderBottom: component.props.showGrid !== false ? '0.5px solid rgba(60,60,67,0.08)' : 'none', background: component.props.headerBackground || 'rgba(118,118,128,0.06)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {cols.map((_: string, c: number) => (
                  <td key={c} style={{ padding: '9px 10px', borderBottom: component.props.showGrid !== false && r < rows - 1 ? '0.5px solid rgba(60,60,67,0.06)' : 'none', color: component.props.cellColor || '#3a3a3c', background: component.props.striped && r % 2 === 1 ? 'rgba(118,118,128,0.03)' : 'transparent', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>—</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
});

// ── 维度/指标自动推断 ─────────────────────────────────────

function inferDimMetrics(headers: string[], data: unknown[][]): { dims: number[]; mets: MetricConfig[] } {
  if (!data.length || !headers.length) return { dims: [], mets: [] };

  const dims: number[] = [];
  const mets: MetricConfig[] = [];

  for (let c = 0; c < headers.length; c++) {
    const values = data.map(row => row[c]).filter(v => v !== null && v !== undefined && v !== '');
    if (values.length === 0) {
      dims.push(c);
      continue;
    }
    const numericCount = values.filter(v => !isNaN(Number(v))).length;
    const ratio = numericCount / values.length;
    if (ratio >= 0.8) {
      mets.push({ col: c, agg: 'sum' });
    } else {
      dims.push(c);
    }
  }

  // 至少保留一个维度
  if (dims.length === 0 && mets.length > 1) {
    const first = mets.shift()!;
    dims.push(first.col);
  }

  return { dims, mets };
}

// ── 图表控件注册 ──────────────────────────────────────────

registerControl({
  type: 'chart', label: '图表', category: 'display', icon: '📈',
  defaultProps: {
    chartType: 'bar', title: '图表标题', name: '',
    barColor: '#007aff', lineColor: '#ff9500', showLegend: false, showValues: false,
    chartData: null,
    dimensions: null,
    metrics: null,
    rangeRef: null,
    _autoInferred: false,
  },
  propSchema: [
    { key: 'chartType', label: '图表类型', type: 'select', group: '基础', options: [
      { label: '柱状图', value: 'bar' }, { label: '折线图', value: 'line' }, { label: '饼图', value: 'pie' },
      { label: '环形图', value: 'doughnut' }, { label: '面积图', value: 'area' },
    ]},
    { key: 'title', label: '标题', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', group: '基础', placeholder: 'field_name' },
    { key: 'chartData', label: '自定义数据 (JSON)', type: 'json', group: '数据' },
    { key: '__dimMetric', label: '', type: 'dimMetric' as any, group: '维度/指标' },
    { key: 'barColor', label: '主色', type: 'color', group: '样式' },
    { key: 'lineColor', label: '辅色', type: 'color', group: '样式' },
    { key: 'showLegend', label: '显示图例', type: 'boolean', group: '样式' },
    { key: 'showValues', label: '显示数值', type: 'boolean', group: '样式' },
    { key: 'rangeRef', label: '数据源', type: 'range', group: '数据源' },
  ],
  eventSchema: [{ key: 'onClick', label: '点击', description: '点击图表时触发' }],
  defaultSize: { w: 360, h: 220 },
  render: ChartRender,
});

function ChartRender({ component }: { component: DesignComponent }) {
  const tables = useProjectStore((s) => s.project?.srcTable || []);
  const rangeRef = component.props.rangeRef;

  // 稳定化 resolved 数据引用
  const resolved = useMemo(
    () => rangeRef ? resolveRange(rangeRef, tables) : null,
    [rangeRef?.tableId, rangeRef?.sheetName, rangeRef?.startRow, rangeRef?.startCol, rangeRef?.endRow, rangeRef?.endCol, rangeRef?.firstRowIsHeader, tables]
  );

  const rawData = useMemo(() => resolved?.data ?? null, [resolved]);
  const headers = useMemo(() => resolved?.headers ?? null, [resolved]);

  // 稳定化维度/指标引用
  const userDims = component.props.dimensions as number[] | null | undefined;
  const userMets = component.props.metrics as MetricConfig[] | null | undefined;

  const hasManualConfig = (Array.isArray(userDims) && userDims.length > 0) || (Array.isArray(userMets) && userMets.length > 0);

  // 自动推断（仅在无手动配置时）
  const inferred = useMemo(() => {
    if (!headers || !rawData || hasManualConfig) return null;
    return inferDimMetrics(headers, rawData);
  }, [headers, rawData, hasManualConfig]);

  const dimsArr = useMemo(() => {
    if (hasManualConfig && Array.isArray(userDims)) return userDims;
    return inferred?.dims ?? [];
  }, [hasManualConfig, userDims, inferred]);

  const metsArr: MetricConfig[] = useMemo(() => {
    if (hasManualConfig && Array.isArray(userMets)) return userMets;
    return inferred?.mets ?? [];
  }, [hasManualConfig, userMets, inferred]);

  return (
    <div style={{ ...ios.glass, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px 0', flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 650, color: '#1c1c1e' }}>{component.props.title || '图表'}</span>
        {headers && dimsArr.length > 0 && metsArr.length > 0 && (
          <span style={{ fontSize: 10, color: '#8e8e93', marginLeft: 8 }}>
            维度:{dimsArr.map(d => headers[d] || `C${d}`).join(', ')}
            {' · '}指标:{metsArr.map(m => `${headers[m.col] || `C${m.col}`}(${m.agg})`).join(', ')}
            {!hasManualConfig && <em style={{ fontStyle: 'normal', color: '#34c759', marginLeft: 4 }}>自动</em>}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: '6px 10px 10px' }}>
        <ChartWidget
          chartType={component.props.chartType || 'bar'}
          title=""
          data={component.props.chartData || undefined}
          rawData={rawData ?? undefined}
          headers={headers ?? undefined}
          dimensions={dimsArr.length > 0 ? dimsArr : undefined}
          metrics={metsArr.length > 0 ? metsArr : undefined}
          barColor={component.props.barColor || '#007aff'}
          lineColor={component.props.lineColor || '#ff9500'}
          showLegend={component.props.showLegend}
          showValues={component.props.showValues}
        />
      </div>
    </div>
  );
}
