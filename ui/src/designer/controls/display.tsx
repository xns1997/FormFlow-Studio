import React, { useMemo } from 'react';
import { registerControl } from '../registry';
import type { DesignComponent } from '../../project/types';
import { controlText, ios } from './styles';
import ChartWidget from '../../components/ChartWidget';
import AnimatedNumber from '../../components/AnimatedNumber';
import type { MetricConfig } from '../../components/ChartWidget';
import { resolveRange } from '../../services/data/rangeResolver';
import { useProjectStore } from '../../project/store';
import { DesignerIcon } from '../icons';
import type { PreviewControlRuntime } from '../types';
import { normalizeDataBinding } from '../../services/data/dataBinding';

registerControl({
  type: 'text', label: '文本', category: 'display', icon: '📄',
  defaultProps: {
    content: '文本内容', contentTemplate: '', name: '',
    fontSize: 15, fontWeight: 'normal', fontFamily: '', color: '#1c1c1e',
    textAlign: 'left', letterSpacing: 0, lineHeight: 1.5, textDecoration: 'none',
    rangeRef: null,
  },
  propSchema: [
    { key: 'content', label: '内容', type: 'string', group: '基础' },
    { key: 'contentTemplate', label: '动态内容模板', type: 'string', editor: 'template', group: '表达式', help: '使用 {{form.字段名}} 插值并实时预览。' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { kind: 'composite', key: 'typography', keys: ['fontFamily', 'fontSize', 'fontWeight', 'color', 'lineHeight', 'letterSpacing', 'textAlign'], label: '字体与排版', editor: 'typography', group: '文本样式' },
    { key: 'textDecoration', label: '装饰', type: 'select', group: '文本样式', options: [
      { label: '无', value: 'none' }, { label: '下划线', value: 'underline' },
      { label: '删除线', value: 'line-through' }, { label: '上划线', value: 'overline' },
    ]},
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [],
  defaultSize: { w: 180, h: 36 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const hasExplicitBinding = Boolean(
      component.fieldBinding
      || component.props.rangeRef
      || component.props.tableBinding,
    );
    const previewValue = mode === 'preview' && hasExplicitBinding ? runtime?.value : undefined;
    const content = previewValue ?? component.props.content ?? '文本';
    return (
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
          {String(content)}
        </span>
      </div>
    );
  },
});

function formatTableCell(value: unknown, type?: string, format?: string) {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    const digits = format?.match(/0\.(0+)/)?.[1].length;
    return new Intl.NumberFormat('zh-CN', digits === undefined ? undefined : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(number);
  }
  if (type === 'date') {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return format === 'datetime' ? date.toLocaleString('zh-CN') : date.toLocaleDateString('zh-CN');
  }
  if (type === 'boolean') return value === true || value === 'true' || value === 1 ? '是' : '否';
  return String(value);
}

registerControl({
  type: 'image', label: '图片', category: 'display', icon: '🖼️',
  defaultProps: {
    src: '', alt: '图片', name: '', fit: 'cover', borderRadius: 0, opacity: 1,
    rangeRef: null,
  },
  propSchema: [
    { key: 'src', label: '图片 URL', type: 'string', editor: 'url', group: '基础', validation: { pattern: '^https?://' } },
    { key: 'alt', label: '替代文本', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'fit', label: '填充方式', type: 'select', group: '样式', options: [
      { label: '覆盖', value: 'cover' }, { label: '包含', value: 'contain' },
      { label: '拉伸', value: 'fill' }, { label: '适应', value: 'scale-down' },
    ]},
    { key: 'borderRadius', label: '圆角', type: 'number', editor: 'radius', group: '样式', min: 0, max: 100 },
    { key: 'opacity', label: '透明度', type: 'number', editor: 'opacity', group: '样式', min: 0, max: 1, step: 0.1 },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onClick', label: '点击', description: '点击图片时触发' }],
  defaultSize: { w: 240, h: 160 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => (
    <div role={mode === 'preview' ? 'button' : undefined} aria-label={mode === 'preview' ? String(component.props.alt || '图片') : undefined} tabIndex={mode === 'preview' ? 0 : -1} onClick={() => mode === 'preview' && runtime?.emit('onClick', component.props.src)} onKeyDown={(event) => { if (mode === 'preview' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); runtime?.emit('onClick', component.props.src); } }} style={{ ...ios.glass, cursor: mode === 'preview' ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(118,118,128,0.08)', borderRadius: component.props.borderRadius || 0 }}>
      {component.props.src ? (
        <img src={component.props.src} alt={component.props.alt || ''} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: component.props.fit || 'cover', borderRadius: component.props.borderRadius || 0, opacity: component.props.opacity ?? 1 }} />
      ) : (
        <span style={{ fontSize: 24, opacity: 0.2 }}><DesignerIcon name="image" size={24} /></span>
      )}
    </div>
  ),
});

registerControl({
  type: 'animatedNumber', label: '跳动数字', category: 'display', icon: '🔢',
  defaultProps: {
    content: '0', name: '',
    fontSize: 32, fontWeight: 'bold', fontFamily: '', color: '#2563eb',
    textAlign: 'left', letterSpacing: 0, lineHeight: 1.2, textDecoration: 'none',
    duration: 1200, decimals: 0, prefix: '', suffix: '', useGrouping: true,
    rangeRef: null,
  },
  propSchema: [
    { key: 'content', label: '默认值', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'duration', label: '动画时长(ms)', type: 'number', group: '动画', min: 0, max: 6000, step: 100 },
    { key: 'decimals', label: '小数位', type: 'number', group: '动画', min: 0, max: 6 },
    { key: 'prefix', label: '前缀', type: 'string', group: '格式' },
    { key: 'suffix', label: '后缀', type: 'string', group: '格式' },
    { key: 'useGrouping', label: '千分位', type: 'boolean', group: '格式' },
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
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [],
  defaultSize: { w: 200, h: 44 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const hasExplicitBinding = Boolean(
      component.fieldBinding
      || component.props.rangeRef
      || component.props.tableBinding,
    );
    const previewValue = mode === 'preview' && hasExplicitBinding ? runtime?.value : undefined;
    const content = previewValue == null || previewValue === '' ? (component.props.content ?? '0') : previewValue;
    const textStyle = controlText({
      fontSize: component.props.fontSize || 32,
      fontWeight: component.props.fontWeight || 'bold',
      fontFamily: component.props.fontFamily || undefined,
      color: component.props.color || '#2563eb',
      textAlign: component.props.textAlign || 'left',
      letterSpacing: component.props.letterSpacing || 0,
      lineHeight: component.props.lineHeight || 1.2,
      textDecoration: component.props.textDecoration || 'none',
    });
    return (
      <div style={{ width: '100%', height: '100%', minWidth: 0, display: 'flex', alignItems: 'center', padding: '0 2px', boxSizing: 'border-box', overflow: 'hidden' }}>
        <AnimatedNumber
          value={content}
          duration={Number(component.props.duration) || 1200}
          decimals={Number(component.props.decimals) || 0}
          prefix={String(component.props.prefix ?? '')}
          suffix={String(component.props.suffix ?? '')}
          useGrouping={component.props.useGrouping !== false}
          style={textStyle}
        />
      </div>
    );
  },
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
    { key: 'columns', label: '表格列', type: 'json', editor: 'table-columns', group: '数据' },
    { key: 'rows', label: '行数', type: 'number', group: '数据', min: 1, max: 50 },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '数据', placeholder: 'field_name' },
    { key: 'headerBackground', label: '表头背景', type: 'color', group: '样式' },
    { key: 'headerColor', label: '表头文字颜色', type: 'color', group: '样式' },
    { key: 'headerFontWeight', label: '表头字重', type: 'select', group: '样式', options: [
      { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '粗体', value: '600' },
    ]},
    { key: 'cellColor', label: '单元格文字颜色', type: 'color', group: '样式' },
    { key: 'showGrid', label: '显示网格线', type: 'boolean', group: '样式' },
    { key: 'striped', label: '斑马纹', type: 'boolean', group: '样式' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onRowClick', label: '行点击', description: '点击表格行时触发' }],
  defaultSize: { w: 560, h: 240 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const configuredColumns = (Array.isArray(component.props.columns) ? component.props.columns : ['列A', '列B']).map((column: unknown, index: number) => {
      if (column && typeof column === 'object') {
        const record = column as Record<string, unknown>;
        return { title: String(record.title || record.label || record.dataIndex || `列${index + 1}`), key: String(record.dataIndex || record.key || record.title || `列${index + 1}`), width: Number(record.width || 0), type: String(record.type || 'text'), format: String(record.format || ''), visible: record.visible !== false && record.visible !== 'hide' };
      }
      return { title: String(column), key: String(column), width: 0, type: 'text', format: '', visible: true };
    }).filter((column) => column.visible);
    const rawRows = Array.isArray(runtime?.value)
      ? runtime.value
      : Array.isArray(component.props.data)
        ? component.props.data
        : [];
    const normalizedRows = rawRows
      .map((row) => {
        if (row && typeof row === 'object' && !Array.isArray(row)) return row as Record<string, unknown>;
        if (Array.isArray(row)) {
          return Object.fromEntries(row.map((cell, index) => [configuredColumns[index]?.key || `列${index + 1}`, cell]));
        }
        return { value: row };
      });
    const derivedColumns = normalizedRows.length > 0
      ? [...new Set(normalizedRows.flatMap((row) => Object.keys(row)))]
      : [];
    const cols = configuredColumns.length > 0 ? configuredColumns : derivedColumns.map((key) => ({ title: key, key, width: 0, type: 'text', format: '', visible: true }));
    const placeholderRows = Math.max(1, Number(component.props.rows) || 3);
    const displayRows = normalizedRows.length > 0
      ? normalizedRows
      : Array.from({ length: placeholderRows }, () => Object.fromEntries(cols.map((column) => [column.key, '—'])));
    return (
      <div style={ios.glass}>
        <table style={{ width: '100%', minWidth: 0, borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {cols.map((c, i: number) => (
                <th key={c.key || i} style={{ width: c.width || undefined, padding: '8px 10px', textAlign: 'left', fontWeight: component.props.headerFontWeight || 600, color: component.props.headerColor || '#8e8e93', fontSize: 12, borderBottom: component.props.showGrid !== false ? '0.5px solid rgba(60,60,67,0.08)' : 'none', background: component.props.headerBackground || 'rgba(118,118,128,0.06)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, r) => (
              <tr
                key={r}
                onClick={() => mode === 'preview' && runtime?.emit('onRowClick', r, { rowIndex: r, row })}
                style={{ cursor: mode === 'preview' ? 'pointer' : 'default' }}
              >
                {cols.map((column, c: number) => (
                  <td key={column.key || c} style={{ padding: '9px 10px', borderBottom: component.props.showGrid !== false && r < displayRows.length - 1 ? '0.5px solid rgba(60,60,67,0.06)' : 'none', color: component.props.cellColor || '#3a3a3c', background: component.props.striped && r % 2 === 1 ? 'rgba(118,118,128,0.03)' : 'transparent', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatTableCell(row[column.key], column.type, column.format)}</td>
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
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', placeholder: 'field_name' },
    { key: 'chartData', label: '自定义数据 (JSON)', type: 'json', group: '数据' },
    { key: '__dimMetric', label: '', type: 'dimMetric' as any, group: '维度/指标' },
    { key: 'barColor', label: '主色', type: 'color', group: '样式' },
    { key: 'lineColor', label: '辅色', type: 'color', group: '样式' },
    { key: 'showLegend', label: '显示图例', type: 'boolean', group: '样式' },
    { key: 'showValues', label: '显示数值', type: 'boolean', group: '样式' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onClick', label: '点击', description: '点击图表时触发' }],
  defaultSize: { w: 360, h: 220 },
  render: ChartRender,
});

function ChartRender({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) {
  const tables = useProjectStore((s) => s.project?.srcTable || []);
  const binding = normalizeDataBinding(component);
  const rangeRef = binding?.source.kind === 'range' ? binding.source.ref : component.props.rangeRef;

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
    <div role={mode === 'preview' ? 'button' : undefined} aria-label={mode === 'preview' ? String(component.props.title || '图表') : undefined} tabIndex={mode === 'preview' ? 0 : -1} onClick={() => mode === 'preview' && runtime?.emit('onClick')} onKeyDown={(event) => { if (mode === 'preview' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); runtime?.emit('onClick'); } }} style={{ ...ios.glass, cursor: mode === 'preview' ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
